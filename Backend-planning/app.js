const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const compression = require("compression");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const indexRouter = require("./routes/index");
const planning = require("./Config/Main/planning/planning");

const app = express();

app.use(cors());
app.use(compression());
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api_p1", indexRouter);
app.use("/api_p1/planning", planning);

// Error Handling
app.use(function (req, res, next) {
  if (req.path.startsWith("/api_p1")) {
    return res.status(404).json({
      status: "ERROR",
      code: "NOT_FOUND",
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
    });
  }
  next(createError(404));
});

app.use(function (err, req, res, next) {
  if (req.path.startsWith("/api_p1")) {
    return res.status(err.status || 500).json({
      status: "ERROR",
      code: err.code || "INTERNAL_ERROR",
      message: err.message || "Internal Server Error",
    });
  }
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
