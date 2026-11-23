const { pool_smart } = require("../../config");
const { verifyPlanner } = require("../Auth/Auth");
const { createInGateOrderRouter } = require("./inGateOrderRouter");

// 10.17.87.244 / Planning System / Planning In Gate queue order and history
module.exports = createInGateOrderRouter({
  pool: pool_smart,
  verifyPlanner,
});
