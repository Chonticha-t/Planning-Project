const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createInGateRoutingRouter } = require("../routes/inGateRouting");
const { workDate } = require("../routes/inGateMonthly");

const rule = { timeZone: "Asia/Bangkok", dayStart: "08:00:00", nightStart: "20:00:00" };
const group = { gate: "GATE_A", product: "PRODUCT_A", date: "2026-11-12", shift: "N/S", lots: 1, pcs: "100", sheets: "10.5" };
const asOf = "2026-11-13T00:00:00.000Z";
const lot = id => ({ id: String(id), gate: "GATE_A", product: "PRODUCT_A", lot: `LOT_${id}`,
  nextGate: "GATE_B", date: "2026-11-12", shift: "N/S", outAt: "2026-11-12T22:00:00Z", pcs: "100", sheets: null, timeZone: "Asia/Bangkok" });

async function withApi(callback, { groups = [group], lots = [lot(1)], fail = false } = {}) {
  const queries = [];
  const pool = { connect: async () => ({ release: () => queries.push(["RELEASE"]), query: async (sql, params) => {
    queries.push([sql, params]);
    if (sql.includes("FROM planning.gate_output_log")) {
      if (fail) throw new Error("Sensitive database details");
      if (sql.includes("JSONB_AGG")) return { rows: [{ first_recorded_at: asOf, last_recorded_at: asOf, rules: [rule] }] };
      if (sql.includes("output_id::text")) return { rows: lots };
      return { rows: groups };
    }
    return { rows: [] };
  } }) };
  const app = express();
  app.use(createInGateRoutingRouter({ pool }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try {
    await callback(async (endpoint, params) => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/output/${endpoint}?${new URLSearchParams(params)}`);
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    }, queries);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("work date retains overnight output on the previous working date across month and year boundaries", () => {
  assert.equal(workDate(new Date("2027-01-01T00:59:59Z"), rule), "2026-12-31");
  assert.equal(workDate(new Date("2027-01-01T01:00:00Z"), rule), "2027-01-01");
  assert.equal(workDate(new Date("2026-12-01T00:00:00Z"), rule), "2026-11-30");
  assert.equal(workDate(new Date("2026-11-12T17:00:00Z"), rule), "2026-11-12");
});

test("monthly API aggregates stored work dates and quantities without joining a plan or routing", async () => {
  await withApi(async (api, queries) => {
    const result = await api("month", { month: "2026-11", category: "ALL", search: "  LOT_%'  " });
    assert.equal(result.status, 200);
    assert.equal(result.cache, "no-store");
    assert.equal(result.body.data.coverage, "observed_only");
    assert.equal(result.body.data.rows[0].pcs, 100);
    assert.equal(result.body.data.rows[0].sheets, 10.5);
    const query = queries.find(([sql]) => sql.includes("COUNT(*)::integer"));
    assert.deepEqual(query[1].slice(0, 3), ["2026-11-01", "ALL", "LOT_%'"]);
    assert.ok(!query[0].includes("LOT_%'"));
    assert.match(query[0], /COUNT\(qty_pcs\) = COUNT\(\*\)/);
    assert.match(query[0], /GROUP BY gate_name, prd_name, work_date, shift/);
    assert.ok(queries[0][0].includes("READ ONLY"));
    assert.ok(!queries.some(([sql]) => /work_plan|prd_routing_master|^(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/.test(sql)));
    assert.equal(queries.at(-2)[0], "COMMIT");
    assert.equal(queries.at(-1)[0], "RELEASE");
  });
});

test("invalid month, category, repeated params and overlong searches never reach the database", async () => {
  await withApi(async (api, queries) => {
    for (const params of [{ month: "2026-13" }, { month: "0000-01" }, { month: "2026-11'" },
      { month: "2026-11", category: "ADMIN" }, { month: "2026-11", search: "x".repeat(151) }]) {
      assert.equal((await api("month", params)).status, 400);
    }
    assert.equal(queries.length, 0);
  });
});

test("unknown quantities stay null and no matching records remain an empty observation set", async () => {
  await withApi(async api => {
    assert.equal((await api("month", { month: "2026-11" })).body.data.rows[0].pcs, null);
  }, { groups: [{ ...group, pcs: null }] });
  await withApi(async api => {
    assert.deepEqual((await api("month", { month: "2026-11" })).body.data.rows, []);
  }, { groups: [] });
});

test("lots use keyset pagination pinned to the summary timestamp and do not expose raw source columns", async () => {
  await withApi(async (api, queries) => {
    const result = await api("lots", { month: "2026-11", category: "EFPC_AUTO", search: "PRODUCT", gate: "GATE_A", date: "2026-11-12", product: "PRODUCT_A", asOf, cursor: "999" });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.rows.length, 100);
    assert.equal(result.body.data.nextCursor, "101");
    assert.equal(result.body.data.rows[0].sheets, null);
    const query = queries.find(([sql]) => sql.includes("output_id::text"));
    assert.deepEqual(query[1], ["2026-11-01", "EFPC_AUTO", "PRODUCT", asOf, "GATE_A", "2026-11-12", "PRODUCT_A", "999"]);
    assert.match(query[0], /output_id < \$8::bigint/);
    assert.match(query[0], /recorded_at <= \$4::timestamptz/);
    assert.match(query[0], /LIMIT 101/);
  }, { lots: Array.from({ length: 101 }, (_, i) => lot(200 - i)) });
});

test("invalid detail selection, cursor overflow and future snapshots are rejected before connecting", async () => {
  await withApi(async (api, queries) => {
    const params = { month: "2026-11", gate: "GATE_A", date: "2026-11-12", asOf };
    for (const change of [{ date: "2026-11-31" }, { date: "2026-10-12" }, { gate: "" },
      { cursor: "9223372036854775808" }, { cursor: "1 OR true" }, { asOf: "9999-01-01T00:00:00.000Z" }, { asOf: "invalid" }]) {
      assert.equal((await api("lots", { ...params, ...change })).status, 400);
    }
    assert.equal(queries.length, 0);
  });
});

test("source failures and summary limits return an explicit failure and always roll back/release", async () => {
  for (const options of [{ fail: true }, { groups: Array(20001).fill(group) }]) {
    await withApi(async (api, queries) => {
      const result = await api("month", { month: "2026-11" });
      assert.equal(result.status, 503);
      assert.equal(result.body.code, "OUTPUT_UNAVAILABLE");
      assert.ok(!JSON.stringify(result.body).includes("Sensitive"));
      assert.equal(queries.at(-2)[0], "ROLLBACK");
      assert.equal(queries.at(-1)[0], "RELEASE");
    }, options);
  }
});
