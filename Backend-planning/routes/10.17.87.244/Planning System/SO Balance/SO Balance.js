const express = require("express");
const router = express.Router();

const { pool_smart } = require("../../config");
const { verifyPlanner } = require("../Auth/Auth");
const query = (text, params) => pool_smart.query(text, params);

/** Realtime change-poll interval: PLANNING_REALTIME_POLL_MS, default 2500, minimum 1000. */
const realtimePollMs = () => {
  const value = Number(process.env.PLANNING_REALTIME_POLL_MS);
  return Number.isFinite(value) && value > 0 ? Math.max(1000, value) : 2500;
};

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
  const payload = `data: ${JSON.stringify({ type: "SO_BALANCE_UPDATED", timestamp: Date.now() })}\n\ndata: ${JSON.stringify({ type: "PO_BALANCE_UPDATED", timestamp: Date.now() })}\n\n`;
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
// ตรวจสอบทั้ง so_balance, so_price และ exchange_rate_monthly เพื่อ sync แบบ Real-time
// ปรับรอบได้ด้วย PLANNING_REALTIME_POLL_MS (ค่าเริ่มต้น 2500, ต่ำสุด 1000)
setInterval(async () => {
  if (sseClients.size === 0 || isCheckingDb) return;
  isCheckingDb = true;

  try {
    // One scan per table (the previous form scanned so_balance 8 times and so_price 3 times every poll).
    // Column names and values are unchanged, so the fingerprint is the same.
    const queryStr = `
      SELECT b.*, p.*, r.*
      FROM (
        SELECT
          to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS.US')                AS bal_updated_at,
          COUNT(*)::int                                                       AS bal_total_rows,
          -- The table column is so_bal (po_bal exists only in the view); po_bal made every poll fail.
          COALESCE(SUM(so_bal), 0)::float8                                    AS total_po_bal,
          COALESCE(SUM(unmovement), 0)::float8                                AS total_unmovement,
          COALESCE(SUM(f_g), 0)::float8                                       AS total_fg,
          COALESCE(SUM(net_required_pcs), 0)::float8                          AS total_net_required,
          COUNT(*) FILTER (WHERE status = 'ready')::int                       AS ready_rows,
          COUNT(*) FILTER (WHERE TRIM(item) LIKE '94%')::int                  AS fpc_rows
        FROM planning.so_balance
      ) b
      CROSS JOIN (
        SELECT
          to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS.US')                AS price_updated_at,
          COUNT(*)::int                                                       AS price_total_rows,
          COALESCE(SUM(price), 0)::float8                                     AS total_price
        FROM planning.so_price
      ) p
      CROSS JOIN (
        SELECT to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS.US')           AS rate_updated_at
        FROM planning.exchange_rate_monthly
      ) r
    `;
    const { rows } = await query(queryStr);
    const row = rows[0];
    if (row) {
      const fingerprint = [
        row.bal_updated_at,
        row.bal_total_rows,
        row.total_po_bal,
        row.total_unmovement,
        row.total_fg,
        row.total_net_required,
        row.ready_rows,
        row.fpc_rows,
        row.price_updated_at,
        row.price_total_rows,
        row.total_price,
        row.rate_updated_at,
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
}, realtimePollMs());

// GET /api_p1/planning/stream — ท่อเชื่อมต่อ SSE แบบ Real-time
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

// GET /api_p1/planning/test_notify — สำหรับทดสอบสั่งให้หน้าเว็บอัปเดตข้อมูลทันทีโดยไม่ต้องแก้ DB
router.get("/test_notify", (req, res) => {
  setNoCache(res);
  broadcastChange();
  return res.json({
    status: "OK",
    message: `Broadcasted update event to ${sseClients.size} client(s).`,
    clients_count: sseClients.size,
  });
});

// Helper แปลง query parameter ให้เป็น string ที่ปลอดภัยเสมอ (กันกรณีส่งซ้ำเป็น array เช่น ?status=a&status=b)
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

// สร้าง WHERE clause และ params ที่ใช้ร่วมกันระหว่าง /table และ /summary
const buildPlanningFilter = (queryObj) => {
  const status = asStr(queryObj.status);
  const prd_name = asStr(queryObj.prd_name);
  const startdate = asStr(queryObj.startdate);
  const stopdate = asStr(queryObj.stopdate);
  const item_prefix = asStr(queryObj.item_prefix);

  if (startdate && !isValidDateParam(startdate)) {
    return { error: "Invalid startdate format. Expected YYYY-MM-DD." };
  }
  if (stopdate && !isValidDateParam(stopdate)) {
    return { error: "Invalid stopdate format. Expected YYYY-MM-DD." };
  }

  const where = [];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`v.status = $${params.length}`);
  }
  if (prd_name) {
    params.push(`%${escapeLike(prd_name)}%`);
    where.push(`v.prd_name ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (startdate) {
    params.push(startdate);
    where.push(`v.due_date >= $${params.length}::date`);
  }
  if (stopdate) {
    params.push(stopdate);
    where.push(`v.due_date <= $${params.length}::date`);
  }
  if (item_prefix) {
    params.push(`${escapeLike(item_prefix)}%`);
    where.push(`TRIM(pb.item) LIKE $${params.length} ESCAPE '\\'`);
  }

  return { where, params };
};

// GET /api_p1/planning/table?status=ready&prd_name=ABC&startdate=2026-10-01&stopdate=2026-10-31&item_prefix=94
router.get("/table", async (req, res) => {
  setNoCache(res);
  const { where, params, error } = buildPlanningFilter(req.query);
  if (error) {
    return res.status(400).json({
      status: "ERROR",
      data: [],
      message: error,
    });
  }

  try {
    // numeric -> float8 เพื่อให้ได้ตัวเลขกลับไป / due_date -> text กันวันเลื่อนจาก timezone
    // ดึงจาก view v_so_amount (so_balance + ราคา + อัตราแลกเปลี่ยน) เพื่อได้ยอดเงิน W/H F/G และ Output (THB)
    const queryStr = `
      SELECT
        v.prd_name,
        pb.item                                         AS item,
        to_char(v.due_date, 'YYYY-MM-DD')               AS due_date,
        v.po_bal::float8                                AS po_bal,
        v.unmovement::float8                            AS unmovement,
        v.f_g::float8                                   AS f_g,

        v.net_required_pcs::float8                      AS net_required_pcs,
        v.rem_unmovement::float8                        AS rem_unmovement,
        v.rem_fg::float8                                AS rem_fg,
        v.wh_fg_amount::float8                          AS wh_fg_amount,
        v.output_amount::float8                         AS output_amount,
        v.status,
        to_char(v.updated_at, 'YYYY-MM-DD HH24:MI:SS')  AS updated_at,
        -- revision ล่าสุดของ SO/PO line ที่ยัง active อยู่ในวันส่งนี้
        (
          SELECT MAX(h.rev)::int
          FROM planning.so_balance_history_so_no h
          INNER JOIN smart.smart_pln_po_so_no c
            ON c.prd_name = h.prd_name
           AND c.due_date = h.due_date
           AND c.so_no = h.so_no
           AND c.po_no = h.po_no
          WHERE h.prd_name = v.prd_name AND h.due_date = v.due_date
        )                                               AS source_rev
      FROM planning.v_so_amount v
      LEFT JOIN planning.so_balance pb
        ON pb.prd_name = v.prd_name AND pb.due_date = v.due_date
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY v.due_date, v.prd_name
    `;

    const { rows } = await query(queryStr, params);

    return res.json({
      status: "OK",
      data: rows,
      message: rows.length > 0 ? "Data found." : "No data found.",
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal Server Error",
    });
  }
});

// GET /api_p1/planning/summary — สรุปจำนวนแถว / ยอดที่ต้องผลิต แยกตาม status (รองรับ filter เดียวกับ /table)
router.get("/summary", async (req, res) => {
  setNoCache(res);
  const { where, params, error } = buildPlanningFilter(req.query);
  if (error) {
    return res.status(400).json({
      status: "ERROR",
      data: [],
      message: error,
    });
  }

  try {
    const queryStr = `
      SELECT
        v.status,
        COUNT(*)::int                                       AS total_rows,
        COUNT(DISTINCT v.prd_name)::int                     AS total_products,
        COALESCE(SUM(v.po_bal), 0)::float8                  AS po_bal,
        COALESCE(SUM(v.net_required_pcs), 0)::float8        AS net_required_pcs,
        COALESCE(SUM(v.wh_fg_amount), 0)::float8            AS wh_fg_amount,
        COALESCE(SUM(v.output_amount), 0)::float8           AS output_amount,
        to_char(MAX(v.updated_at), 'YYYY-MM-DD HH24:MI:SS') AS updated_at
      FROM planning.v_so_amount v
      LEFT JOIN planning.so_balance pb
        ON pb.prd_name = v.prd_name AND pb.due_date = v.due_date
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY v.status
      ORDER BY v.status
    `;

    const { rows } = await query(queryStr, params);

    return res.json({
      status: "OK",
      data: rows,
      message: rows.length > 0 ? "Data found." : "No data found.",
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal Server Error",
    });
  }
});

// GET /api_p1/planning/distinct_product — รายชื่อ product สำหรับ dropdown
router.get("/distinct_product", async (req, res) => {
  setNoCache(res);
  const item_prefix = asStr(req.query.item_prefix);
  const where = [];
  const params = [];

  if (item_prefix) {
    params.push(`${escapeLike(item_prefix)}%`);
    where.push(`TRIM(item) LIKE $${params.length} ESCAPE '\\'`);
  }

  try {
    const queryStr = `
      SELECT DISTINCT prd_name
      FROM planning.so_balance
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY prd_name
    `;

    const result = await query(queryStr, params);

    return res.json({
      status: "OK",
      data: result.rows,
      message: result.rows.length > 0 ? "Data found" : "No data found",
    });
  } catch (err) {
    console.error(err.message);
    return res.json({
      status: "ERROR",
      data: [],
      message: err.message,
    });
  }
});

// GET /api_p1/planning/last_updated — เช็คเวลาอัปเดตล่าสุดและผลรวมข้อมูลสำหรับทำ Real-time AJAX Refresh
router.get("/last_updated", async (req, res) => {
  setNoCache(res);
  try {
    const queryStr = `
      SELECT
        to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS.US') AS updated_at,
        COUNT(*)::int                                        AS total_rows,
        COALESCE(SUM(po_bal), 0)::float8                     AS total_po_bal,
        COALESCE(SUM(unmovement), 0)::float8                 AS total_unmovement,
        COALESCE(SUM(f_g), 0)::float8                        AS total_fg,
        COALESCE(SUM(net_required_pcs), 0)::float8           AS total_net_required
      FROM planning.so_balance
    `;

    const { rows } = await query(queryStr);

    return res.json({
      status: "OK",
      data: rows[0] ?? {
        updated_at: null,
        total_rows: 0,
        total_po_bal: 0,
        total_unmovement: 0,
        total_fg: 0,
        total_net_required: 0,
      },
      message: "Last updated timestamp fetched.",
    });
  } catch (err) {
    console.error("Database error:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal Server Error",
    });
  }
});

// GET /api_p1/planning/history - one saved SO balance per source revision.
router.get("/history", async (req, res) => {
  setNoCache(res);
  const prd_name = asStr(req.query.prd_name);
  const due_date = asStr(req.query.due_date);

  if (!prd_name || !due_date) {
    return res.status(400).json({
      status: "ERROR",
      message: "prd_name and due_date are required parameters.",
      data: [],
    });
  }

  const parsedDate = new Date(due_date + "T00:00:00.000Z");
  if (prd_name.length > 100 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(due_date) ||
      due_date.startsWith("0000-") ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== due_date) {
    return res.status(400).json({
      status: "ERROR",
      message: "Provide a product name up to 100 characters and a valid YYYY-MM-DD date.",
      data: [],
    });
  }

  try {
    // One row per SO/PO line revision with current active/moved status against smart_pln_po_so_no.
    const queryStr = `
      SELECT h.prd_name,
             to_char(h.due_date, 'YYYY-MM-DD') AS due_date,
             h.so_no,
             h.po_no,
             h.rev::int AS source_rev,
             h.po_bal::float8 AS po_bal,
             to_char(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') AS source_update_at,
             (c.prd_name IS NOT NULL) AS is_active,
             CASE WHEN c.prd_name IS NULL THEN COALESCE((
               SELECT ARRAY_AGG(to_char(c2.due_date, 'YYYY-MM-DD') ORDER BY c2.due_date)
               FROM (
                 SELECT DISTINCT due_date
                 FROM smart.smart_pln_po_so_no
                 WHERE prd_name = h.prd_name
                   AND so_no = h.so_no
                   AND po_no = h.po_no
                   AND due_date <> h.due_date
               ) c2
             ), ARRAY[]::text[]) ELSE ARRAY[]::text[] END AS moved_to_dates,
             CASE WHEN c.prd_name IS NOT NULL THEN COALESCE((
               SELECT ARRAY_AGG(to_char(h2.due_date, 'YYYY-MM-DD') ORDER BY h2.due_date)
               FROM (
                 SELECT DISTINCT prev.due_date
                 FROM planning.so_balance_history_so_no prev
                 WHERE prev.prd_name = h.prd_name
                   AND prev.so_no = h.so_no
                   AND prev.po_no = h.po_no
                   AND prev.due_date <> h.due_date
                   AND prev.due_date >= CURRENT_DATE
                   AND NOT EXISTS (
                     SELECT 1
                     FROM smart.smart_pln_po_so_no act
                     WHERE act.prd_name = prev.prd_name
                       AND act.due_date = prev.due_date
                       AND act.so_no = prev.so_no
                       AND act.po_no = prev.po_no
                   )
               ) h2
             ), ARRAY[]::text[]) ELSE ARRAY[]::text[] END AS moved_from_dates
      FROM planning.so_balance_history_so_no h
      LEFT JOIN smart.smart_pln_po_so_no c
        ON c.prd_name = h.prd_name
       AND c.due_date = h.due_date
       AND c.so_no = h.so_no
       AND c.po_no = h.po_no
      WHERE h.prd_name = $1 AND h.due_date = CAST($2 AS date)
      ORDER BY (c.prd_name IS NOT NULL) DESC, h.so_no ASC, h.po_no ASC, h.rev ASC
    `;

    const { rows } = await query(queryStr, [prd_name, due_date]);
    return res.json({
      status: "OK",
      data: rows,
      message: rows.length > 0 ? "History data found." : "No history data found.",
    });
  } catch {
    // Query errors can contain confidential products, parameters or connection details.
    console.error("Database error in /history.");
    return res.status(500).json({
      status: "ERROR",
      data: [],
      message: "Internal Server Error",
    });
  }
});

const MONTH_NAME_TO_NO = {
  January: 1, February: 2, March: 3, April: 4,
  May: 5, June: 6, July: 7, August: 8,
  September: 9, October: 10, November: 11, December: 12
};
const NO_TO_MONTH_NAME = Object.fromEntries(
  Object.entries(MONTH_NAME_TO_NO).map(([k, v]) => [v, k])
);

// GET /api_p1/planning/exchange_rate — ดึงอัตราแลกเปลี่ยนตามปีและเดือน
router.get("/exchange_rate", async (req, res) => {
  setNoCache(res);
  const year = parseInt(req.query.year, 10);
  const monthParam = req.query.month;

  if (!year || !monthParam) {
    return res.status(400).json({
      status: "ERROR",
      message: "year and month query parameters are required.",
    });
  }

  const monthNo = parseInt(monthParam, 10) || MONTH_NAME_TO_NO[monthParam];
  if (!monthNo || monthNo < 1 || monthNo > 12) {
    return res.status(400).json({
      status: "ERROR",
      message: "Invalid month parameter.",
    });
  }

  try {
    const queryStr = `
      SELECT
        "year",
        month_no,
        month_name,
        currency,
        rate_per_thb::float8 AS rate_per_thb,
        rate_to_thb::float8  AS rate_to_thb,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
      FROM planning.exchange_rate_monthly
      WHERE "year" = $1 AND month_no = $2
      ORDER BY currency;
    `;

    const [rateRes, monthsRes] = await Promise.all([
      query(queryStr, [year, monthNo]),
      query(
        'SELECT DISTINCT month_name, month_no FROM planning.exchange_rate_monthly WHERE "year" = $1 ORDER BY month_no',
        [year]
      ),
    ]);

    const rows = rateRes.rows;
    const savedMonths = monthsRes.rows.map((r) => r.month_name || NO_TO_MONTH_NAME[r.month_no]).filter(Boolean);

    const rates = {};
    let updatedAt = null;

    for (const row of rows) {
      rates[row.currency] = row.rate_per_thb;
      if (!updatedAt || (row.updated_at && row.updated_at > updatedAt)) {
        updatedAt = row.updated_at;
      }
    }

    return res.json({
      status: "OK",
      saved_months: savedMonths,
      data: rows.length > 0 ? {
        year,
        month_no: monthNo,
        month_name: NO_TO_MONTH_NAME[monthNo] || rows[0]?.month_name,
        rates,
        updated_at: updatedAt,
      } : null,
      message: rows.length > 0 ? "Exchange rates found." : "No exchange rates found for this period.",
    });
  } catch (err) {
    console.error("Database error in /exchange_rate:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal Server Error",
    });
  }
});

// POST /api_p1/planning/exchange_rate — บันทึกหรืออัปเดตอัตราแลกเปลี่ยน (UPSERT)
router.post("/exchange_rate", verifyPlanner, async (req, res) => {
  setNoCache(res);
  const { year, month_name, month_no, rates } = req.body;

  // ปีต้องเป็นตัวเลข 4 หลักล้วน และอยู่ในช่วงที่สมเหตุสมผล
  const y = /^\d{4}$/.test(String(year)) ? Number(year) : NaN;
  if (!(y >= 2000 && y <= 2100)) {
    return res.status(400).json({
      status: "ERROR",
      message: "Invalid year. Must be between 2000 and 2100.",
    });
  }

  // เดือน: รับ month_no หรือ month_name ก็ได้ แต่ถ้าส่งมาทั้งคู่ต้องตรงกัน
  const hasMonthNo = month_no !== undefined && month_no !== null && month_no !== "";
  const noFromParam = hasMonthNo && /^\d{1,2}$/.test(String(month_no)) ? Number(month_no) : NaN;
  const noFromName = MONTH_NAME_TO_NO[month_name];

  if (hasMonthNo && !(noFromParam >= 1 && noFromParam <= 12)) {
    return res.status(400).json({ status: "ERROR", message: "Invalid month_no." });
  }
  if (month_name && !noFromName) {
    return res.status(400).json({ status: "ERROR", message: "Invalid month_name." });
  }
  if (hasMonthNo && month_name && noFromParam !== noFromName) {
    return res.status(400).json({
      status: "ERROR",
      message: "month_no and month_name do not match.",
    });
  }

  const mNo = hasMonthNo ? noFromParam : noFromName;
  const mName = NO_TO_MONTH_NAME[mNo];
  if (!mNo || !mName) {
    return res.status(400).json({
      status: "ERROR",
      message: "month_no or month_name is required.",
    });
  }

  if (!rates || typeof rates !== "object" || Array.isArray(rates)) {
    return res.status(400).json({
      status: "ERROR",
      message: "rates object is required.",
    });
  }

  const allowedCurrencies = ["JPY", "USD", "THB"];
  const entries = Object.entries(rates).filter(([curr]) => allowedCurrencies.includes(curr));

  if (entries.length === 0) {
    return res.status(400).json({
      status: "ERROR",
      message: "No valid currencies provided. Allowed: JPY, USD, THB.",
    });
  }

  // อัตราต้องเป็นตัวเลขล้วน (ทศนิยมได้) ห้ามมีตัวอักษร/คอมมา และต้องมากกว่า 0
  const RATE_PATTERN = /^\d+(\.\d+)?$/;
  for (const [curr, rate] of entries) {
    const val = Number(rate);
    if (!RATE_PATTERN.test(String(rate).trim()) || !Number.isFinite(val) || val <= 0) {
      return res.status(400).json({
        status: "ERROR",
        message: `Invalid rate for currency ${curr}. Must be a positive number.`,
      });
    }
  }

  const client = await pool_smart.connect();
  try {
    await client.query("BEGIN");

    const updatedBy = req.user?.username || "admin";
    const upsertQuery = `
      INSERT INTO planning.exchange_rate_monthly ("year", month_no, month_name, currency, rate_per_thb, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT ("year", month_no, currency)
      DO UPDATE SET
        rate_per_thb = EXCLUDED.rate_per_thb,
        month_name   = EXCLUDED.month_name,
        updated_by   = EXCLUDED.updated_by,
        updated_at   = CURRENT_TIMESTAMP;
    `;

    for (const [curr, rate] of entries) {
      await client.query(upsertQuery, [y, mNo, mName, curr, parseFloat(rate), updatedBy]);
    }

    await client.query("COMMIT");

    // แจ้งเตือนหน้าเว็บผ่าน SSE ว่าอัตราแลกเปลี่ยนเปลี่ยนและยอดเงิน v_so_amount อัปเดตแล้ว
    broadcastChange();

    return res.json({
      status: "OK",
      message: "Exchange rates saved successfully.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error saving exchange rates:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal Server Error",
    });
  } finally {
    client.release();
  }
});

// DELETE /api_p1/planning/exchange_rate — ลบอัตราแลกเปลี่ยนของเดือนและปีที่ระบุ
router.delete("/exchange_rate", verifyPlanner, async (req, res) => {
  setNoCache(res);
  const yearParam = req.query.year || req.body?.year;
  const monthParam =
    req.query.month_no ||
    req.query.month ||
    req.body?.month_no ||
    req.body?.month_name ||
    req.body?.month;

  const y = /^\d{4}$/.test(String(yearParam)) ? Number(yearParam) : NaN;
  if (!(y >= 2000 && y <= 2100)) {
    return res.status(400).json({
      status: "ERROR",
      message: "Invalid year. Must be between 2000 and 2100.",
    });
  }

  const mNo = parseInt(monthParam, 10) || MONTH_NAME_TO_NO[monthParam];
  if (!mNo || mNo < 1 || mNo > 12) {
    return res.status(400).json({
      status: "ERROR",
      message: "Invalid month parameter.",
    });
  }

  try {
    const deleteQuery = `
      DELETE FROM planning.exchange_rate_monthly
      WHERE "year" = $1 AND month_no = $2;
    `;
    const result = await query(deleteQuery, [y, mNo]);

    // แจ้งเตือนหน้าเว็บผ่าน SSE ว่าอัตราแลกเปลี่ยนเปลี่ยนและยอดเงิน v_so_amount อัปเดตแล้ว
    broadcastChange();

    return res.json({
      status: "OK",
      deleted_count: result.rowCount,
      message: `Exchange rates for ${NO_TO_MONTH_NAME[mNo]} ${y} deleted successfully.`,
    });
  } catch (err) {
    console.error("Error deleting exchange rates:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Internal Server Error",
    });
  }
});

module.exports = router;
