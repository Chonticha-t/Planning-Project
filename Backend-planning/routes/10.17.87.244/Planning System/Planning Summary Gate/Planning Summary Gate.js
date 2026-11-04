const express = require("express");
const router = express.Router();
const { pool_smart } = require("../../config");
const { createCalendarIndex, loadCalendar } = require("../../../../utils/workingCalendar");

// Helper prevent browser caching
const setNoCache = (res) => {
  res.set({
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
};

const asStr = (val) => {
  if (Array.isArray(val)) return String(val[0] ?? "").trim();
  return typeof val === "string" ? val.trim() : "";
};

const escapeLike = (str) => str.replace(/[\\%_]/g, "\\$&");

// Read the same working-day source and shift rules as the gate scheduler.
router.get("/calendar", async (req, res) => {
  setNoCache(res);
  const start = asStr(req.query.startdate);
  const end = asStr(req.query.stopdate);
  let first;
  let last;
  try {
    first = Date.parse(`${start}T00:00:00Z`);
    last = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 31 * 86400000) {
      throw new Error("Invalid calendar range");
    }
    createCalendarIndex([], start, end);
  } catch {
    return res.status(400).json({ status: "ERROR", data: [], message: "A valid calendar range of up to 32 days is required." });
  }
  try {
    const calendar = await loadCalendar(start, end);
    const days = [];
    for (let date = first; date <= last; date += 86400000) {
      const dateStr = new Date(date).toISOString().slice(0, 10);
      days.push({ date: dateStr, is_working: calendar.isWorking(dateStr) });
    }
    return res.json({ status: "OK", data: days });
  } catch {
    return res.status(503).json({ status: "ERROR", data: [], message: "Unable to load the working-day calendar. Please try again." });
  }
});

// 1. GET /table: Planning Summary Gate Table Data
router.get("/table", async (req, res) => {
  setNoCache(res);

  const prd_category = asStr(req.query.prd_category);
  const mustOutColumn = asStr(req.query.skip_holidays) === "false"
    ? "COALESCE(must_out_no_skip, must_out)"
    : "must_out";
  const gate_name = asStr(req.query.gate_name);
  const search = asStr(req.query.search);
  const startdate = asStr(req.query.startdate);
  const stopdate = asStr(req.query.stopdate);

  try {
    const conditions = [];
    const params = [];

    if (prd_category) {
      params.push(prd_category);
      conditions.push(`prd_category = $${params.length}`);
    }
    if (gate_name) {
      params.push(gate_name);
      conditions.push(`gate_name = $${params.length}`);
    }
    if (startdate) {
      params.push(startdate);
      conditions.push(`${mustOutColumn} >= $${params.length}::date`);
    } else {
      conditions.push(`(${mustOutColumn} IS NULL OR ${mustOutColumn} >= CURRENT_DATE)`);
    }
    if (stopdate) {
      params.push(stopdate);
      conditions.push(`${mustOutColumn} <= $${params.length}::date`);
    }
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      conditions.push(`(prd_name ILIKE $${params.length} OR lot_no ILIKE $${params.length} OR item ILIKE $${params.length})`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `
      SELECT
        pri,
        prd_name,
        item,
        to_char(due_date, 'YYYY-MM-DD') AS due_date,
        status,
        lot_no,
        qty::float8,
        allocated_qty::float8,
        net_required_pcs::float8,
        cal_net_required::float8,
        net_wip_qty::float8,
        rem_wip_qty::float8,
        prd_category,
        routing_case,
        first_gate,
        current_gate,
        proc_disp,
        seq,
        step_in_gate,
        total_proc_in_gate,
        rem_proc_in_gate,
        to_char(scan_in, 'YYYY-MM-DD HH24:MI:SS') AS scan_in,
        lot_status,
        lot_problem,
        pending_reason,
        gate_name,
        gate_order,
        next_gate,
        lead_days,
        gate_state,
        to_char(start_by, 'YYYY-MM-DD') AS start_by,
        to_char(arrive_by, 'YYYY-MM-DD') AS arrive_by,
        to_char(must_out, 'YYYY-MM-DD') AS must_out,
        to_char(start_by_no_skip, 'YYYY-MM-DD') AS start_by_no_skip,
        to_char(arrive_by_no_skip, 'YYYY-MM-DD') AS arrive_by_no_skip,
        to_char(must_out_no_skip, 'YYYY-MM-DD') AS must_out_no_skip,
        skipped_holidays,
        is_coming_3d,
        must_out_today,
        is_hold,
        is_late,
        on_time,
        today_action,
        to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') AS updated_at
      FROM planning.planning_summary_gate
      ${whereClause}
      ORDER BY gate_order ASC, pri ASC
    `;

    const result = await pool_smart.query(sql, params);
    return res.json({
      status: "OK",
      data: result.rows,
      message: "Data retrieved successfully",
    });
  } catch {
    return res.status(503).json({
      status: "ERROR",
      data: [],
      message: "Unable to load planning gate data. Please try again.",
    });
  }
});

// 2. GET /summary: Summary KPIs per Gate
router.get("/summary", async (req, res) => {
  setNoCache(res);
  const prd_category = asStr(req.query.prd_category);
  const mustOutColumn = asStr(req.query.skip_holidays) === "false"
    ? "COALESCE(must_out_no_skip, must_out)"
    : "must_out";

  try {
    const params = [];
    const sumConds = [`(${mustOutColumn} IS NULL OR ${mustOutColumn} >= CURRENT_DATE)`];
    if (prd_category) {
      params.push(prd_category);
      sumConds.push(`prd_category = $${params.length}`);
    }
    const where = `WHERE ${sumConds.join(" AND ")}`;

    const sql = `
      SELECT
        gate_name,
        MIN(gate_order) AS gate_order,
        COUNT(*) FILTER (WHERE gate_state = 'in_gate')::int AS in_gate_count,
        COALESCE(SUM(qty) FILTER (WHERE gate_state = 'in_gate'), 0)::float8 AS in_gate_qty,
        COUNT(*) FILTER (WHERE is_coming_3d = TRUE)::int AS coming_3d_count,
        COUNT(*) FILTER (WHERE gate_state = 'need_wip')::int AS need_wip_count,
        COUNT(*) FILTER (WHERE ${mustOutColumn} = CURRENT_DATE)::int AS must_out_today_count,
        COUNT(*) FILTER (WHERE is_hold = TRUE)::int AS hold_count,
        COUNT(*) FILTER (WHERE is_late = TRUE)::int AS late_count
      FROM planning.planning_summary_gate
      ${where}
      GROUP BY gate_name
      ORDER BY MIN(gate_order) ASC
    `;

    const result = await pool_smart.query(sql, params);
    return res.json({
      status: "OK",
      data: result.rows,
    });
  } catch {
    return res.status(503).json({
      status: "ERROR",
      data: [],
      message: "Unable to load planning gate summary. Please try again.",
    });
  }
});

module.exports = router;
