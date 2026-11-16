const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");

const routePath = path.join(
  __dirname,
  "../routes/10.17.87.244/Planning System/PO Balance/PO Balance.js"
);

function selectDistinctHistoryRows(rows, sql) {
  assert.match(sql, /SELECT DISTINCT ON \(h\.prd_name, h\.due_date, h\.source_rev\)/i);
  assert.match(sql, /\bcalculation_state\b/i);
  assert.match(
    sql,
    /ORDER BY[\s\S]*h\.source_rev DESC,\s*\(COALESCE\(h\.calculation_state, ''\) = 'calculated'\) DESC,\s*h\.calculated_at DESC,\s*h\.run_id DESC/i
  );

  const sorted = [...rows].sort((a, b) => {
    if (a.prd_name !== b.prd_name) return a.prd_name.localeCompare(b.prd_name);
    if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    if (a.source_rev !== b.source_rev) return b.source_rev - a.source_rev;

    const aCalc = a.calculation_state === "calculated" ? 1 : 0;
    const bCalc = b.calculation_state === "calculated" ? 1 : 0;
    if (aCalc !== bCalc) return bCalc - aCalc;

    if (a.calculated_at !== b.calculated_at) {
      return b.calculated_at.localeCompare(a.calculated_at);
    }
    return b.run_id.localeCompare(a.run_id);
  });

  const seen = new Set();
  const result = [];
  for (const row of sorted) {
    const key = `${row.prd_name}|${row.due_date}|${row.source_rev}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

async function withPOBalanceApi(rows, callback) {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes("FROM planning.po_balance_history")) {
        const [prdName, dueDate] = params;
        const filtered = rows.filter(
          (r) => r.prd_name === prdName && r.due_date === dueDate
        );
        return { rows: selectDistinctHistoryRows(filtered, sql) };
      }
      return { rows: [] };
    },
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release() {},
    }),
  };

  const context = {
    module: { exports: {} },
    exports: {},
    console,
    process,
    setInterval: () => 0,
    clearInterval: () => {},
    require(name) {
      if (name === "express") return express;
      if (name === "../../config") return { pool_smart: pool };
      if (name === "../Auth/Auth") {
        return { verifyPlanner: (_req, _res, next) => next() };
      }
      throw new Error(`Unexpected dependency in PO Balance.js: ${name}`);
    },
  };

  vm.runInNewContext(fs.readFileSync(routePath, "utf8"), context);

  const app = express();
  app.use(express.json());
  app.use(context.module.exports);

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const port = server.address().port;

  try {
    await callback(async (urlPath) => {
      const response = await fetch(`http://127.0.0.1:${port}${urlPath}`);
      return {
        status: response.status,
        body: await response.json(),
        cacheControl: response.headers.get("cache-control"),
      };
    }, queries);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /history validates required prd_name and due_date parameters", async () => {
  await withPOBalanceApi([], async (get, queries) => {
    const missingDue = await get("/history?prd_name=MCI-224S-0E");
    assert.equal(missingDue.status, 400);
    assert.equal(missingDue.body.status, "ERROR");
    assert.equal(queries.length, 0);
  });
});

test("GET /history prefers calculated snapshot over newer source_only rows for the same source_rev", async () => {
  const sampleRows = [
    // Rev 0 had calculated F/G before newer source revisions caused subsequent runs to log source_only
    {
      run_id: "run-0a",
      calculated_at: "2026-11-09 10:07:02",
      source_update_at: "2026-11-06 08:00:01",
      source_rev: 0,
      prd_name: "MCI-224S-0E",
      item: "94MCI224S0E",
      due_date: "2026-11-23",
      po_bal: 50000,
      unmovement: 0,
      f_g: 21009,
      net_required_pcs: -28991,
      rem_unmovement: 0,
      rem_fg: 0,
      status: "production plan",
      calculation_state: "calculated",
    },
    {
      run_id: "run-0b",
      calculated_at: "2026-11-11 16:39:18",
      source_update_at: "2026-11-06 08:00:01",
      source_rev: 0,
      prd_name: "MCI-224S-0E",
      item: "94MCI224S0E",
      due_date: "2026-11-23",
      po_bal: 50000,
      unmovement: 0,
      f_g: 63764,
      net_required_pcs: 0,
      rem_unmovement: 0,
      rem_fg: 13764,
      status: "ready",
      calculation_state: "calculated",
    },
    {
      run_id: "run-2a",
      calculated_at: "2026-11-16 13:55:17",
      source_update_at: "2026-11-06 08:00:01",
      source_rev: 0,
      prd_name: "MCI-224S-0E",
      item: null,
      due_date: "2026-11-23",
      po_bal: 50000,
      unmovement: null,
      f_g: null,
      net_required_pcs: null,
      rem_unmovement: null,
      rem_fg: null,
      status: null,
      calculation_state: "source_only",
    },
    // Rev 1 was only ever logged as source_only
    {
      run_id: "run-2a",
      calculated_at: "2026-11-16 13:55:17",
      source_update_at: "2026-11-11 17:09:53",
      source_rev: 1,
      prd_name: "MCI-224S-0E",
      item: null,
      due_date: "2026-11-23",
      po_bal: 37500,
      unmovement: null,
      f_g: null,
      net_required_pcs: null,
      rem_unmovement: null,
      rem_fg: null,
      status: null,
      calculation_state: "source_only",
    },
    // Rev 2 is the active calculated revision
    {
      run_id: "run-2a",
      calculated_at: "2026-11-16 13:55:17",
      source_update_at: "2026-11-11 18:00:09",
      source_rev: 2,
      prd_name: "MCI-224S-0E",
      item: "94MCI224S0E",
      due_date: "2026-11-23",
      po_bal: 50000,
      unmovement: 0,
      f_g: 118425,
      net_required_pcs: 0,
      rem_unmovement: 0,
      rem_fg: 68425,
      status: "ready",
      calculation_state: "calculated",
    },
  ];

  await withPOBalanceApi(sampleRows, async (get) => {
    const res = await get("/history?prd_name=MCI-224S-0E&due_date=2026-11-23");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "OK");
    assert.equal(res.body.data.length, 3);

    const byRev = new Map(res.body.data.map((r) => [r.source_rev, r]));

    assert.equal(byRev.get(0).calculation_state, "calculated");
    assert.equal(byRev.get(0).f_g, 63764);
    assert.equal(byRev.get(0).status, "ready");
    assert.equal(byRev.get(0).calculated_at, "2026-11-11 16:39:18");

    assert.equal(byRev.get(1).calculation_state, "source_only");
    assert.equal(byRev.get(1).po_bal, 37500);
    assert.equal(byRev.get(1).f_g, null);
    assert.equal(byRev.get(1).status, null);

    assert.equal(byRev.get(2).calculation_state, "calculated");
    assert.equal(byRev.get(2).f_g, 118425);
    assert.equal(byRev.get(2).status, "ready");
  });
});
