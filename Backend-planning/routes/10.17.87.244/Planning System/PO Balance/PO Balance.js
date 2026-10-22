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

// GET /api_p1/planning/table?status=ready&prd_name=ABC&startdate=2026-10-01&stopdate=2026-10-31
router.get("/table", async (req, res) => {
  setNoCache(res);
  const { status, prd_name, startdate, stopdate } = req.query;

  // สร้างเงื่อนไขตาม filter ที่ส่งมา (ใช้ $1, $2 ... กัน SQL injection)
  const where = [];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (prd_name) {
    params.push(`%${prd_name}%`);
    where.push(`prd_name ILIKE $${params.length}`);
  }
  if (startdate) {
    params.push(startdate);
    where.push(`due_date >= $${params.length}::date`);
  }
  if (stopdate) {
    params.push(stopdate);
    where.push(`due_date <= $${params.length}::date`);
  }

  try {
    // numeric -> float8 เพื่อให้ได้ตัวเลขกลับไป / due_date -> text กันวันเลื่อนจาก timezone
    const queryStr = `
      SELECT
        prd_name,
        to_char(due_date, 'YYYY-MM-DD')                 AS due_date,
        po_bal::float8                                  AS po_bal,
        unmovement::float8                              AS unmovement,
        f_g::float8                                     AS f_g,

        net_required_pcs::float8                        AS net_required_pcs,
        rem_unmovement::float8                          AS rem_unmovement,
        rem_fg::float8                                  AS rem_fg,
        status,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS')    AS updated_at
      FROM planning.po_balance
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY due_date, prd_name
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
  const { status, prd_name, startdate, stopdate } = req.query;

  const where = [];
  const params = [];

  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (prd_name) {
    params.push(`%${prd_name}%`);
    where.push(`prd_name ILIKE $${params.length}`);
  }
  if (startdate) {
    params.push(startdate);
    where.push(`due_date >= $${params.length}::date`);
  }
  if (stopdate) {
    params.push(stopdate);
    where.push(`due_date <= $${params.length}::date`);
  }

  try {
    const queryStr = `
      SELECT
        status,
        COUNT(*)::int                        AS total_rows,
        COUNT(DISTINCT prd_name)::int        AS total_products,
        COALESCE(SUM(po_bal), 0)::float8     AS po_bal,
        COALESCE(SUM(net_required_pcs), 0)::float8 AS net_required_pcs,
        to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS updated_at
      FROM planning.po_balance
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      GROUP BY status
      ORDER BY status
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
  try {
    const queryStr = `
      SELECT DISTINCT prd_name
      FROM planning.po_balance
      ORDER BY prd_name
    `;

    const result = await query(queryStr);

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
      FROM planning.po_balance
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
router.post("/exchange_rate", async (req, res) => {
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

    const upsertQuery = `
      INSERT INTO planning.exchange_rate_monthly ("year", month_no, month_name, currency, rate_per_thb, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT ("year", month_no, currency)
      DO UPDATE SET
        rate_per_thb = EXCLUDED.rate_per_thb,
        month_name   = EXCLUDED.month_name,
        updated_at   = CURRENT_TIMESTAMP;
    `;

    for (const [curr, rate] of entries) {
      await client.query(upsertQuery, [y, mNo, mName, curr, parseFloat(rate)]);
    }

    await client.query("COMMIT");

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

module.exports = router;
