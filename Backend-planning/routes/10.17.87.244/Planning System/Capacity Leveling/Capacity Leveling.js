const { pool_smart } = require("../../config");
const { verifyPlanner } = require("../Auth/Auth");
const { loadCalendar } = require("../WorkingDayCalendar/workingCalendar");
const { createGateCalendarCache } = require("../WorkingDayCalendar/gateCalendarCache");
const { createCapacityLevelingRouter } = require("./capacityLevelingRouter");

// 10.17.87.244 / Planning System / Capacity setting and Capacity Leveling
module.exports = createCapacityLevelingRouter({
  pool: pool_smart,
  verifyPlanner,
  loadCalendar: createGateCalendarCache(loadCalendar),
});
