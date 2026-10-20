const express = require("express");
const router = express.Router();

const { pool_smart } = require("../../../config");
const query = (text, params) => pool_smart.query(text, params);

// GET /api_p1/planning/distinct_product — รายชื่อ product สำหรับ dropdown
router.get("/", async (req, res) => {
  try {
    const queryStr = `
      SELECT DISTINCT prd_name
      FROM planning.planning
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

module.exports = router;
