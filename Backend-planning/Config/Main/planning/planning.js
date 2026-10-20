const express = require("express");
const app = express();

const table = require("../../../routes/10.17.87.244/smart/planning/planning/Table");
const summary = require("../../../routes/10.17.87.244/smart/planning/planning/summary");
const distinct_product = require("../../../routes/10.17.87.244/smart/planning/planning/distinct_product");

app.use("/table", table);
app.use("/summary", summary);
app.use("/distinct_product", distinct_product);

module.exports = app;
