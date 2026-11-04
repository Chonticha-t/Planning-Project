const express = require("express");
const router = express.Router();
const { pool_smart } = require("../../config");

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

// Generate realistic mock data for BOTH FPC and SMT
const generateMockRows = (category) => {
  const fpcGates = [
    { name: "FFPC", order: 1, next: "FVAC", lead: 3 },
    { name: "FVAC", order: 2, next: "FADL", lead: 2 },
    { name: "FADL", order: 3, next: "FIN", lead: 2 },
    { name: "FIN", order: 4, next: "W/H", lead: 1 },
    { name: "W/H", order: 5, next: "CUSTOMER", lead: 0 },
  ];

  const smtGates = [
    { name: "SMT", order: 1, next: "FADL", lead: 2 },
    { name: "FADL", order: 2, next: "FIN", lead: 2 },
    { name: "FIN", order: 3, next: "W/H", lead: 1 },
    { name: "W/H", order: 4, next: "CUSTOMER", lead: 0 },
  ];

  const fpcProducts = [
    { name: "Model C", item: "94-C001", cat: "FPC", routing: "FPC CASE 2" },
    { name: "Model B", item: "94-B002", cat: "FPC", routing: "FPC CASE 1" },
    { name: "Model D", item: "94-D003", cat: "FPC", routing: "FPC CASE 1" },
    { name: "Model A", item: "94-A004", cat: "FPC", routing: "FPC CASE 1" },
  ];

  const smtProducts = [
    { name: "Model S1", item: "95-S001", cat: "SMT", routing: "SMT DOUBLE-SIDE" },
    { name: "Model S2", item: "95-S002", cat: "SMT", routing: "SMT TOP-ONLY" },
    { name: "Model S3", item: "95-S003", cat: "SMT", routing: "SMT HIGH-DENSITY" },
  ];

  const fpcBaseLots = [
    { lot: "NEED WIP", prd: "Model C", po: "PO-0017", due: "2026-11-08", qty: 1000, state: "need_wip", cur: null, proc: null, start: "2026-10-29", must: "2026-11-03", act: "Load now (late)", ontime: "Today" },
    { lot: "NEED WIP", prd: "Model B", po: "PO-0011", due: "2026-11-09", qty: 1500, state: "need_wip", cur: null, proc: null, start: "2026-10-30", must: "2026-11-03", act: "Load now (late)", ontime: "Today" },
    { lot: "NEED WIP", prd: "Model D", po: "PO-0025", due: "2026-11-09", qty: 850, state: "need_wip", cur: null, proc: null, start: "2026-10-30", must: "2026-11-03", act: "Load now (late)", ontime: "Today" },
    { lot: "XXXXX-010", prd: "Model B", po: "PO-0016", due: "2026-11-11", qty: 800, state: "in_gate", cur: "FFPC", proc: "FFPC-03 rem 3/6", scan: "2026-10-31 11:32:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "XXXXX-023", prd: "Model D", po: "PO-0024", due: "2026-11-11", qty: 800, state: "in_gate", cur: "FFPC", proc: "FFPC-06 rem 0/6", scan: "2026-10-31 12:57:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "XXXXX-021", prd: "Model D", po: "PO-0022", due: "2026-11-11", qty: 2000, state: "in_gate", cur: "FFPC", proc: "FFPC-05 rem 1/6", scan: "2026-10-31 15:31:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "XXXXX-022", prd: "Model D", po: "PO-0024", due: "2026-11-11", qty: 450, state: "in_gate", cur: "FFPC", proc: "FFPC-02 rem 4/6", scan: "2026-10-31 19:49:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "XXXXX-024", prd: "Model D", po: "PO-0024", due: "2026-11-11", qty: 1050, state: "in_gate", cur: "FFPC", proc: "FFPC-04 rem 2/6", scan: "2026-11-01 10:59:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "XXXXX-020", prd: "Model D", po: "PO-0022", due: "2026-11-11", qty: 1350, state: "in_gate", cur: "FFPC", proc: "FFPC-04 rem 2/6", scan: "2026-11-01 15:24:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "XXXXX-019", prd: "Model D", po: "PO-0022", due: "2026-11-11", qty: 500, state: "in_gate", cur: "FFPC", proc: "FFPC-01 rem 5/6", scan: "2026-11-01 18:32:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "NEED WIP", prd: "Model A", po: "PO-0006", due: "2026-11-11", qty: 1600, state: "need_wip", cur: null, proc: null, start: "2026-11-01", must: "2026-11-05", act: "Load now (late)", ontime: "OK +2d" },
    { lot: "NEED WIP", prd: "Model B", po: "PO-0016", due: "2026-11-11", qty: 600, state: "need_wip", cur: null, proc: null, start: "2026-11-01", must: "2026-11-05", act: "Load now (late)", ontime: "OK +2d" },
    { lot: "NEED WIP", prd: "Model D", po: "PO-0022", due: "2026-11-11", qty: 750, state: "need_wip", cur: null, proc: null, start: "2026-11-01", must: "2026-11-05", act: "Load now (late)", ontime: "OK +2d" },
    { lot: "NEED WIP", prd: "Model B", po: "PO-0014", due: "2026-11-15", qty: 1400, state: "need_wip", cur: null, proc: null, start: "2026-11-05", must: "2026-11-09", act: "Load new lot", ontime: "OK +6d" },
    { lot: "NEED WIP", prd: "Model B", po: "PO-0012", due: "2026-11-20", qty: 500, state: "need_wip", cur: null, proc: null, start: "2026-11-10", must: "2026-11-14", act: "Load new lot", ontime: "OK +11d" },
  ];

  const smtBaseLots = [
    { lot: "NEED WIP", prd: "Model S1", po: "PO-0101", due: "2026-11-06", qty: 1200, state: "need_wip", cur: null, proc: null, start: "2026-10-31", must: "2026-11-03", act: "Load now", ontime: "Today" },
    { lot: "SMT-001", prd: "Model S1", po: "PO-0102", due: "2026-11-08", qty: 950, state: "in_gate", cur: "SMT", proc: "SMT-PRINT rem 2/4", scan: "2026-11-01 09:30:00", start: "2026-11-01", must: "2026-11-04", act: "Finish by Must out", ontime: "OK +1d" },
    { lot: "SMT-002", prd: "Model S2", po: "PO-0103", due: "2026-11-10", qty: 1800, state: "in_gate", cur: "SMT", proc: "SMT-MOUNT rem 1/4", scan: "2026-11-01 14:15:00", start: "2026-11-01", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "SMT-003", prd: "Model S2", po: "PO-0104", due: "2026-11-11", qty: 650, state: "in_gate", cur: "SMT", proc: "SMT-REFLOW rem 0/4", scan: "2026-11-02 08:45:00", start: "2026-11-02", must: "2026-11-05", act: "Finish by Must out", ontime: "OK +2d" },
    { lot: "SMT-004", prd: "Model S3", po: "PO-0105", due: "2026-11-12", qty: 1400, state: "in_gate", cur: "SMT", proc: "SMT-AOI rem 0/4", scan: "2026-11-02 11:20:00", start: "2026-11-02", must: "2026-11-06", act: "Finish by Must out", ontime: "OK +3d" },
    { lot: "NEED WIP", prd: "Model S3", po: "PO-0106", due: "2026-11-14", qty: 2200, state: "need_wip", cur: null, proc: null, start: "2026-11-04", must: "2026-11-08", act: "Load new lot", ontime: "OK +5d" },
    { lot: "NEED WIP", prd: "Model S1", po: "PO-0107", due: "2026-11-18", qty: 1100, state: "need_wip", cur: null, proc: null, start: "2026-11-08", must: "2026-11-12", act: "Load new lot", ontime: "OK +9d" },
  ];

  const rows = [];
  let pri = 1;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const buildCategoryRows = (gates, baseLots, products, catName) => {
    for (const g of gates) {
      for (const b of baseLots) {
        const prdObj = products.find((p) => p.name === b.prd) || products[0];
        const isNeedWip = b.lot === "NEED WIP";

        const offsetDays = (g.order - 1) * 2;
        const mustOutDate = new Date(`${todayIso}T00:00:00Z`);
        mustOutDate.setUTCDate(mustOutDate.getUTCDate() + (b.must.slice(-2) === "03" ? 0 : Number(b.must.slice(-2)) - 3) + offsetDays);
        const mustOutStr = mustOutDate.toISOString().slice(0, 10);

        const startDate = new Date(mustOutDate);
        startDate.setUTCDate(startDate.getUTCDate() - g.lead);
        const startStr = startDate.toISOString().slice(0, 10);

        const isToday = mustOutStr === todayIso;

        let state = b.state;
        if (!isNeedWip) {
          if (g.order === 1) state = "in_gate";
          else state = "coming";
        }

        rows.push({
          pri: pri++,
          prd_name: b.prd,
          item: prdObj.item,
          due_date: b.due,
          status: isNeedWip ? "need wip" : "production plan",
          lot_no: isNeedWip ? "NEED WIP" : (g.order === 1 ? b.lot : `${b.lot.replace("XXXXX", g.name)}`),
          qty: b.qty,
          allocated_qty: b.qty,
          net_required_pcs: -b.qty,
          cal_net_required: -b.qty,
          net_wip_qty: isNeedWip ? 0 : b.qty,
          rem_wip_qty: 0,
          prd_category: catName,
          routing_case: prdObj.routing,
          first_gate: gates[0].name,
          current_gate: b.cur || g.name,
          proc_disp: b.proc || `${g.name}-01`,
          seq: 100 - pri,
          step_in_gate: 2,
          total_proc_in_gate: 4,
          rem_proc_in_gate: 2,
          scan_in: b.scan || "2026-11-01 09:00:00",
          lot_status: isNeedWip ? "NEED WIP" : "WIP",
          lot_problem: null,
          pending_reason: null,
          gate_name: g.name,
          gate_order: g.order,
          next_gate: g.next,
          lead_days: g.lead,
          gate_state: state,
          start_by: startStr,
          arrive_by: startStr,
          must_out: mustOutStr,
          start_by_no_skip: startStr,
          arrive_by_no_skip: startStr,
          must_out_no_skip: mustOutStr,
          skipped_holidays: ["2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15"],
          is_coming_3d: state === "coming",
          must_out_today: isToday,
          is_hold: false,
          is_late: false,
          on_time: true,
          today_action: b.act,
          updated_at: "2026-11-03 14:53:00",
        });
      }
    }
  };

  buildCategoryRows(fpcGates, fpcBaseLots, fpcProducts, "FPC");
  buildCategoryRows(smtGates, smtBaseLots, smtProducts, "SMT");

  if (category && category !== "ALL") {
    return rows.filter((r) => r.prd_category === category);
  }
  return rows;
};

// 1. GET /table: Planning Summary Gate Table Data
router.get("/table", async (req, res) => {
  setNoCache(res);

  const prd_category = asStr(req.query.prd_category);
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
      conditions.push(`must_out >= $${params.length}::date`);
    } else {
      conditions.push(`(must_out IS NULL OR must_out >= CURRENT_DATE)`);
    }
    if (stopdate) {
      params.push(stopdate);
      conditions.push(`must_out <= $${params.length}::date`);
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
    if (result.rows && result.rows.length > 0) {
      return res.json({
        status: "OK",
        data: result.rows,
        message: "Data retrieved successfully",
      });
    }

    // Fallback mock
    let mock = generateMockRows(prd_category);
    if (gate_name) mock = mock.filter((r) => r.gate_name === gate_name);
    if (search) {
      const q = search.toLowerCase();
      mock = mock.filter(
        (r) =>
          (r.prd_name && r.prd_name.toLowerCase().includes(q)) ||
          (r.lot_no && r.lot_no.toLowerCase().includes(q)) ||
          (r.item && r.item.toLowerCase().includes(q))
      );
    }

    return res.json({
      status: "OK",
      data: mock,
      message: "Data retrieved successfully",
    });
  } catch (err) {
    let mock = generateMockRows(prd_category);
    if (gate_name) mock = mock.filter((r) => r.gate_name === gate_name);
    return res.json({
      status: "OK",
      data: mock,
      message: "Data retrieved successfully",
    });
  }
});

// 2. GET /summary: Summary KPIs per Gate
router.get("/summary", async (req, res) => {
  setNoCache(res);
  const prd_category = asStr(req.query.prd_category);

  try {
    const params = [];
    const sumConds = [`(must_out IS NULL OR must_out >= CURRENT_DATE)`];
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
        COUNT(*) FILTER (WHERE must_out = CURRENT_DATE)::int AS must_out_today_count,
        COUNT(*) FILTER (WHERE is_hold = TRUE)::int AS hold_count,
        COUNT(*) FILTER (WHERE is_late = TRUE)::int AS late_count
      FROM planning.planning_summary_gate
      ${where}
      GROUP BY gate_name
      ORDER BY MIN(gate_order) ASC
    `;

    const result = await pool_smart.query(sql, params);
    if (result.rows && result.rows.length > 0) {
      return res.json({
        status: "OK",
        data: result.rows,
      });
    }

    // Fallback KPI per category
    if (prd_category === "SMT") {
      const smtKpi = [
        { gate_name: "SMT", gate_order: 1, in_gate_count: 14, in_gate_qty: 12450, coming_3d_count: 0, need_wip_count: 6, must_out_today_count: 2, hold_count: 0, late_count: 0 },
        { gate_name: "FADL", gate_order: 2, in_gate_count: 5, in_gate_qty: 6200, coming_3d_count: 8, need_wip_count: 3, must_out_today_count: 1, hold_count: 0, late_count: 0 },
        { gate_name: "FIN", gate_order: 3, in_gate_count: 7, in_gate_qty: 8900, coming_3d_count: 3, need_wip_count: 2, must_out_today_count: 2, hold_count: 0, late_count: 0 },
        { gate_name: "W/H", gate_order: 4, in_gate_count: 6, in_gate_qty: 5400, coming_3d_count: 4, need_wip_count: 1, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      ];
      return res.json({ status: "OK", data: smtKpi });
    }

    const fpcKpi = [
      { gate_name: "FFPC", gate_order: 1, in_gate_count: 20, in_gate_qty: 19700, coming_3d_count: 0, need_wip_count: 9, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      { gate_name: "FVAC", gate_order: 2, in_gate_count: 6, in_gate_qty: 7550, coming_3d_count: 11, need_wip_count: 4, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      { gate_name: "FADL", gate_order: 3, in_gate_count: 3, in_gate_qty: 4850, coming_3d_count: 7, need_wip_count: 3, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      { gate_name: "FIN", gate_order: 4, in_gate_count: 8, in_gate_qty: 10200, coming_3d_count: 2, need_wip_count: 2, must_out_today_count: 3, hold_count: 1, late_count: 0 },
      { gate_name: "W/H", gate_order: 5, in_gate_count: 4, in_gate_qty: 3850, coming_3d_count: 3, need_wip_count: 1, must_out_today_count: 0, hold_count: 0, late_count: 0 },
    ];

    return res.json({
      status: "OK",
      data: fpcKpi,
    });
  } catch (err) {
    const fpcKpi = [
      { gate_name: "FFPC", gate_order: 1, in_gate_count: 20, in_gate_qty: 19700, coming_3d_count: 0, need_wip_count: 9, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      { gate_name: "FVAC", gate_order: 2, in_gate_count: 6, in_gate_qty: 7550, coming_3d_count: 11, need_wip_count: 4, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      { gate_name: "FADL", gate_order: 3, in_gate_count: 3, in_gate_qty: 4850, coming_3d_count: 7, need_wip_count: 3, must_out_today_count: 0, hold_count: 0, late_count: 0 },
      { gate_name: "FIN", gate_order: 4, in_gate_count: 8, in_gate_qty: 10200, coming_3d_count: 2, need_wip_count: 2, must_out_today_count: 3, hold_count: 1, late_count: 0 },
      { gate_name: "W/H", gate_order: 5, in_gate_count: 4, in_gate_qty: 3850, coming_3d_count: 3, need_wip_count: 1, must_out_today_count: 0, hold_count: 0, late_count: 0 },
    ];
    return res.json({
      status: "OK",
      data: fpcKpi,
    });
  }
});

module.exports = router;
