const { performance } = require("node:perf_hooks");

const createCapacityLoadProfiler = (res, pool, {
  log = record => console.info("[capacity-load-perf]", JSON.stringify(record)),
  enabled = process.env.PLANNING_CAPACITY_PERF !== "false",
} = {}) => {
  if (!enabled) return { db: pool, cache() {}, json: body => res.json(body) };
  const started = performance.now();
  const metrics = { queryCount: 0, databaseWorkMs: 0, cacheStatus: null, cacheReason: null,
    cacheAgeMs: null, cachePreviousAgeMs: null, cacheStats: null, cacheReadMs: null,
    rowCount: null, jsonMs: null, responseBytes: null };
  let recorded = false;
  const finish = aborted => {
    if (recorded) return;
    recorded = true;
    res.removeListener("finish", onFinish);
    res.removeListener("close", onClose);
    try {
      // Timings/counts only: never include rows, SQL, parameters or cache keys.
      const record = { ...metrics, status: res.statusCode, aborted, totalMs: performance.now() - started };
      for (const field of ["databaseWorkMs", "cacheReadMs", "jsonMs", "totalMs"]) {
        if (record[field] !== null) record[field] = Math.round(record[field] * 1000) / 1000;
      }
      log(record);
    } catch { /* Diagnostics must not affect the response. */ }
  };
  const onFinish = () => finish(false);
  const onClose = () => finish(true);
  res.once("finish", onFinish);
  res.once("close", onClose);
  return {
    db: { async query(...args) {
      const start = performance.now();
      metrics.queryCount++;
      try { return await pool.query(...args); }
      finally { metrics.databaseWorkMs += performance.now() - start; }
    } },
    cache(cached, elapsed) {
      metrics.cacheStatus = cached.status;
      metrics.cacheReason = cached.reason;
      metrics.cacheAgeMs = cached.ageMs;
      metrics.cachePreviousAgeMs = cached.previousAgeMs;
      metrics.cacheStats = cached.stats;
      metrics.cacheReadMs = elapsed;
      metrics.rowCount = cached.value.arrivalRows.length;
    },
    json(body) {
      const send = res.send;
      const start = performance.now();
      res.send = function (payload) {
        res.send = send;
        metrics.jsonMs = performance.now() - start;
        metrics.responseBytes = typeof payload === "string" ? Buffer.byteLength(payload) : null;
        return send.call(this, payload);
      };
      try { return res.json(body); }
      finally { res.send = send; }
    },
  };
};

module.exports = { createCapacityLoadProfiler };
