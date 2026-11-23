// Planning Overview: PO Balance vs B/L FG per product (read-only).
const { pool_smart } = require("../../config");
const { loadCalendar } = require("../WorkingDayCalendar/workingCalendar");
const { createGateCalendarCache } = require("../WorkingDayCalendar/gateCalendarCache");
const { createPlanningOverviewRouter } = require("./overviewRouter");

// Shared, bounded cache so concurrent viewers reuse one working-day calendar read.
const cachedCalendar = createGateCalendarCache(loadCalendar, { ttlMs: 10 * 60000 });

module.exports = createPlanningOverviewRouter({
  query: (text, params) => pool_smart.query(text, params),
  loadWorkingCalendar: async (start, end) => (await cachedCalendar(start, end)).calendar,
});
