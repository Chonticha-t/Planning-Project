const express = require("express");
const router = express.Router();

// GET /api_p1/planning/planning_summary_gate/status
router.get("/status", (req, res) => {
  return res.json({
    status: "OK",
    message: "Planning Summary Gate API is ready",
  });
});

module.exports = router;

