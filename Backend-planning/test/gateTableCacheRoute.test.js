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
  const records = [];
  let clock = 0, queries = 0, fail = false;
  let source = [{ lot_no: "SYNTHETIC_PRIVATE_LOT", process_group: "SMT" }];
  const query = async (sql, params) => {
    assert.equal(typeof sql, "string");
    queries++;
    if (fail) throw new Error("Synthetic query outage");
    return { rows: source.map(row => ({ ...row, filter: params.join("|") })) };
  };
  const pool = { query, connect: async () => ({ query, release() {} }) };
  const context = {
    module: { exports: {} }, process: { env },
    require(name) {
      if (name === "express") return { Router: () => router };
      if (name.endsWith("/config")) return { pool_smart: pool };
      if (name.endsWith("/workingCalendar")) return {};
      if (name === "./gateTablePerformance") return {
        createGateTableProfiler: pool => createGateTableProfiler(pool, { enabled: true, log: record => records.push(record) }),
      };
      if (name.endsWith("/gateCalendarCache")) return require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
      if (name === "./gateTableCache") {
        const { createGateTableCache } = require(path.join(routeDirectory, "gateTableCache"));
        return { createGateTableCache: options => createGateTableCache({ ...options, now: () => clock }) };
      }
      if (name === "./routedGates") return require(path.join(routeDirectory, "routedGates"));
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(routeDirectory, "Planning Summary Gate.js"), "utf8"), context);
  const app = express();
  app.use(require("compression")());
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
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
      queries: () => queries, records,
      advanceTime(milliseconds) { clock += milliseconds; },
      setSource(value) { source = value; },
      setFail(value) { fail = value; },
    });
  } finally {
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

test("table responses report the remaining cache lifetime and load changes after expiry", async () => withGate(async h => {
  const initial = await h.get();
  assert.equal(initial.body.cache_ttl_ms, 60000);
  h.setSource([{ lot_no: "NEW" }]);
  h.advanceTime(45000);
  const hit = await h.get();
  assert.equal(hit.response.headers.get("x-gate-cache"), "HIT");
  assert.deepEqual(hit.body.data, initial.body.data);
  assert.equal(hit.body.cache_ttl_ms, 15000);
  assert.equal(h.queries(), 1);
  h.advanceTime(15000);
  const updated = await h.get();
  assert.equal(updated.response.headers.get("x-gate-cache"), "MISS");
  assert.equal(updated.response.headers.get("x-gate-cache-reason"), "EXPIRED");
  assert.equal(updated.body.data[0].lot_no, "NEW");
  assert.equal(updated.body.cache_ttl_ms, 60000);
  assert.equal(h.queries(), 2);
}));

test("TTL zero disables table caching for a production baseline", async () => withGate(async h => {
  const responses = await Promise.all([h.get(), h.get(), h.get()]);
  assert.ok(responses.every(({ response }) => response.headers.get("x-gate-cache") === "BYPASS"));
  assert.ok(responses.every(({ body }) => body.cache_ttl_ms === null));
  assert.equal(h.queries(), 3);
}, { PLANNING_GATE_CACHE_TTL_MS: "0" }));

test("failed table reads after expiry return an error and can be retried", async () => withGate(async h => {
  await h.get();
  h.advanceTime(60000);
  h.setFail(true);
  const failed = await h.get();
  assert.equal(failed.response.status, 503);
  assert.equal(failed.body.status, "ERROR");
  h.setFail(false);
  const recovered = await h.get();
  assert.equal(recovered.response.headers.get("x-gate-cache"), "MISS");
  assert.equal(recovered.body.cache_ttl_ms, 60000);
  assert.equal(h.queries(), 3);
}));

test("route honors the configured byte budget and makes oversized responses visible", async () => withGate(async h => {
  h.setSource([{ payload: "X".repeat(2048) }]);
  const first = await h.get();
  const second = await h.get();
  assert.equal(first.response.headers.get("x-gate-cache"), "OVERSIZE");
  assert.equal(first.body.cache_ttl_ms, null);
  assert.equal(second.response.headers.get("x-gate-cache"), "OVERSIZE");
  assert.equal(h.queries(), 2);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.records.at(-1).cacheStats.oversized, 2);
  assert.equal(h.records.at(-1).cacheStats.entries, 0);
  assert.equal(h.records.at(-1).cacheStats.maxBytes, 1024);
}, { PLANNING_GATE_CACHE_MAX_MB: String(1 / 1024) }));
