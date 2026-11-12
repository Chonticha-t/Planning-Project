const { performance } = require("node:perf_hooks");
const { randomUUID } = require("node:crypto");

const round = value => value === null ? null : Math.round(value * 1000) / 1000;
const percentile = (values, fraction) => {
  const sorted = [...values].sort((left, right) => left - right);
  return round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]);
};

// Scope profiling to this route; retain timings only, never SQL, parameters or rows.
const createGateTableProfiler = (pool, {
  enabled = () => process.env.PLANNING_GATE_PERF !== "false",
  now = () => performance.now(),
  log = record => console.info("[gate-table-perf]", JSON.stringify(record)),
} = {}) => {
  const windows = { filtered: [], unfiltered: [] };
  return res => {
    if (!(typeof enabled === "function" ? enabled() : enabled)) {
      return { query: (sql, params) => pool.query(sql, params), json: body => res.json(body), cache() {} };
    }
    const started = now();
    const metrics = {
      requestId: randomUUID(), filtered: false,
      poolWaitMs: null, queryMs: null, jsonMs: null,
      responseBytes: null, rowCount: null,
      cacheStatus: null, cacheReason: null, cachePreviousAgeMs: null, cacheAgeMs: null, cacheStats: null,
      poolWaitingAtStart: pool.waitingCount ?? null,
      poolTotalAtStart: pool.totalCount ?? null,
      poolIdleAtStart: pool.idleCount ?? null,
    };
    let recorded = false;
    const finish = aborted => {
      if (recorded) return;
      recorded = true;
      res.removeListener("finish", onFinish);
      res.removeListener("close", onClose);
      const totalMs = now() - started;
      const successful = !aborted && res.statusCode >= 200 && res.statusCode < 300;
      const window = windows[metrics.filtered ? "filtered" : "unfiltered"];
      if (successful) {
        window.push(totalMs);
        if (window.length > 100) window.shift();
      }
      try {
        log({
          ...metrics, poolWaitMs: round(metrics.poolWaitMs),
          queryMs: round(metrics.queryMs), jsonMs: round(metrics.jsonMs),
          status: res.statusCode, outcome: aborted ? "aborted" : successful ? "ok" : "error",
          totalMs: round(totalMs), windowSamples: window.length,
          p50TotalMs: window.length ? percentile(window, 0.5) : null,
          p95TotalMs: window.length ? percentile(window, 0.95) : null,
        });
      } catch {
        // Diagnostic output must never make a successful response fail.
      }
    };
    const onFinish = () => finish(false);
    const onClose = () => finish(true);
    res.once("finish", onFinish);
    res.once("close", onClose);

    return {
      cache({ value, status, reason, previousAgeMs, ageMs, stats }, filtered) {
        metrics.cacheStatus = status;
        metrics.cacheReason = reason;
        metrics.cachePreviousAgeMs = previousAgeMs;
        metrics.cacheAgeMs = ageMs;
        metrics.cacheStats = stats;
        metrics.filtered = filtered;
        metrics.rowCount = value.length;
      },
      async query(sql, params) {
        metrics.filtered = params.length > 0;
        const waiting = now();
        let client;
        try {
          client = await pool.connect();
        } finally {
          // Includes acquiring/establishing a connection, not just pool queueing.
          metrics.poolWaitMs = now() - waiting;
        }
        const querying = now();
        try {
          // Includes PostgreSQL execution, DB-to-app transfer and driver decoding.
          const result = await client.query(sql, params);
          metrics.rowCount = result.rows.length;
          return result;
        } finally {
          metrics.queryMs = now() - querying;
          client.release();
        }
      },
      json(body) {
        const originalSend = res.send;
        const serializing = now();
        res.send = function measuredSend(payload) {
          res.send = originalSend;
          // Express has serialized once using its existing replacer/escape settings.
          metrics.jsonMs = now() - serializing;
          metrics.responseBytes = typeof payload === "string" ? Buffer.byteLength(payload, "utf8")
            : Buffer.isBuffer(payload) ? payload.length : null;
          const phases = [["pool", metrics.poolWaitMs], ["query", metrics.queryMs],
            ["json", metrics.jsonMs], ["prepare", now() - started]];
          res.set("Server-Timing", phases.filter(([, value]) => value !== null)
            .map(([name, value]) => `${name};dur=${round(value)}`).join(", "));
          res.set("X-Gate-Request-Id", metrics.requestId);
          return originalSend.call(this, payload);
        };
        try {
          return res.json(body);
        } finally {
          res.send = originalSend;
        }
      },
    };
  };
};

module.exports = { createGateTableProfiler };
