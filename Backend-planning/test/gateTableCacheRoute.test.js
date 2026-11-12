const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const { createGateTableProfiler } = require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTablePerformance");

const routeDirectory = path.join(__dirname, "../routes/10.17.87.244/Planning System/Planning Summary Gate");

async function withGate(callback, env = {}) {
  const router = express.Router();
  const handlers = new Map();
  const timers = new Map();
  const records = [];
  let timerId = 0, queries = 0, fingerprint = "1", fail = false;
  let source = [{ lot_no: "SYNTHETIC_PRIVATE_LOT", process_group: "SMT" }];
  let beforeWrite = () => {};
  const query = async (sql, params) => {
    if (typeof sql === "object") {
      if (fail) throw new Error("Synthetic monitor outage");
      return { rows: [{ row_count: "1", content_hash: fingerprint }] };
    }
    queries++;
    if (fail) throw new Error("Synthetic query outage");
    return { rows: source.map(row => ({ ...row, filter: params.join("|") })) };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const context = {
    module: { exports: {} }, process: { env },
    setInterval(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearInterval(id) { timers.delete(id); },
    require(name) {
      if (name === "express") return { Router: () => ({ get(url, handler) {
        handlers.set(url, handler);
        router.get(url, handler);
      } }) };
      if (name.endsWith("/config")) return { pool_smart: pool };
      if (name.endsWith("/workingCalendar")) return {};
      if (name === "./gateTablePerformance") return {
        createGateTableProfiler: pool => createGateTableProfiler(pool, { enabled: true, log: record => records.push(record) }),
      };
      if (name.endsWith("/gateCalendarCache")) return require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
      if (name === "./gateTableCache") return require(path.join(routeDirectory, "gateTableCache"));
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(routeDirectory, "Planning Summary Gate.js"), "utf8"), context);
  const app = express();
  app.use(require("compression")());
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  const { EventEmitter } = require("node:events");
  const streams = [];
  const monitor = () => {
    const req = new EventEmitter(), res = new EventEmitter();
    res.writeHead = () => {};
    res.write = message => { beforeWrite(message); return true; };
    res.destroy = () => {};
    handlers.get("/stream")(req, res);
    streams.push(req);
    return () => req.emit("close");
  };
  const tick = async () => {
    for (const timer of timers.values()) if (timer.delay === 2500) timer.callback();
    await new Promise(resolve => setImmediate(resolve));
  };
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    await callback({
      get: async (query = "") => {
        const response = await fetch(`${base}/table${query}`);
        return { response, body: await response.json() };
      },
      queries: () => queries, records, monitor, tick,
      setSource(value) { source = value; fingerprint = String(Number(fingerprint) + 1); },
      setFail(value) { fail = value; },
      onWrite(callback) { beforeWrite = callback; },
    });
  } finally {
    for (const req of streams) req.emit("close");
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

test("actual table route caches responses, isolates filters, supports Refresh and logs no row data", async () => withGate(async h => {
  const first = await h.get();
  const hit = await h.get();
  assert.equal(first.response.headers.get("x-gate-cache"), "MISS");
  assert.equal(hit.response.headers.get("x-gate-cache"), "HIT");
  assert.deepEqual(hit.body, first.body);
  assert.match(hit.response.headers.get("cache-control"), /no-store/);
  assert.equal(h.queries(), 1);
  await h.get("?prd_category=FPC");
  await h.get("?gate_name=SHIP");
  await h.get("?search=LOT");
  await h.get("?startdate=2026-11-12&skip_holidays=false");
  await h.get("?startdate=2026-11-12&skip_holidays=true");
  assert.equal(h.queries(), 6);
  const forced = await h.get("?refresh=true");
  assert.equal(forced.response.headers.get("x-gate-cache"), "REFRESH");
  assert.equal(h.queries(), 7);
  assert.equal((await h.get()).response.headers.get("x-gate-cache"), "HIT");
  await new Promise(resolve => setImmediate(resolve));
  const cachedRecord = h.records.find(record => record.cacheStatus === "HIT");
  assert.equal(cachedRecord.queryMs, null);
  assert.equal(cachedRecord.poolWaitMs, null);
  assert.equal(cachedRecord.rowCount, 1);
  assert.ok(cachedRecord.cacheStats.hits >= 1);
  assert.doesNotMatch(JSON.stringify(h.records), /SYNTHETIC_PRIVATE_LOT|SELECT|prd_category/);
}));

test("monitor invalidates before notifying viewers, and initial/recovered monitoring drops retained reads", async () => withGate(async h => {
  await h.get();
  h.monitor();
  await h.tick();
  assert.equal((await h.get()).response.headers.get("x-gate-cache"), "MISS");
  h.setSource([{ lot_no: "NEW" }]);
  let notifiedRead;
  h.onWrite(message => {
    if (message.includes("PLANNING_SUMMARY_GATE_UPDATED")) notifiedRead = h.get();
  });
  await h.tick();
  const updated = await notifiedRead;
  assert.equal(updated.response.headers.get("x-gate-cache"), "MISS");
  assert.equal(updated.body.data[0].lot_no, "NEW");
  h.setFail(true);
  await h.tick();
  const failed = await h.get();
  assert.equal(failed.response.status, 503);
  assert.equal(failed.body.status, "ERROR");
  h.setFail(false);
  await h.get(); // A read while the monitor is recovering must also be discarded on recovery.
  await h.tick();
  assert.equal((await h.get()).response.headers.get("x-gate-cache"), "MISS");
}));

test("TTL zero disables table caching for a production baseline", async () => withGate(async h => {
  const responses = await Promise.all([h.get(), h.get(), h.get()]);
  assert.ok(responses.every(({ response }) => response.headers.get("x-gate-cache") === "BYPASS"));
  assert.equal(h.queries(), 3);
}, { PLANNING_GATE_CACHE_TTL_MS: "0" }));

test("navigation keeps cached rows when unchanged and detects changes while nobody was viewing", async () => withGate(async h => {
  const close = h.monitor();
  await h.tick();
  await h.get();
  close();
  const closeAgain = h.monitor();
  await h.tick();
  const back = await h.get();
  assert.equal(back.response.headers.get("x-gate-cache"), "HIT");
  assert.equal(back.response.headers.get("x-gate-cache-reason"), "FRESH");
  assert.equal(h.queries(), 1);
  closeAgain();
  h.setSource([{ lot_no: "CHANGED_WHILE_AWAY" }]);
  h.monitor();
  await h.tick();
  const changed = await h.get();
  assert.equal(changed.response.headers.get("x-gate-cache"), "MISS");
  assert.equal(changed.body.data[0].lot_no, "CHANGED_WHILE_AWAY");
  assert.equal(h.queries(), 2);
}));

test("route honors the configured byte budget and makes oversized responses visible", async () => withGate(async h => {
  h.setSource([{ payload: "X".repeat(2048) }]);
  const first = await h.get();
  const second = await h.get();
  assert.equal(first.response.headers.get("x-gate-cache"), "OVERSIZE");
  assert.equal(second.response.headers.get("x-gate-cache"), "OVERSIZE");
  assert.equal(h.queries(), 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.records.at(-1).cacheStats.oversized, 2);
  assert.equal(h.records.at(-1).cacheStats.entries, 0);
  assert.equal(h.records.at(-1).cacheStats.maxBytes, 1024);
}, { PLANNING_GATE_CACHE_MAX_MB: String(1 / 1024) }));
