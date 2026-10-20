const express = require("express");
const router = express.Router();

const { pool_smart } = require("../../../config");
const query = (text, params) => pool_smart.query(text, params);

// GET /api_p1/planning/summary — สรุปจำนวนแถว / ยอดที่ต้องผลิต แยกตาม status
router.get("/", async (req, res) => {
  try {
    const queryStr = `
      SELECT
        status,
        COUNT(*)::int                        AS total_rows,
        COUNT(DISTINCT prd_name)::int        AS total_products,
        COALESCE(SUM(po_bal), 0)::float8     AS po_bal,
        COALESCE(SUM(net_required_pcs), 0)::float8 AS net_required_pcs,
        to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS updated_at
      FROM planning.planning
      GROUP BY status
      ORDER BY status
    `;

    const { rows } = await query(queryStr);

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
