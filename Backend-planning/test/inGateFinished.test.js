const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createInGateRoutingRouter, resolveRoute } = require("../routes/inGateRouting");
const { inferFinished, categoryFor } = require("../routes/inGateFinished");
const date = "2026-11-12";
const routes = ["GATE-A", "GATE-B", "GATE-B", "GATE-C"].map((gate, index) => ({
  prd_name: "PRODUCT-A", factory_desc: "FACTORY-A", seq: (index + 1) * 10, proc_id: `P${index}`,
  proc_disp: `PROCESS-${index}`, gate_name: gate, step_in_gate: 1, total_proc_in_gate: 1,
  updated_at: "2026-11-12 08:00", proc_type: "FPC", prd_category: "FPC",
}));
const wip = (extra = {}) => ({ lot: "LOT-A", prd_name: "PRODUCT-A", factory_desc: "FACTORY-A",
  seq: 20, proc_disp: "PROCESS-1", scan_type: "SCAN IN", scanned_at: `${date}T22:56:00.000`, updated_at: `${date} 23:00`, ...extra });
const infer = (rows, master = routes) => inferFinished(rows, master, date, resolveRoute);

test("next gate SCAN IN finishes the immediate previous gate using in_date, without requiring SCAN OUT", () => {
  const result = infer([wip()]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].gate, "GATE-A");
  assert.equal(result.rows[0].nextGate, "GATE-B");
  assert.equal(result.rows[0].scannedAt, `${date}T22:56:00.000`);
  assert.equal(result.rows[0].processGroup, "EFPC_GEN");
  assert.equal("pcs" in result.rows[0], false, "WIP quantity must not become an invented passed quantity");
});
test("later processes inside the next gate still finish its preceding gate, never the same gate", () => {
  const row = infer([wip({ seq: 30, proc_disp: "PROCESS-2" })]).rows[0];
  assert.equal(row.gate, "GATE-A");
  assert.equal(row.nextGate, "GATE-B");
});
test("a scan further downstream only proves the immediate previous transition at that timestamp", () => {
  const result = infer([wip({ seq: 40, proc_disp: "PROCESS-3" })]);
  assert.deepEqual(result.rows.map(row => row.gate), ["GATE-B"]);
});
test("SCAN OUT, missing time and another calendar day are excluded; midnight belongs to its literal date", () => {
  assert.equal(infer([wip({ scan_type: "SCAN OUT" }), wip({ scanned_at: null }), wip({ scanned_at: "2026-11-13T00:00:00.000" })]).rows.length, 0);
  assert.equal(infer([wip({ scanned_at: `${date}T00:00:00.000` })]).rows.length, 1);
  assert.equal(infer([wip({ scan_type: " scan\u00a0 in " })]).rows.length, 1);
});
test("ambiguous routing, incorrect sequence and missing identities are excluded instead of guessed", () => {
  assert.equal(infer([wip()], [...routes, { ...routes[1], seq: 25 }]).rows.length, 0);
  assert.equal(infer([wip({ seq: 99 })]).rows.length, 0);
  assert.equal(infer([wip({ prd_name: null })]).rows.length, 0);
  assert.equal(infer([wip({ lot: null })]).rows.length, 0);
});
test("no predecessor and PRE_FFPC never create finished cards", () => {
  assert.equal(infer([wip({ seq: 10, proc_disp: "PROCESS-0" })]).rows.length, 0);
  assert.equal(infer([wip()], [{ ...routes[0], gate_name: "PRE_FFPC" }, ...routes.slice(1)]).rows.length, 0);
});
test("duplicate evidence is one physical lot per gate; repeated gate visits respect the occurrence", () => {
  assert.equal(infer([wip(), wip()]).rows.length, 1);
  const revisits = routes.map((row, index) => ({ ...row, gate_name: index === 2 ? "GATE-A" : row.gate_name }));
  assert.equal(infer([wip({ seq: 30, proc_disp: "PROCESS-2" })], revisits).rows[0].gate, "GATE-B");
});
test("category follows routing, preserving unknown and conflicting product aliases", () => {
  assert.equal(categoryFor("PRODUCT-A", routes.map(row => ({ ...row, proc_disp: `AT-${row.proc_disp}` }))), "EFPC_AUTO");
  assert.equal(categoryFor("PRODUCT-A", routes.map(row => ({ ...row, prd_category: "SMT" }))), "SMT");
  assert.equal(categoryFor("PRODUCT-A", [...routes, { ...routes[0], prd_name: "PRODUCTA" }]), null);
});

async function withApi(callback, { fail = false } = {}) {
  const queries = [];
  const pool = { connect: async () => ({ release: () => queries.push(["RELEASE"]), query: async (sql, params) => {
    queries.push([sql, params]);
    if (fail && sql.includes("FROM planning.gate_output_log")) throw new Error("Internal connection details");
    return { rows: sql.includes("FROM planning.gate_output_log") ? [{
      prd_name: "PRODUCT-A",
      lot_no: "LOT-A",
      gate_name: "GATE-A",
      next_gate: "GATE-B",
      source_process: "PROCESS-1",
      scan_type: "SCAN IN",
      scanned_at: `${date}T22:56:00.000`,
      process_group: "EFPC_GEN",
      updated_at: `${date} 23:00`,
    }] : [] };
  } }) };
  const app = express();
  app.use(createInGateRoutingRouter({ pool }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try { await callback(async day => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/finished?date=${encodeURIComponent(day)}`);
    return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
  }, queries); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test("finished endpoint is available without authentication or planner middleware", async () => {
  await withApi(async (api) => {
    const result = await api(date);
    assert.equal(result.status, 200);
    assert.equal(result.cache, "no-store");
    assert.equal(result.body.data.date, date);
    assert.equal(result.body.data.rows.length, 1);
    assert.equal(result.body.data.rows[0].lotNo, "LOT-A");
    assert.equal(result.body.data.rows[0].gate, "GATE-A");
  });
});

test("anonymous finished requests validate dates before database access", async () => {
  await withApi(async (api, queries) => {
    for (const day of ["2026-02-30", "2026-11-12' OR true --", ""]) assert.equal((await api(day)).status, 400);
    assert.equal(queries.length, 0);
  });
});
test("API reads all observed lots from gate_output_log in a parameterized read-only snapshot", async () => {
  await withApi(async (api, queries) => {
    const result = await api(date);
    assert.equal(result.status, 200);
    assert.equal(result.cache, "no-store");
    assert.equal(result.body.data.coverage, "latest_wip_only");
    assert.equal(result.body.data.rows.length, 1);
    assert.ok(queries[0][0].includes("REPEATABLE READ READ ONLY"));
    const scan = queries.find(([sql]) => sql.includes("FROM planning.gate_output_log"));
    assert.deepEqual(scan[1], [date]);
    assert.match(scan[0], /g\.source_in_date >= \$1::date AND g\.source_in_date < \$1::date/);
    assert.match(scan[0], /FROM active_plan p/);
    assert.match(scan[0], /planned_on_day/);
    assert.ok(!queries.some(([sql]) => /^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(sql)));
    assert.equal(queries.at(-2)[0], "COMMIT");
    assert.equal(queries.at(-1)[0], "RELEASE");
  });
});
test("source failures are explicit and release the connection without leaking database details", async () => {
  await withApi(async (api, queries) => {
    const result = await api(date);
    assert.equal(result.status, 503);
    assert.ok(!JSON.stringify(result.body).includes("Internal connection"));
    assert.equal(queries.at(-2)[0], "ROLLBACK");
    assert.equal(queries.at(-1)[0], "RELEASE");
  }, { fail: true });
});
