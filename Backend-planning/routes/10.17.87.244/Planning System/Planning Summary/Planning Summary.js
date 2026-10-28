const express = require("express");
const router = express.Router();

const { pool_smart } = require("../../config");
const query = (text, params) => pool_smart.query(text, params);

// ป้องกัน Browser หรือ Proxy จำค่าเก่า
const setNoCache = (res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
};

/**
 * Helper build WHERE conditions for filters
 */
const buildWhereClause = (queryParams) => {
  const { prd_name, lot_no, search, status, priority, lot_status, factory_desc, startdate, stopdate, item_prefix, type } =
    queryParams;
  const conditions = [];
  const params = [];
  let idx = 1;

  // ❌ ไม่นำ status = 'ready' มาแสดง
  conditions.push(`(status IS NULL OR LOWER(status) != 'ready')`);

  // 🔍 ค้นหาคำค้นได้ทั้งจากชื่อ Product และ Lot No ในช่องเดียวกัน
  const searchTerm = (prd_name || search || "").trim();
  if (searchTerm !== "") {
    conditions.push(`(prd_name ILIKE $${idx} OR lot_no ILIKE $${idx})`);
    params.push(`%${searchTerm}%`);
    idx++;
  } else if (lot_no && String(lot_no).trim() !== "") {
    conditions.push(`lot_no ILIKE $${idx}`);
    params.push(`%${String(lot_no).trim()}%`);
    idx++;
  }

  if (priority && String(priority).trim() !== "") {
    conditions.push(`priority = $${idx}`);
    params.push(String(priority).trim());
    idx++;
  }

  const prefix = (item_prefix || type || "").trim();
  if (prefix !== "") {
    conditions.push(`item LIKE $${idx}`);
    params.push(`${prefix}%`);
    idx++;
  }

  if (status && String(status).trim() !== "") {
    conditions.push(`status = $${idx}`);
    params.push(String(status).trim());
    idx++;
  }

  if (lot_status && String(lot_status).trim() !== "") {
    conditions.push(`lot_status = $${idx}`);
    params.push(String(lot_status).trim());
    idx++;
  }

  if (factory_desc && String(factory_desc).trim() !== "") {
    conditions.push(`factory_desc = $${idx}`);
    params.push(String(factory_desc).trim());
    idx++;
  }

  if (startdate) {
    conditions.push(`due_date >= $${idx}::date`);
    params.push(startdate);
    idx++;
  }

  if (stopdate) {
    conditions.push(`due_date <= $${idx}::date`);
    params.push(stopdate);
    idx++;
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { whereSql, params };
};

/**
 * 📋 1. GET /table: รายการข้อมูล Planning Summary สำหรับตาราง
 */
router.get("/table", async (req, res) => {
  setNoCache(res);
  try {
    const { whereSql, params } = buildWhereClause(req.query);

    const sql = `
      SELECT
        ROW_NUMBER() OVER () AS id,
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
      message: "success",
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
  try {
    const { whereSql, params } = buildWhereClause(req.query);

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
 * 🔽 3. GET /distinct_filters: ค่าตัวเลือกสำหรับ Filter Dropdowns
 */
router.get("/distinct_filters", async (req, res) => {
  setNoCache(res);
  try {
    const sql = `
      SELECT
        ARRAY(SELECT DISTINCT prd_name FROM planning.planning_summary WHERE prd_name IS NOT NULL ORDER BY prd_name) AS products,
        ARRAY(SELECT DISTINCT lot_no FROM planning.planning_summary WHERE lot_no IS NOT NULL AND lot_no <> '' ORDER BY lot_no) AS lot_nos,
        ARRAY(SELECT DISTINCT status FROM planning.planning_summary WHERE status IS NOT NULL AND status <> '' AND LOWER(status) != 'ready' ORDER BY status) AS statuses,
        ARRAY(SELECT DISTINCT priority FROM planning.planning_summary WHERE priority IS NOT NULL AND priority <> '' ORDER BY priority) AS priorities,
        ARRAY(SELECT DISTINCT lot_status FROM planning.planning_summary WHERE lot_status IS NOT NULL AND lot_status <> '' ORDER BY lot_status) AS lot_statuses,
        ARRAY(SELECT DISTINCT factory_desc FROM planning.planning_summary WHERE factory_desc IS NOT NULL AND factory_desc <> '' ORDER BY factory_desc) AS factories
    `;

    const { rows } = await query(sql);
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

