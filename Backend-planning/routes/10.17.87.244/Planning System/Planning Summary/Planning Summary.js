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

let lastDbFingerprint = null;
let isCheckingDb = false;

// Backend ตรวจจับการเปลี่ยนแปลงใน Database ทุกๆ 2.5 วินาที (เฉพาะเมื่อมีหน้าเว็บเปิดค้างอยู่)
setInterval(async () => {
  if (sseClients.size === 0 || isCheckingDb) return;
  isCheckingDb = true;

  try {
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
