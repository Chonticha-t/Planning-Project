const express = require("express");
const router = express.Router();

const { pool_smart } = require("../../config");
const query = (text, params) => pool_smart.query(text, params);

// ป้องกัน Browser หรือ Proxy จำค่าเก่าเวลาดึงข้อมูลผ่าน AJAX
const setNoCache = (res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
};

// ── SSE (Server-Sent Events) Real-time Sync ────────────────────────
const sseClients = new Set();

const broadcastChange = () => {
  const payload = `data: ${JSON.stringify({ type: "PLANNING_SUMMARY_UPDATED", timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
      if (typeof client.flush === "function") client.flush();
    } catch {
      sseClients.delete(client);
    }
  }
};

/**
 * 🔄 ฟังก์ชันจัดสรรคิว PO และ WIP ใหม่ตามลำดับ FIFO (seq DESC, lot_no ASC)
 * โดยห้ามนำ Lot ที่อยู่ใน planning.planning_lot_skip ไปลงใน Due Date ที่ <= skipped_due_date
 */
const reallocateProductWithSkips = async (client, prdName) => {
  const summaryRes = await client.query(
    `
      SELECT
        prd_name,
        item,
        to_char(due_date, 'YYYY-MM-DD') AS due_date,
        to_char(ship_to_p1, 'YYYY-MM-DD') AS ship_to_p1,
        priority,
        day_left::int4 AS day_left,
        po_bal::float8 AS po_bal,
        inventory::float8 AS inventory,
        net_required_pcs::float8 AS net_required_pcs,
        cal_net_required::float8 AS cal_net_required,
        status,
        lot_no,
        proc_disp,
        seq::int4 AS seq,
        net_wip_qty::float8 AS net_wip_qty,
        rem_wip_qty::float8 AS rem_wip_qty,
        factory_desc,
        prd_type,
        gate_name,
        yield::float8 AS yield,
        lot_status,
        lot_problem,
        pending_reason
      FROM planning.planning_summary
      WHERE prd_name = $1
        AND (status IS NULL OR LOWER(status) != 'ready')
      ORDER BY due_date ASC, seq DESC NULLS LAST, lot_no ASC
    `,
    [prdName]
  );

  const currentRows = summaryRes.rows;
  if (currentRows.length === 0) {
    return { assignedDueDateByLot: new Map(), newSummaryRows: [] };
  }

  const skipRes = await client.query(
    `
      SELECT
        lot_no,
        to_char(skipped_due_date, 'YYYY-MM-DD') AS skipped_due_date
      FROM planning.planning_lot_skip
      WHERE prd_name = $1
    `,
    [prdName]
  );

  const skipMap = new Map();
  for (const s of skipRes.rows) {
    if (s.lot_no && s.skipped_due_date) {
      skipMap.set(String(s.lot_no).trim(), s.skipped_due_date);
    }
  }

  // 1. จัดกลุ่ม PO ตาม Due Date (เรียง due_date ASC)
  const poMap = new Map();
  for (const r of currentRows) {
    const due = r.due_date;
    if (!poMap.has(due)) {
      poMap.set(due, {
        prd_name: r.prd_name,
        item: r.item,
        due_date: due,
        ship_to_p1: r.ship_to_p1,
        day_left: r.day_left,
        po_bal: r.po_bal,
        inventory: r.inventory,
        net_required_pcs: Number(r.net_required_pcs) || 0,
        prd_type: r.prd_type,
        cal_sum: 0,
        base_priority: null,
        first_priority: r.priority || "Normal",
      });
    }
    const po = poMap.get(due);
    po.cal_sum += Number(r.cal_net_required) || 0;
    if (!po.item && r.item) po.item = r.item;
    if (!po.prd_type && r.prd_type) po.prd_type = r.prd_type;

    const st = (r.status || "").toLowerCase().trim();
    if (st === "need wip" || r.gate_name === "PRE_FFPC") {
      if (r.priority) po.base_priority = r.priority;
    }
  }

  const poList = Array.from(poMap.values()).sort((a, b) =>
    String(a.due_date).localeCompare(String(b.due_date))
  );

  for (const po of poList) {
    po.total_needed = po.cal_sum > 0 ? po.cal_sum : po.net_required_pcs;
    if (!po.base_priority) {
      if (po.day_left !== null && po.day_left !== undefined) {
        let leadDays = 2;
        if (po.due_date && po.ship_to_p1) {
          const diffMs =
            new Date(`${po.due_date}T00:00:00Z`).getTime() -
            new Date(`${po.ship_to_p1}T00:00:00Z`).getTime();
          const diffDays = Math.round(diffMs / 86400000);
          if (diffDays > 0) leadDays = diffDays;
        }
        if (po.day_left <= leadDays) po.base_priority = "Urgent";
        else if (po.day_left <= leadDays + 3) po.base_priority = "High";
        else po.base_priority = "Normal";
      } else {
        po.base_priority = po.first_priority || "Normal";
      }
    }
  }

  // 2. รวบรวม WIP Lots ทั้งหมดของ prd_name นี้ แล้วเรียงตาม FIFO (seq DESC NULLS LAST, lot_no ASC)
  const lotMap = new Map();
  for (const r of currentRows) {
    const lotNo = r.lot_no ? String(r.lot_no).trim() : "";
    if (!lotNo) continue;

    if (!lotMap.has(lotNo)) {
      lotMap.set(lotNo, {
        lot_no: lotNo,
        item: r.item,
        proc_disp: r.proc_disp,
        seq: r.seq !== null && r.seq !== undefined ? Number(r.seq) : null,
        net_wip_qty: Number(r.net_wip_qty) || 0,
        remaining_wip: Number(r.net_wip_qty) || 0,
        factory_desc: r.factory_desc,
        prd_type: r.prd_type,
        gate_name: r.gate_name,
        yield: r.yield,
        lot_status: r.lot_status,
        lot_problem: r.lot_problem,
        pending_reason: r.pending_reason,
      });
    } else {
      const existing = lotMap.get(lotNo);
      const wip = Number(r.net_wip_qty) || 0;
      if (wip > existing.net_wip_qty) {
        existing.net_wip_qty = wip;
        existing.remaining_wip = wip;
      }
    }
  }

  const lotList = Array.from(lotMap.values()).sort((a, b) => {
    const seqA = a.seq ?? -999999;
    const seqB = b.seq ?? -999999;
    if (seqB !== seqA) return seqB - seqA; // seq DESC NULLS LAST
    return String(a.lot_no).localeCompare(String(b.lot_no)); // lot_no ASC (FIFO)
  });

  // 3. จับคู่ WIP Lots เข้ากับแต่ละ PO ตามลำดับ Due Date และ FIFO
  const newSummaryRows = [];
  const assignedDueDateByLot = new Map();

  for (const po of poList) {
    let poRemaining = po.total_needed;

    for (const lot of lotList) {
      if (poRemaining <= 0) break;
      if (lot.remaining_wip <= 0) continue;

      // กฎ Skip Due: ห้ามนำ Lot ที่ถูก Skip ไปใส่ใน Due Date ที่ <= skipped_due_date
      const skippedDue = skipMap.get(lot.lot_no);
      if (skippedDue && po.due_date <= skippedDue) {
        continue;
      }

      const allocated = Math.min(poRemaining, lot.remaining_wip);
      lot.remaining_wip -= allocated;
      poRemaining -= allocated;
      const remWipQty = lot.remaining_wip - poRemaining;

      const rowPriority =
        lot.gate_name && lot.gate_name !== "PRE_FFPC"
          ? "Normal"
          : po.base_priority;

      if (!assignedDueDateByLot.has(lot.lot_no)) {
        assignedDueDateByLot.set(lot.lot_no, po.due_date);
      }

      newSummaryRows.push({
        prd_name: po.prd_name,
        item: lot.item || po.item,
        due_date: po.due_date,
        ship_to_p1: po.ship_to_p1,
        priority: rowPriority,
        day_left: po.day_left,
        po_bal: po.po_bal,
        inventory: po.inventory,
        net_required_pcs: po.net_required_pcs,
        cal_net_required: allocated,
        status: "production plan",
        lot_no: lot.lot_no,
        proc_disp: lot.proc_disp,
        seq: lot.seq,
        net_wip_qty: lot.net_wip_qty,
        rem_wip_qty: remWipQty,
        factory_desc: lot.factory_desc,
        prd_type: lot.prd_type || po.prd_type,
        gate_name: lot.gate_name,
        yield: lot.yield,
        lot_status: lot.lot_status,
        lot_problem: lot.lot_problem,
        pending_reason: lot.pending_reason,
      });
    }

    // หากยอดของ Due Date นี้ยังขาดอยู่ ให้แสดงแถว need wip
    if (poRemaining > 0) {
      newSummaryRows.push({
        prd_name: po.prd_name,
        item: po.item,
        due_date: po.due_date,
        ship_to_p1: po.ship_to_p1,
        priority: po.base_priority,
        day_left: po.day_left,
        po_bal: po.po_bal,
        inventory: po.inventory,
        net_required_pcs: po.net_required_pcs,
        cal_net_required: poRemaining,
        status: "need wip",
        lot_no: null,
        proc_disp: null,
        seq: null,
        net_wip_qty: null,
        rem_wip_qty: null,
        factory_desc: null,
        prd_type: po.prd_type,
        gate_name: null,
        yield: null,
        lot_status: null,
        lot_problem: null,
        pending_reason: null,
      });
    }
  }

  // 4. แทนที่แถวของ prd_name นี้ใน planning.planning_summary
  await client.query(
    `
      DELETE FROM planning.planning_summary
      WHERE prd_name = $1
        AND (status IS NULL OR LOWER(status) != 'ready')
    `,
    [prdName]
  );

  for (const row of newSummaryRows) {
    await client.query(
      `
        INSERT INTO planning.planning_summary (
          prd_name,
          item,
          due_date,
          ship_to_p1,
          priority,
          day_left,
          po_bal,
          inventory,
          net_required_pcs,
          cal_net_required,
          status,
          lot_no,
          proc_disp,
          seq,
          net_wip_qty,
          rem_wip_qty,
          factory_desc,
          prd_type,
          gate_name,
          yield,
          lot_status,
          lot_problem,
          pending_reason,
          updated_at
        ) VALUES (
          $1, $2, $3::date, $4::date, $5, $6::int4,
          $7::numeric, $8::numeric, $9::numeric, $10::numeric,
          $11, $12, $13, $14::int4, $15::numeric, $16::numeric,
          $17, $18, $19, $20::numeric, $21, $22, $23, CURRENT_TIMESTAMP
        )
      `,
      [
        row.prd_name,
        row.item,
        row.due_date,
        row.ship_to_p1,
        row.priority,
        row.day_left,
        row.po_bal,
        row.inventory,
        row.net_required_pcs,
        row.cal_net_required,
        row.status,
        row.lot_no,
        row.proc_disp,
        row.seq,
        row.net_wip_qty,
        row.rem_wip_qty,
        row.factory_desc,
        row.prd_type,
        row.gate_name,
        row.yield,
        row.lot_status,
        row.lot_problem,
        row.pending_reason,
      ]
    );
  }

  // 5. อัปเดตคอลัมน์ due_date (Due Date ใหม่ที่ย้ายไปลง) ในตาราง planning.planning_lot_skip
  for (const [lotNo] of skipMap.entries()) {
    const newTargetDue = assignedDueDateByLot.get(lotNo) || null;
    await client.query(
      `
        UPDATE planning.planning_lot_skip
        SET due_date = $2::date,
            updated_at = CURRENT_TIMESTAMP
        WHERE lot_no = $1
      `,
      [lotNo, newTargetDue]
    );
  }

  return { assignedDueDateByLot, newSummaryRows };
};

let lastDbFingerprint = null;
let isCheckingDb = false;

// Backend ตรวจจับการเปลี่ยนแปลงใน Database ทุกๆ 2.5 วินาที (เฉพาะเมื่อมีหน้าเว็บเปิดค้างอยู่)
setInterval(async () => {
  if (sseClients.size === 0 || isCheckingDb) return;
  isCheckingDb = true;

  try {
    // ตรวจสอบว่ามี Lot ที่เคยกด Skip ไว้ถูก Script รายชั่วโมงรีเซ็ตกลับมาที่ <= skipped_due_date หรือไม่
    const conflictCheck = await query(`
      SELECT DISTINCT ps.prd_name
      FROM planning.planning_summary ps
      INNER JOIN planning.planning_lot_skip ls ON ls.lot_no = ps.lot_no
      WHERE ps.due_date <= ls.skipped_due_date
        AND UPPER(COALESCE(ps.lot_status, '')) = 'PENDING'
        AND (ps.status IS NULL OR LOWER(ps.status) != 'ready')
    `);

    if (conflictCheck.rows.length > 0) {
      const client = await pool_smart.connect();
      try {
        await client.query("BEGIN");
        for (const r of conflictCheck.rows) {
          await reallocateProductWithSkips(client, r.prd_name);
        }
        await client.query("COMMIT");
      } catch {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }

    const queryStr = `
      SELECT
        to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS.US') AS max_updated_at,
        COUNT(*)::int AS total_rows,
        COALESCE(SUM(net_required_pcs), 0)::float8 AS total_net_required,
        COALESCE(SUM(net_wip_qty), 0)::float8 AS total_net_wip,
        COUNT(*) FILTER (WHERE UPPER(priority) = 'URGENT' OR priority = 'P1')::int AS urgent_count,
        COUNT(*) FILTER (WHERE UPPER(priority) = 'HIGH' OR priority = 'P2')::int AS high_count,
        COUNT(*) FILTER (WHERE UPPER(lot_status) = 'WIP')::int AS wip_count,
        COUNT(*) FILTER (WHERE UPPER(lot_status) = 'HOLD')::int AS hold_count,
        COUNT(*) FILTER (WHERE UPPER(lot_status) = 'PENDING')::int AS pending_count,
        COUNT(*) FILTER (WHERE TRIM(item) LIKE '94%')::int AS fpc_rows
      FROM planning.planning_summary
      WHERE (status IS NULL OR LOWER(status) != 'ready')
    `;
    const { rows } = await query(queryStr);
    const row = rows[0];
    if (row) {
      const fingerprint = [
        row.max_updated_at,
        row.total_rows,
        row.total_net_required,
        row.total_net_wip,
        row.urgent_count,
        row.high_count,
        row.wip_count,
        row.hold_count,
        row.pending_count,
        row.fpc_rows,
      ].join("|");

      if (lastDbFingerprint !== null && fingerprint !== lastDbFingerprint) {
        broadcastChange();
      }
      lastDbFingerprint = fingerprint;
    }
  } catch {
    // ป้องกัน background query error รบกวน console
  } finally {
    isCheckingDb = false;
  }
}, 2500);

// GET /api_p1/planning/planning_summary/stream — ท่อเชื่อมต่อ SSE แบบ Real-time
router.get("/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: "CONNECTED" })}\n\n`);
  if (typeof res.flush === "function") res.flush();

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");
      if (typeof res.flush === "function") res.flush();
    } catch {
      clearInterval(heartbeat);
      sseClients.delete(res);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

// GET /api_p1/planning/planning_summary/test_notify — สำหรับทดสอบสั่งให้หน้าเว็บอัปเดตข้อมูลทันทีโดยไม่ต้องแก้ DB
router.get("/test_notify", (req, res) => {
  setNoCache(res);
  broadcastChange();
  return res.json({
    status: "OK",
    message: `Broadcasted update event to ${sseClients.size} client(s).`,
    clients_count: sseClients.size,
  });
});

// Helper แปลง query parameter ให้เป็น string ที่ปลอดภัยเสมอ
const asStr = (val) => {
  if (Array.isArray(val)) return String(val[0] ?? "").trim();
  return typeof val === "string" ? val.trim() : "";
};

// Helper ป้องกันอักขระพิเศษ %, _, \ ใน LIKE / ILIKE
const escapeLike = (str) => str.replace(/[\\%_]/g, "\\$&");

// Helper ตรวจสอบวันที่รูปแบบ YYYY-MM-DD ที่ถูกต้องตามปฏิทินจริง
const isValidDateParam = (str) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
};

/**
 * Helper build WHERE conditions for filters
 */
const buildWhereClause = (queryParams) => {
  const prd_name = asStr(queryParams.prd_name);
  const lot_no = asStr(queryParams.lot_no);
  const search = asStr(queryParams.search);
  const status = asStr(queryParams.status);
  const priority = asStr(queryParams.priority);
  const lot_status = asStr(queryParams.lot_status);
  const factory_desc = asStr(queryParams.factory_desc);
  const startdate = asStr(queryParams.startdate);
  const stopdate = asStr(queryParams.stopdate);
  const item_prefix = asStr(queryParams.item_prefix || queryParams.type);

  if (startdate && !isValidDateParam(startdate)) {
    return { error: "Invalid startdate format. Expected YYYY-MM-DD." };
  }
  if (stopdate && !isValidDateParam(stopdate)) {
    return { error: "Invalid stopdate format. Expected YYYY-MM-DD." };
  }

  const conditions = [];
  const params = [];

  // ❌ ไม่นำ status = 'ready' มาแสดง
  conditions.push(`(status IS NULL OR LOWER(status) != 'ready')`);

  // 🔍 ค้นหาคำค้นได้ทั้งจากชื่อ Product และ Lot No ในช่องเดียวกัน
  const searchTerm = prd_name || search;
  if (searchTerm !== "") {
    params.push(`%${escapeLike(searchTerm)}%`);
    conditions.push(`(prd_name ILIKE $${params.length} ESCAPE '\\' OR lot_no ILIKE $${params.length} ESCAPE '\\')`);
  } else if (lot_no !== "") {
    params.push(`%${escapeLike(lot_no)}%`);
    conditions.push(`lot_no ILIKE $${params.length} ESCAPE '\\'`);
  }

  if (priority !== "") {
    params.push(priority);
    conditions.push(`priority = $${params.length}`);
  }

  if (item_prefix !== "") {
    params.push(`${escapeLike(item_prefix)}%`);
    conditions.push(`TRIM(item) LIKE $${params.length} ESCAPE '\\'`);
  }

  if (status !== "") {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (lot_status !== "") {
    params.push(lot_status);
    conditions.push(`lot_status = $${params.length}`);
  }

  if (factory_desc !== "") {
    params.push(factory_desc);
    conditions.push(`factory_desc = $${params.length}`);
  }

  if (startdate) {
    params.push(startdate);
    conditions.push(`due_date >= $${params.length}::date`);
  }

  if (stopdate) {
    params.push(stopdate);
    conditions.push(`due_date <= $${params.length}::date`);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereSql, params };
};

/**
 * 📋 1. GET /table: รายการข้อมูล Planning Summary สำหรับตาราง
 */
router.get("/table", async (req, res) => {
  setNoCache(res);
  const { whereSql, params, error } = buildWhereClause(req.query);
  if (error) {
    return res.status(400).json({
      status: "ERROR",
      data: [],
      message: error,
    });
  }

  try {
    const sql = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY due_date ASC, prd_name ASC, seq DESC NULLS LAST, lot_no ASC)::int AS id,
        prd_name,
        item,
        to_char(due_date, 'YYYY-MM-DD') AS due_date,
        to_char(ship_to_p1, 'YYYY-MM-DD') AS ship_to_p1,
        priority,
        day_left::int4,
        po_bal::float8,
        inventory::float8,
        net_required_pcs::float8,
        cal_net_required::float8,
        status,
        lot_no,
        proc_disp,
        seq::int4,
        net_wip_qty::float8,
        rem_wip_qty::float8,
        factory_desc,
        prd_type,
        gate_name,
        yield::float8,
        lot_status,
        lot_problem,
        pending_reason,
        (
          SELECT to_char(ls.skipped_due_date, 'YYYY-MM-DD')
          FROM planning.planning_lot_skip ls
          WHERE ls.lot_no = planning.planning_summary.lot_no
          LIMIT 1
        ) AS skipped_due_date,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
      FROM planning.planning_summary
      ${whereSql}
      ORDER BY due_date ASC, prd_name ASC, seq DESC NULLS LAST, lot_no ASC
    `;

    const { rows } = await query(sql, params);

    return res.json({
      status: "OK",
      data: rows,
      message: rows.length > 0 ? "Data found." : "No data found.",
    });
  } catch (err) {
    console.error("Error in GET /planning_summary/table:", err);
    return res.status(500).json({
      status: "ERROR",
      data: [],
      message: err.message || "Internal server error",
    });
  }
});

/**
 * ⏭️ POST /skip_due: กดปุ่ม Skip Due สำหรับ Lot ที่ติดสถานะ PENDING
 * - บันทึกข้อมูลลง planning.planning_lot_skip
 * - ย้าย Lot ที่กด Skip ข้ามไปเกาะที่ Due Date ถัดไปที่ใกล้ที่สุด (หรือเก็บไว้รอหากยังไม่มี Due Date ถัดไป)
 * - ดึง Lot ปกติถัดไปขึ้นมาเสียบแทนที่ Due Date เดิม และเรียงลำดับ FIFO (seq DESC, lot_no ASC) ใหม่
 */
router.post("/skip_due", async (req, res) => {
  setNoCache(res);
  const prd_name = asStr(req.body?.prd_name);
  const lot_no = asStr(req.body?.lot_no);
  const due_date = asStr(req.body?.due_date);
  const process = asStr(req.body?.process || req.body?.proc_disp);
  const seqRaw = req.body?.seq;
  const seq =
    seqRaw !== null && seqRaw !== undefined && seqRaw !== ""
      ? Number(seqRaw)
      : null;

  if (!prd_name || !lot_no || !due_date || !isValidDateParam(due_date)) {
    return res.status(400).json({
      status: "ERROR",
      data: null,
      message: "Required fields: prd_name, lot_no, and valid due_date (YYYY-MM-DD).",
    });
  }

  const client = await pool_smart.connect();
  try {
    await client.query("BEGIN");

    // 1. ค้นหา Due Date ถัดไปที่ใกล้ที่สุดของสินค้านี้ (> due_date ที่กด Skip)
    const nextDueRes = await client.query(
      `
        SELECT to_char(MIN(due_date), 'YYYY-MM-DD') AS next_due_date
        FROM planning.planning_summary
        WHERE prd_name = $1
          AND due_date > $2::date
          AND (status IS NULL OR LOWER(status) != 'ready')
      `,
      [prd_name, due_date]
    );
    const initialNextDue = nextDueRes.rows[0]?.next_due_date || null;

    // 2. บันทึกหรืออัปเดตลงตาราง planning.planning_lot_skip
    await client.query(
      `
        INSERT INTO planning.planning_lot_skip (
          prd_name,
          lot_no,
          due_date,
          skipped_due_date,
          seq,
          process,
          updated_at
        )
        VALUES ($1, $2, $3::date, $4::date, $5::int4, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (lot_no) DO UPDATE SET
          prd_name = EXCLUDED.prd_name,
          due_date = EXCLUDED.due_date,
          skipped_due_date = GREATEST(planning.planning_lot_skip.skipped_due_date, EXCLUDED.skipped_due_date),
          seq = COALESCE(EXCLUDED.seq, planning.planning_lot_skip.seq),
          process = COALESCE(EXCLUDED.process, planning.planning_lot_skip.process),
          updated_at = CURRENT_TIMESTAMP
      `,
      [prd_name, lot_no, initialNextDue, due_date, seq, process || null]
    );

    // 3. คำนวณจับคู่ PO และเรียง FIFO ใหม่สำหรับ prd_name นี้ทันที
    const { assignedDueDateByLot } = await reallocateProductWithSkips(
      client,
      prd_name
    );

    const finalTargetDue =
      assignedDueDateByLot.get(lot_no) || initialNextDue || null;

    await client.query("COMMIT");

    // แจ้งเตือนหน้าเว็บผ่าน SSE ให้รีเฟรชตารางทันที
    broadcastChange();

    return res.json({
      status: "OK",
      data: {
        prd_name,
        lot_no,
        skipped_due_date: due_date,
        new_due_date: finalTargetDue,
        seq,
        process: process || null,
      },
      message: finalTargetDue
        ? `Skipped Lot ${lot_no} from ${due_date} to ${finalTargetDue}`
        : `Skipped Lot ${lot_no} from ${due_date} (waiting for next Due Date)`,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error in POST /planning_summary/skip_due:", err);
    return res.status(500).json({
      status: "ERROR",
      data: null,
      message: err.message || "Internal server error",
    });
  } finally {
    client.release();
  }
});

/**
 * 📊 2. GET /summary: ยอดสรุปภาพรวม KPI Cards
 */
router.get("/summary", async (req, res) => {
  setNoCache(res);
  const { whereSql, params, error } = buildWhereClause(req.query);
  if (error) {
    return res.status(400).json({
      status: "ERROR",
      data: {},
      message: error,
    });
  }

  try {
    const sql = `
      SELECT
        COUNT(*)::int AS total_rows,
        COUNT(DISTINCT prd_name)::int AS total_products,
        COUNT(DISTINCT lot_no) FILTER (WHERE lot_no IS NOT NULL AND lot_no <> '')::int AS total_lots,
        COALESCE(SUM(net_required_pcs), 0)::float8 AS total_net_required,
        COALESCE(SUM(net_wip_qty), 0)::float8 AS total_net_wip,
        COUNT(*) FILTER (WHERE UPPER(priority) = 'URGENT' OR priority = 'P1')::int AS urgent_count,
        COUNT(*) FILTER (WHERE UPPER(priority) = 'HIGH' OR priority = 'P2')::int AS high_count,
        COUNT(*) FILTER (WHERE UPPER(lot_status) = 'WIP')::int AS wip_count,
        COUNT(*) FILTER (WHERE UPPER(lot_status) = 'HOLD')::int AS hold_count,
        COUNT(*) FILTER (WHERE UPPER(lot_status) = 'PENDING')::int AS pending_count,
        to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS last_updated
      FROM planning.planning_summary
      ${whereSql}
    `;

    const { rows } = await query(sql, params);

    return res.json({
      status: "OK",
      data: rows[0] || {},
      message: "success",
    });
  } catch (err) {
    console.error("Error in GET /planning_summary/summary:", err);
    return res.status(500).json({
      status: "ERROR",
      data: {},
      message: err.message || "Internal server error",
    });
  }
});

/**
 * 🔽 3. GET /distinct_filters: ค่าตัวเลือกสำหรับ Filter Dropdowns (รองรับการกรองตาม item_prefix เหมือนหน้า PO Balance)
 */
router.get("/distinct_filters", async (req, res) => {
  setNoCache(res);
  const item_prefix = asStr(req.query.item_prefix);
  const params = [];
  let itemCondition = "";

  if (item_prefix !== "") {
    params.push(`${escapeLike(item_prefix)}%`);
    itemCondition = ` AND TRIM(item) LIKE $1 ESCAPE '\\'`;
  }

  try {
    const sql = `
      SELECT
        ARRAY(SELECT DISTINCT prd_name FROM planning.planning_summary WHERE prd_name IS NOT NULL AND (status IS NULL OR LOWER(status) != 'ready')${itemCondition} ORDER BY prd_name) AS products,
        ARRAY(SELECT DISTINCT lot_no FROM planning.planning_summary WHERE lot_no IS NOT NULL AND lot_no <> '' AND (status IS NULL OR LOWER(status) != 'ready')${itemCondition} ORDER BY lot_no) AS lot_nos,
        ARRAY(SELECT DISTINCT status FROM planning.planning_summary WHERE status IS NOT NULL AND status <> '' AND LOWER(status) != 'ready' ORDER BY status) AS statuses,
        ARRAY(SELECT DISTINCT priority FROM planning.planning_summary WHERE priority IS NOT NULL AND priority <> '' AND (status IS NULL OR LOWER(status) != 'ready') ORDER BY priority) AS priorities,
        ARRAY(SELECT DISTINCT lot_status FROM planning.planning_summary WHERE lot_status IS NOT NULL AND lot_status <> '' AND (status IS NULL OR LOWER(status) != 'ready') ORDER BY lot_status) AS lot_statuses,
        ARRAY(SELECT DISTINCT factory_desc FROM planning.planning_summary WHERE factory_desc IS NOT NULL AND factory_desc <> '' AND (status IS NULL OR LOWER(status) != 'ready') ORDER BY factory_desc) AS factories
    `;

    const { rows } = await query(sql, params);
    const result = rows[0] || { products: [], lot_nos: [], statuses: [], priorities: [], lot_statuses: [], factories: [] };

    return res.json({
      status: "OK",
      data: result,
      message: "success",
    });
  } catch (err) {
    console.error("Error in GET /planning_summary/distinct_filters:", err);
    return res.status(500).json({
      status: "ERROR",
      data: { products: [], lot_nos: [], statuses: [], priorities: [], lot_statuses: [], factories: [] },
      message: err.message || "Internal server error",
    });
  }
});

module.exports = router;
