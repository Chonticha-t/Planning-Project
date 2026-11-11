const { pool_smart } = require("../../config");
const { verifyAdmin } = require("../Auth/Auth");
const { loadCalendar } = require("../../../../utils/workingCalendar");
const { createGateCalendarCache } = require("../../../../utils/gateCalendarCache");
const { createCapacityLevelingRouter } = require("../../../../utils/capacityLevelingRouter");

// 10.17.87.244 / Planning System / Capacity setting and Capacity Leveling
module.exports = createCapacityLevelingRouter({
  pool: pool_smart,
  verifyAdmin,
  loadCalendar: createGateCalendarCache(loadCalendar),
});
