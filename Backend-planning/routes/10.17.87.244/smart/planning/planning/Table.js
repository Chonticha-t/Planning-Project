const express = require("express");
const router = express.Router();

const { pool_smart } = require("../../../config");
const query = (text, params) => pool_smart.query(text, params);

// GET /api_p1/planning/table?status=ready&prd_name=ABC&startdate=2026-10-01&stopdate=2026-10-31
router.get("/", async (req, res) => {
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
        ship_pcs::float8                                AS ship_pcs,
        net_required_pcs::float8                        AS net_required_pcs,
        rem_unmovement::float8                          AS rem_unmovement,
        rem_fg::float8                                  AS rem_fg,
        status,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS')    AS updated_at
      FROM planning.planning
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

module.exports = router;
