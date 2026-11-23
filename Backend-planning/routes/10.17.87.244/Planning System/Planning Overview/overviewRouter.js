const express = require("express");
const { addDays, buildDays, buildOverviewRows, isIsoDate } = require("./overviewCalc");

const DEFAULT_DAYS = 14;
const MAX_DAYS = 62;
const ITEM_PREFIXES = new Set(["94", "95"]);
// After the working-day calendar fails, use the Sunday-off fallback for this long before retrying.
const CALENDAR_RETRY_MS = 60000;

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

const latest = (...values) => values.filter(Boolean).sort().pop() || null;

/**
 * GET /table?days=14&startdate=YYYY-MM-DD&item_prefix=94|95
 * Read-only. Returns the shown working days and, per product with open PO, the cumulative
 * PO balance and B/L FG for each of those days.
 */
const createPlanningOverviewRouter = ({ query, loadWorkingCalendar, now = Date.now }) => {
  const router = express.Router();
  let calendarFailedAt = -Infinity;

  const workingDayCheck = async (start, end) => {
    if (typeof loadWorkingCalendar !== "function" || now() - calendarFailedAt < CALENDAR_RETRY_MS) {
      return null;
    }
    try {
      const calendar = await loadWorkingCalendar(start, end);
      return (iso) => calendar.isWorking(iso);
    } catch (err) {
      calendarFailedAt = now();
      console.warn("Planning Overview: working-day calendar unavailable, hiding Sundays instead:", err.message);
      return null;
    }
  };

  router.get("/table", async (req, res) => {
    setNoCache(res);
    const startParam = asStr(req.query.startdate);
    const daysParam = asStr(req.query.days);
    const itemPrefix = asStr(req.query.item_prefix);
    const span = daysParam ? Number(daysParam) : DEFAULT_DAYS;

    let error = "";
    if (startParam && !isIsoDate(startParam)) error = "Invalid startdate format. Expected YYYY-MM-DD.";
    else if (!Number.isInteger(span) || span < 1 || span > MAX_DAYS) error = `days must be a whole number from 1 to ${MAX_DAYS}.`;
    else if (itemPrefix && !ITEM_PREFIXES.has(itemPrefix)) error = "item_prefix must be 94 or 95.";
    if (error) return res.status(400).json({ status: "ERROR", data: null, message: error });

    try {
      const todayRes = await query("SELECT CURRENT_DATE::text AS today");
      const today = todayRes.rows[0]?.today;
      const start = startParam || today;
      const end = addDays(start, span - 1);

      const isWorking = await workingDayCheck(start, end);
      const days = buildDays(start, end, today, isWorking);
      const base = { today, start, end, calendar: isWorking ? "working-calendar" : "fallback", days, products: [], updated_at: null };
      if (!days.length) {
        return res.json({ status: "OK", data: base, message: "No working days in this range." });
      }

      const lastDay = days[days.length - 1].date;
      const poParams = [lastDay];
      let itemCondition = "";
      if (itemPrefix) {
        poParams.push(`${itemPrefix}%`);
        itemCondition = "AND TRIM(b.item) LIKE $2";
      }
      const poRes = await query(
        `
          SELECT b.prd_name,
                 to_char(b.due_date, 'YYYY-MM-DD') AS due_date,
                 SUM(b.so_bal)::float8 AS qty
          FROM planning.so_balance b
          WHERE b.due_date <= $1::date
            AND b.so_bal > 0
            ${itemCondition}
          GROUP BY b.prd_name, b.due_date
        `,
        poParams
      );
      const poLines = poRes.rows || [];
      const names = [...new Set(poLines.map((r) => r.prd_name).filter(Boolean))];
      if (!names.length) {
        return res.json({ status: "OK", data: base, message: "No open PO in this range." });
      }

      // F/G and Unmovement are running balances per SO line, so the largest value is the stock on hand.
      const [supplyRes, wipRes] = await Promise.all([
        query(
          `
            SELECT prd_name,
                   MAX(TRIM(item)) AS item,
                   COALESCE(MAX(f_g), 0)::float8 AS f_g,
                   COALESCE(MAX(unmovement), 0)::float8 AS unmovement,
                   to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS updated_at
            FROM planning.so_balance
            WHERE prd_name = ANY($1::text[])
            GROUP BY prd_name
          `,
          [names]
        ),
        query(
          `
            SELECT prd_name,
                   COALESCE(SUM(net_wip_qty), 0)::float8 AS wip_qty,
                   COUNT(DISTINCT lot)::int AS wip_lots,
                   -- Lots whose yield is 0 have net_wip_qty 0, so they add nothing to WIP after yield.
                   COUNT(DISTINCT lot) FILTER (
                     WHERE COALESCE(net_wip_qty, 0) = 0 AND COALESCE(net_qty, 0) > 0
                   )::int AS wip_lots_no_yield,
                   to_char(MAX(updated_at), 'YYYY-MM-DD HH24:MI:SS') AS updated_at
            FROM planning.wip_in_process
            WHERE prd_name = ANY($1::text[])
            GROUP BY prd_name
          `,
          [names]
        ),
      ]);

      const supply = supplyRes.rows || [];
      const wip = wipRes.rows || [];
      const products = buildOverviewRows({ days, poLines, supply, wip });
      const updatedAt = latest(...supply.map((r) => r.updated_at), ...wip.map((r) => r.updated_at));

      return res.json({
        status: "OK",
        data: { ...base, products, updated_at: updatedAt },
        message: products.length ? "Data found." : "No open PO in this range.",
      });
    } catch (err) {
      console.error("Error in GET /planning_overview/table:", err);
      return res.status(500).json({ status: "ERROR", data: null, message: "Internal server error" });
    }
  });

  return router;
};

module.exports = { createPlanningOverviewRouter, DEFAULT_DAYS, MAX_DAYS };
