const express = require("express");
const app = express();

// 10.17.87.244 / Planning System / หน้า SO Balance
const { router: auth_router } = require("../../../routes/10.17.87.244/Planning System/Auth/Auth");
const so_balance = require("../../../routes/10.17.87.244/Planning System/SO Balance/SO Balance");

const planning_summary = require("../../../routes/10.17.87.244/Planning System/Planning Summary/Planning Summary");
const planning_summary_gate = require("../../../routes/10.17.87.244/Planning System/Planning Summary Gate/Planning Summary Gate");
const capacity_leveling = require("../../../routes/10.17.87.244/Planning System/Capacity Leveling/Capacity Leveling");
const planning_in_gate = require("../../../routes/10.17.87.244/Planning System/Planning In Gate/Planning In Gate");
const forecast = require("../../../routes/10.17.87.244/Planning System/Forecast/Forecast");

app.use("/auth", auth_router);
app.use("/planning_summary", planning_summary);
app.use("/planning_summary_gate", planning_summary_gate);
app.use("/capacity_leveling", capacity_leveling);
app.use("/in_gate", planning_in_gate);
app.use("/forecast", forecast);
app.use("/", so_balance);

module.exports = app;
