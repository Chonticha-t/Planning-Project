const express = require("express");
const app = express();

// 10.17.87.244 / Planning System / หน้า PO Balance
const po_balance = require("../../../routes/10.17.87.244/Planning System/PO Balance/PO Balance");

app.use("/", po_balance);

module.exports = app;
