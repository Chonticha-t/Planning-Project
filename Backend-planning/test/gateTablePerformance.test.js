const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const express = require("express");
const compression = require("compression");
const { createGateTableProfiler } = require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTablePerformance");

async function withServer(app, callback) {
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test("profiling preserves Express JSON settings, compression and response while logging metadata only", async () => {
  const records = [];
  let releases = 0;
  const rows = [{ prd_name: "SYNTHETIC_PRIVATE<>&", text: "ข้อมูลจำลอง".repeat(200), hidden: "OMIT" }];
  const pool = {
    totalCount: 2, idleCount: 1, waitingCount: 0,
    async connect() {
      await new Promise(resolve => setTimeout(resolve, 5));
      return {
        async query(sql, params) {
          assert.equal(sql, "SELECT synthetic");
          assert.deepEqual(params, ["PRIVATE_FILTER"]);
          await new Promise(resolve => setTimeout(resolve, 5));
          return { rows };
        },
        release() { releases++; },
      };
    },
  };
  const profile = createGateTableProfiler(pool, { enabled: true, log: record => records.push(record) });
  const app = express();
  app.set("json spaces", 2);
  app.set("json escape", true);
  const replacer = (key, value) => key === "hidden" ? undefined : value;
  app.set("json replacer", replacer);
  app.use(compression());
  app.get("/table", async (req, res) => {
    const measured = profile(res);
    const result = await measured.query("SELECT synthetic", ["PRIVATE_FILTER"]);
    measured.json({ status: "OK", data: result.rows });
  });
  await withServer(app, async base => {
    const response = await fetch(`${base}/table`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-encoding"), "gzip");
    assert.match(response.headers.get("server-timing"), /pool;dur=[\d.]+, query;dur=[\d.]+, json;dur=[\d.]+, prepare;dur=[\d.]+/);
    const text = await response.text();
    const expected = JSON.stringify({ status: "OK", data: rows }, replacer, 2)
      .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
    assert.equal(text, expected);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(records.length, 1);
    const record = records[0];
    assert.equal(record.requestId, response.headers.get("x-gate-request-id"));
    assert.equal(record.responseBytes, Buffer.byteLength(text, "utf8"));
    assert.equal(record.rowCount, 1);
    assert.equal(record.filtered, true);
    assert.equal(record.poolTotalAtStart, 2);
    assert.equal(record.poolIdleAtStart, 1);
    assert.equal(record.outcome, "ok");
    assert.ok(record.poolWaitMs > 0 && record.queryMs > 0 && record.jsonMs >= 0);
    assert.ok(record.totalMs >= record.poolWaitMs + record.queryMs + record.jsonMs - 0.01);
    assert.doesNotMatch(JSON.stringify(record), /SYNTHETIC_PRIVATE|PRIVATE_FILTER|SELECT|ข้อมูลจำลอง|OMIT/);
  });
  assert.equal(releases, 1);
});

test("connection and query failures remain safe 503 responses and release acquired clients", async () => {
  for (const phase of ["connect", "query"]) {
    const records = [];
    let releases = 0;
    const profile = createGateTableProfiler({
      async connect() {
        if (phase === "connect") throw new Error("SYNTHETIC_PRIVATE_CONNECTION");
        return {
          async query() { throw new Error("SYNTHETIC_PRIVATE_QUERY"); },
          release() { releases++; },
        };
      },
    }, { enabled: true, log: record => records.push(record) });
    const app = express();
    app.get("/table", async (req, res) => {
      const measured = profile(res);
      try {
        await measured.query("SELECT synthetic", []);
      } catch {
        res.status(503);
        measured.json({ status: "ERROR", data: [], message: "Unable to load planning gate data. Please try again." });
      }
    });
    await withServer(app, async base => {
      const response = await fetch(`${base}/table`);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).status, "ERROR");
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(records.length, 1);
      assert.equal(records[0].windowSamples, 0);
      assert.equal(records[0].p95TotalMs, null);
      assert.equal(records[0].outcome, "error");
      assert.equal(records[0].queryMs === null, phase === "connect");
      assert.doesNotMatch(JSON.stringify(records), /SYNTHETIC_PRIVATE/);
    });
    assert.equal(releases, phase === "connect" ? 0 : 1);
  }
});

test("serialization and diagnostic logging failures do not break the error response", async () => {
  const app = express();
  const profile = createGateTableProfiler({}, { enabled: true, log: () => { throw new Error("Synthetic logger outage"); } });
  app.get("/table", (req, res) => {
    const measured = profile(res);
    const originalSend = res.send;
    const cycle = {};
    cycle.self = cycle;
    assert.throws(() => measured.json(cycle), /circular/i);
    assert.equal(res.send, originalSend);
    res.status(503);
    measured.json({ status: "ERROR", data: [] });
  });
  await withServer(app, async base => {
    const response = await fetch(`${base}/table`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "ERROR", data: [] });
  });
});

test("disabled profiling uses the original pool and response methods", async () => {
  const result = { rows: [] };
  const pool = { query: async () => result };
  const res = { json: body => body };
  const measured = createGateTableProfiler(pool, { enabled: false })(res);
  assert.equal(await measured.query("SELECT synthetic", []), result);
  assert.equal(measured.json(result), result);
});

test("rolling percentiles are bounded and exclude errors and duplicate close events", () => {
  let time = 0;
  const records = [];
  const profile = createGateTableProfiler({}, { enabled: true, now: () => time, log: record => records.push(record) });
  for (let i = 1; i <= 105; i++) {
    const res = new EventEmitter();
    res.statusCode = 200;
    profile(res);
    time += i;
    res.emit("finish");
    res.emit("close");
    assert.equal(res.listenerCount("finish"), 0);
    assert.equal(res.listenerCount("close"), 0);
  }
  assert.equal(records.length, 105);
  assert.equal(records.at(-1).windowSamples, 100);
  assert.equal(records.at(-1).p50TotalMs, 55);
  assert.equal(records.at(-1).p95TotalMs, 100);
  const aborted = new EventEmitter();
  aborted.statusCode = 200;
  profile(aborted);
  time += 9999;
  aborted.emit("close");
  assert.equal(records.at(-1).outcome, "aborted");
  assert.equal(records.at(-1).windowSamples, 100);
  assert.equal(records.at(-1).p95TotalMs, 100);
});
