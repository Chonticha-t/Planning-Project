const express = require("express");
const router = express.Router();
const { pool_smart } = require("../../config");

const setNoCache = (res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
};

// GET /api_p1/planning/forecast
router.get("/", async (req, res) => {
  setNoCache(res);
  try {
    const sql = `
      WITH dedup AS (
        SELECT
          TRIM(product) AS product,
          UPPER(TRIM(COALESCE(prd_type, ''))) AS prd_type,
          COALESCE(
            MAX(
              CASE
                WHEN customer IS NULL OR TRIM(customer) = '' OR LOWER(TRIM(customer)) = 'nan'
                THEN NULL
                ELSE UPPER(TRIM(customer))
              END
            ),
            'OTHERS'
          ) AS customer,
          TRIM(week_no) AS week_no,
          to_char(MIN(input_date), 'YYYY-MM-DD') AS input_date,
          MAX(COALESCE(fc_qty_pcs, 0))::float8 AS fc_qty_pcs,
          MAX(NULLIF(pcs_lot, 0))::float8 AS pcs_lot,
          MAX(COALESCE(update_datetime, updated_at)) AS updated_ts
        FROM planning.forecast
        WHERE product IS NOT NULL
          AND TRIM(product) <> ''
          AND week_no IS NOT NULL
          AND TRIM(week_no) <> ''
        GROUP BY
          TRIM(product),
          UPPER(TRIM(COALESCE(prd_type, ''))),
          TRIM(week_no)
      )
      SELECT
        product,
        prd_type,
        customer,
        week_no,
        input_date,
        fc_qty_pcs,
        pcs_lot,
        to_char(updated_ts AT TIME ZONE 'Asia/Bangkok', 'DD/MM/YYYY') AS updated_date_str,
        to_char(updated_ts AT TIME ZONE 'Asia/Bangkok', 'HH24:MI') AS updated_time_str,
        updated_ts,
        to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today_str
      FROM dedup
      ORDER BY week_no ASC, product ASC;
    `;

    const result = await pool_smart.query(sql);
    const rows = result.rows || [];

    const weekMap = new Map();
    const productMap = new Map();
    let maxUpdatedTs = null;
    let lastUpdatedDate = "-";
    let lastUpdatedTime = "";
    let todayStr = new Date().toISOString().slice(0, 10);

    for (const r of rows) {
      if (r.today_str) todayStr = r.today_str;

      if (r.updated_ts) {
        const ts = new Date(r.updated_ts).getTime();
        if (!maxUpdatedTs || ts > maxUpdatedTs) {
          maxUpdatedTs = ts;
          lastUpdatedDate = r.updated_date_str || "-";
          lastUpdatedTime = r.updated_time_str || "";
        }
      }

      const wCode = r.week_no;
      if (!weekMap.has(wCode)) {
        const shortNum = wCode.replace(/^WK\d{2}/i, "") || wCode;
        weekMap.set(wCode, {
          code: wCode,
          shortNum,
          inputDate: r.input_date || null,
          isCurrentWeek: false,
        });
      } else if (!weekMap.get(wCode).inputDate && r.input_date) {
        weekMap.get(wCode).inputDate = r.input_date;
      }

      const pKey = `${r.prd_type}::${r.product}`;
      if (!productMap.has(pKey)) {
        productMap.set(pKey, {
          product: r.product,
          prdType: r.prd_type,
          customer: r.customer,
          pcsLot: r.pcs_lot ? Number(r.pcs_lot) : null,
          weeklyPcs: {},
        });
      }
      const pEntry = productMap.get(pKey);
      if (!pEntry.pcsLot && r.pcs_lot) {
        pEntry.pcsLot = Number(r.pcs_lot);
      }
      const qty = Number(r.fc_qty_pcs) || 0;
      if (qty !== 0) {
        pEntry.weeklyPcs[wCode] = (pEntry.weeklyPcs[wCode] || 0) + qty;
      }
    }

    const weeks = Array.from(weekMap.values()).sort((a, b) =>
      a.code.localeCompare(b.code)
    );

    // Identify current week: latest week whose inputDate <= todayStr (fallback to first week)
    if (weeks.length > 0) {
      let currentIdx = 0;
      for (let i = 0; i < weeks.length; i++) {
        if (weeks[i].inputDate && weeks[i].inputDate <= todayStr) {
          currentIdx = i;
        }
      }
      weeks[currentIdx].isCurrentWeek = true;
    }

    const products = Array.from(productMap.values());

    return res.status(200).json({
      status: "OK",
      lastUpdated: {
        date: lastUpdatedDate,
        time: lastUpdatedTime,
        iso: maxUpdatedTs ? new Date(maxUpdatedTs).toISOString() : null,
      },
      weeks,
      products,
    });
  } catch (err) {
    console.error("[Forecast API Error]:", err);
    return res.status(500).json({
      status: "ERROR",
      message: "Failed to fetch forecast data",
      error: err.message,
    });
  }
});

module.exports = router;
