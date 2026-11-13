const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createInGateRoutingRouter, resolveRoute, parseItems } = require("../routes/inGateRouting");

const item = { key: "card-1", product: "PRODUCT-A", lot: "LOT-A" };
const route = (extra = {}) => ({ prd_name: "PRODUCT-A", factory_desc: "FACTORY-A", seq: 10,
  proc_id: "P1", proc_disp: "PROCESS-A", gate_name: "GATE-A", step_in_gate: 1, total_proc_in_gate: 2, updated_at: "2026-11-13 08:00", ...extra });
const wip = (extra = {}) => ({ lot: "LOT-A", prd_name: "PRODUCT-A", factory_desc: "FACTORY-A", seq: 10,
  proc_disp: "PROCESS-A", updated_at: "2026-11-13 09:00", ...extra });

test("unique WIP process and sequence identify the current step without creating scan history", () => {
  const result = resolveRoute(item, [route(), route({ seq: 20, proc_disp: "PROCESS-B" })], [wip()]);
  assert.equal(result.status, "matched");
  assert.equal(result.current.seq, 10);
  assert.equal(result.current.updatedAt, "2026-11-13 09:00");
  assert.equal(result.steps.length, 2);
  assert.ok(result.steps.every(step => !("done" in step) && !("scanOut" in step)));
});

test("repeated process names never trust an upstream first-occurrence sequence", () => {
  const result = resolveRoute(item, [route(), route({ seq: 30 })], [wip()]);
  assert.equal(result.status, "ambiguous");
  assert.equal(result.current, null);
});

test("display excludes PRE_FFPC but position matching still checks the full master", () => {
  const routes = [route({ gate_name: "PRE_FFPC" }), route({ seq: 20, proc_disp: "PROCESS-B" })];
  const result = resolveRoute(item, routes, [wip()]);
  assert.equal(result.status, "outside_displayed_routing");
  assert.equal(result.current, null);
  assert.equal(result.observed.process, null);
  assert.deepEqual(result.steps.map(step => step.seq), [20]);
  const repeated = resolveRoute(item, [route({ gate_name: "PRE_FFPC" }), route({ seq: 20 })], [wip()]);
  assert.equal(repeated.status, "ambiguous");
  assert.equal(repeated.current, null);
  assert.ok(repeated.steps.every(step => step.gate !== "PRE_FFPC"));
});

test("products with only excluded routing do not invent a first displayed process", () => {
  const result = resolveRoute(item, [route({ gate_name: " pre_ffpc\u00a0" })], [wip()]);
  assert.equal(result.status, "no_displayed_routing");
  assert.deepEqual(result.steps, []);
  assert.equal(result.current, null);
});

test("factory scope and NBSP normalization are respected without merging product aliases", () => {
  assert.equal(resolveRoute(item, [route()], [wip({ proc_disp: "\u00a0PROCESS-A " })]).status, "matched");
  assert.equal(resolveRoute(item, [route()], [wip({ factory_desc: "FACTORY-B" })]).status, "process_not_found");
  assert.equal(resolveRoute(item, [route()], [wip({ prd_name: "PRODUCTA" })]).status, "product_mismatch");
});

test("missing master, WIP, sequence and production-lot identity remain explicit", () => {
  assert.equal(resolveRoute(item, [], [wip()]).status, "no_routing");
  assert.equal(resolveRoute(item, [route()], []).status, "no_wip");
  assert.equal(resolveRoute({ ...item, lot: null }, [route()], []).status, "no_lot");
  assert.equal(resolveRoute(item, [route()], [wip({ seq: 20 })]).status, "inconsistent_position");
  assert.equal(resolveRoute(item, [route()], [wip({ seq: null })]).status, "inconsistent_position");
});

test("malformed, duplicate and oversized identities fail validation", () => {
  for (const items of [[], Array(101).fill(item), [item, item], [{ ...item, product: "" }], [{ ...item, lot: "" }], [{ ...item, key: "x".repeat(2049) }]]) {
    assert.throws(() => parseItems({ items }));
  }
  assert.deepEqual(parseItems({ items: [item] }), [item]);
});

async function withApi(callback, { allowed = true, failure = false } = {}) {
  const queries = [];
  const pool = { connect: async () => ({ release() { queries.push(["RELEASE"]); }, query: async (sql, params) => {
    queries.push([sql, params]);
    if (failure && sql.includes("prd_routing_master")) throw new Error("Sensitive database details");
    return { rows: sql.includes("prd_routing_master") ? [route()] : sql.includes("wip_in_process") ? [wip()] : [] };
  } }) };
  const app = express();
  app.use(express.json());
  app.use(createInGateRoutingRouter({ pool, verifyPlanner: (_req, res, next) => allowed ? next() : res.status(401).json({ code: "UNAUTHORIZED" }) }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try { await callback(async body => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/lookup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  }, queries); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("routing lookup is available without authentication", async () => {
  await withApi(async (api) => {
    const result = await api({ items: [item] });
    assert.equal(result.status, 200);
    assert.equal(result.cache, "no-store");
    assert.equal(result.body.data.results[0].status, "matched");
    assert.equal(result.body.data.results[0].steps.length, 1);
    assert.equal(result.body.data.results[0].current.seq, 10);
  }, { allowed: false });
});

test("anonymous routing requests validate identities before any database access", async () => {
  await withApi(async (api, queries) => { assert.equal((await api({ items: [] })).status, 400); assert.equal(queries.length, 0); }, { allowed: false });
});

test("read-only batch uses parameterized identities and a consistent transaction", async () => {
  await withApi(async (api, queries) => {
    const injected = "PRODUCT-A' OR true --";
    const result = await api({ items: [{ ...item, product: injected }] });
    assert.equal(result.status, 200);
    assert.equal(result.cache, "no-store");
    assert.ok(queries[0][0].includes("REPEATABLE READ READ ONLY"));
    const sql = queries.find(([text]) => text.includes("prd_routing_master"));
    assert.equal(sql[0].includes(injected), false);
    assert.deepEqual(sql[1], [[injected]]);
    assert.ok(queries.some(([text]) => text === "COMMIT"));
    assert.ok(queries.every(([text]) => !/^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(text)));
    assert.equal(queries.at(-1)[0], "RELEASE");
  });
});

test("failed reads roll back, release the connection and hide SQL details", async () => {
  await withApi(async (api, queries) => {
    const result = await api({ items: [item] });
    assert.equal(result.status, 503);
    assert.equal(JSON.stringify(result.body).includes("Sensitive"), false);
    assert.ok(queries.some(([text]) => text === "ROLLBACK"));
    assert.equal(queries.at(-1)[0], "RELEASE");
  }, { failure: true });
});
