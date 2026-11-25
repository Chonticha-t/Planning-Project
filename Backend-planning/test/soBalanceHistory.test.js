const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");

const routesRoot = path.resolve(__dirname, "../routes");
const routePaths = fs.readdirSync(routesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(routesRoot, entry.name, "Planning System/SO Balance/SO Balance.js"))
  .filter((candidate) => fs.existsSync(candidate));
assert.equal(routePaths.length, 1, "Expected one SO Balance route");

async function withSOBalanceApi({ rows = [], fail = false } = {}, callback) {
  const queries = [];
  const errors = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (fail) throw new Error("SYNTHETIC_PRIVATE_DETAIL");
      return { rows };
    },
    async connect() {
      return { query: async () => ({ rows: [] }), release() {} };
    },
  };
  const context = {
    module: { exports: {} },
    exports: {},
    console: { ...console, error: (...args) => errors.push(args) },
    process,
    setInterval: () => 0,
    clearInterval() {},
    require(name) {
      if (name === "express") return express;
      if (name === "../../config") return { pool_smart: pool };
      if (name === "../Auth/Auth") {
        return { verifyPlanner: (_req, _res, next) => next() };
      }
      throw new Error("Unexpected SO Balance dependency");
    },
  };
  vm.runInNewContext(fs.readFileSync(routePaths[0], "utf8"), context);
  const app = express();
  app.use(express.json());
  app.use(context.module.exports);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const port = server.address().port;
  try {
    await callback(async (urlPath) => {
      const response = await fetch("http://127.0.0.1:" + port + urlPath);
      return {
        status: response.status,
        body: await response.json(),
        cacheControl: response.headers.get("cache-control"),
      };
    }, queries, errors);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("history rejects missing product or due date before querying", async () => {
  await withSOBalanceApi({}, async (get, queries) => {
    for (const url of ["/history", "/history?prd_name=TEST-PRODUCT", "/history?due_date=2026-11-23"]) {
      const res = await get(url);
      assert.equal(res.status, 400);
      assert.equal(res.body.status, "ERROR");
    }
    assert.equal(queries.length, 0);
  });
});

test("history rejects invalid dates and overlong products before querying", async () => {
  await withSOBalanceApi({}, async (get, queries) => {
    for (const due of ["2026-02-30", "2026-02-29", "2026-13-01", "invalid", "0000-01-01"]) {
      const res = await get("/history?prd_name=TEST-PRODUCT&due_date=" + due);
      assert.equal(res.status, 400);
    }
    const res = await get("/history?prd_name=" + "X".repeat(101) + "&due_date=2026-11-23");
    assert.equal(res.status, 400);
    assert.equal(queries.length, 0);
  });
});

test("history returns SO/PO line revision rows with active and due-date move status", async () => {
  const rows = [
    {
      prd_name: "TEST-PRODUCT", due_date: "2026-11-23", so_no: "SO-001", po_no: "PO-001",
      source_rev: 0, po_bal: null, source_update_at: null,
      is_active: true, moved_to_dates: [], moved_from_dates: ["2026-12-01"],
    },
    {
      prd_name: "TEST-PRODUCT", due_date: "2026-11-23", so_no: "SO-001", po_no: "PO-001",
      source_rev: 1, po_bal: 0, source_update_at: "2026-11-17 08:30:00",
      is_active: true, moved_to_dates: [], moved_from_dates: ["2026-12-01"],
    },
    {
      prd_name: "TEST-PRODUCT", due_date: "2026-11-23", so_no: "SO-002", po_no: "PO-001",
      source_rev: 0, po_bal: 50, source_update_at: "2026-11-17 09:00:00",
      is_active: false, moved_to_dates: ["2026-11-30"], moved_from_dates: [],
    },
  ];
  await withSOBalanceApi({ rows }, async (get, queries) => {
    const res = await get("/history?prd_name=TEST-PRODUCT&due_date=2026-11-23");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, rows);
    assert.match(res.cacheControl, /no-store/);
    assert.equal(queries.length, 1);
    const { sql, params } = queries[0];
    assert.match(sql, /FROM planning\.so_balance_history_so_no h/);
    assert.match(sql, /LEFT JOIN smart\.smart_pln_po_so_no c/);
    assert.match(sql, /h\.so_no,/);
    assert.match(sql, /h\.po_no,/);
    assert.match(sql, /h\.rev::int AS source_rev/);
    assert.match(sql, /to_char\(h\.updated_at,[^\n]+AS source_update_at/);
    assert.match(sql, /AS is_active,/);
    assert.match(sql, /AS moved_to_dates,/);
    assert.match(sql, /AS moved_from_dates/);
    assert.match(sql, /WHERE h\.prd_name = \$1 AND h\.due_date = CAST\(\$2 AS date\)/);
    assert.match(sql, /ORDER BY \(c\.prd_name IS NOT NULL\) DESC, h\.so_no ASC, h\.po_no ASC, h\.rev ASC/);
    assert.doesNotMatch(sql, /calculation_state|run_id|calculated_at|unmovement|net_required_pcs/);
    assert.deepEqual(Array.from(params), ["TEST-PRODUCT", "2026-11-23"]);
  });
});

test("table reads latest source_rev of active lines from planning.so_balance_history_so_no", async () => {
  await withSOBalanceApi({ rows: [] }, async (get, queries) => {
    const res = await get("/table");
    assert.equal(res.status, 200);
    assert.equal(queries.length, 1);
    const { sql } = queries[0];
    assert.match(sql, /FROM planning\.so_balance_history_so_no h/);
    assert.match(sql, /INNER JOIN smart\.smart_pln_po_so_no c/);
    assert.doesNotMatch(sql, /FROM planning\.so_balance_history\b/);
  });
});

test("history accepts a valid leap date", async () => {
  await withSOBalanceApi({}, async (get, queries) => {
    const res = await get("/history?prd_name=TEST-PRODUCT&due_date=2028-02-29");
    assert.equal(res.status, 200);
    assert.equal(queries[0].params[1], "2028-02-29");
  });
});

test("history binds a product containing SQL syntax as a parameter", async () => {
  const product = "TEST-' OR 1=1 --";
  await withSOBalanceApi({}, async (get, queries) => {
    const res = await get("/history?prd_name=" + encodeURIComponent(product) + "&due_date=2026-11-23");
    assert.equal(res.status, 200);
    assert.equal(queries[0].params[0], product);
    assert.equal(queries[0].sql.includes(product), false);
  });
});

test("history returns an empty successful result when no revisions were saved", async () => {
  await withSOBalanceApi({}, async (get) => {
    const res = await get("/history?prd_name=TEST-PRODUCT&due_date=2026-11-23");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "OK");
    assert.deepEqual(res.body.data, []);
  });
});

test("history hides database details in both the response and log", async () => {
  await withSOBalanceApi({ fail: true }, async (get, _queries, errors) => {
    const res = await get("/history?prd_name=TEST-PRODUCT&due_date=2026-11-23");
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { status: "ERROR", data: [], message: "Internal Server Error" });
    assert.equal(JSON.stringify(errors).includes("SYNTHETIC_PRIVATE_DETAIL"), false);
  });
});
