const express = require("express");
const app = express();

// 10.17.87.244 / Planning System / หน้า PO Balance
const po_balance = require("../../../routes/10.17.87.244/Planning System/PO Balance/PO Balance");

const planning_summary = require("../../../routes/10.17.87.244/Planning System/Planning Summary/Planning Summary");

app.use("/planning_summary", planning_summary);
app.use("/", po_balance);

module.exports = app;
