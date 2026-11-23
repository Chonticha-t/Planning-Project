const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const express = require("express");

const dir = path.resolve(__dirname, "../routes/10.17.87.244/Planning System/Planning Overview");
const { buildDays, buildOverviewRows, productType } = require(path.join(dir, "overviewCalc"));
const { createPlanningOverviewRouter } = require(path.join(dir, "overviewRouter"));

// 2026-11-23 is a Monday, so 2026-11-29 is a Sunday.
const day = (date, extra = {}) => ({ date, dow: "", is_today: false, ...extra });

test("without a calendar, Sundays are hidden and today is flagged", () => {
  const days = buildDays("2026-11-23", "2026-11-30", "2026-11-23", null);
  assert.deepEqual(days.map((d) => d.date), [
    "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-30",
  ]);
  assert.equal(days[0].is_today, true);
  assert.equal(days[0].dow, "Mon");
  assert.equal(days[6].dow, "Mon");
});

test("the working-day calendar decides which days are shown", () => {
  const holidays = new Set(["2026-11-24"]);
  const days = buildDays("2026-11-23", "2026-11-25", "2026-11-23", (d) => !holidays.has(d));
  assert.deepEqual(days.map((d) => d.date), ["2026-11-23", "2026-11-25"]);
});

test("item prefix 94 is FPC and 95 is SMT", () => {
  assert.equal(productType(" 94ABC"), "FPC");
  assert.equal(productType("95XYZ"), "SMT");
  assert.equal(productType(null), "");
});

test("B/L FG is FG stock plus WIP minus the cumulative PO balance", () => {
  const days = [day("2026-11-23"), day("2026-11-24"), day("2026-11-25"), day("2026-11-26")];
  const [row] = buildOverviewRows({
    days,
    poLines: [
      { prd_name: "Model I", due_date: "2026-11-24", qty: 40500 },
      { prd_name: "Model I", due_date: "2026-11-26", qty: 15200 },
    ],
    supply: [{ prd_name: "Model I", item: "94MODELI", f_g: 17000, unmovement: 594 }],
    wip: [{ prd_name: "Model I", wip_qty: 8197, wip_lots: 3, wip_lots_no_yield: 1 }],
  });
  assert.equal(row.wip_lots_no_yield, 1);
  assert.equal(row.type, "FPC");
  assert.equal(row.fg_stock, 17594);
  assert.deepEqual(row.po_new, [0, 40500, 0, 15200]);
  assert.deepEqual(row.po_cum, [0, 40500, 40500, 55700]);
  assert.deepEqual(row.bl, [25791, -14709, -14709, -29909]);
  assert.equal(row.first_short, 1);
  assert.equal(row.end_bl, -29909);
  assert.equal(row.wip_lots, 3);
});

test("PO due on a hidden day lands on the next shown day; earlier PO opens on the first day", () => {
  const days = [day("2026-11-24"), day("2026-11-28"), day("2026-11-30")];
  const [row] = buildOverviewRows({
    days,
    poLines: [
      { prd_name: "A", due_date: "2026-11-23", qty: 100 }, // before the range: carried into day 1
      { prd_name: "A", due_date: "2026-11-29", qty: 50 }, // Sunday: shown on Monday 30th
      { prd_name: "A", due_date: "2026-12-01", qty: 999 }, // after the last day: ignored
      { prd_name: "A", due_date: "2026-11-28", qty: 0 }, // no balance: ignored
    ],
  });
  assert.deepEqual(row.po_new, [100, 0, 50]);
  assert.deepEqual(row.po_cum, [100, 100, 150]);
  assert.equal(row.fg_stock, 0);
  assert.equal(row.wip_qty, 0);
});

test("products that go short first are on top, covered products last", () => {
  const days = [day("2026-11-23"), day("2026-11-24")];
  const rows = buildOverviewRows({
    days,
    poLines: [
      { prd_name: "Covered", due_date: "2026-11-23", qty: 10 },
      { prd_name: "Later", due_date: "2026-11-24", qty: 500 },
      { prd_name: "Today", due_date: "2026-11-23", qty: 200 },
    ],
    supply: [{ prd_name: "Covered", f_g: 100 }, { prd_name: "Later", f_g: 100 }, { prd_name: "Today", f_g: 100 }],
  });
  assert.deepEqual(rows.map((r) => r.prd_name), ["Today", "Later", "Covered"]);
  assert.deepEqual(rows.map((r) => r.first_short), [0, 1, -1]);
});

async function withApi({ calendar, failCalendar = false } = {}, callback) {
  const queries = [];
  const query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes("CURRENT_DATE")) return { rows: [{ today: "2026-11-23" }] };
    if (sql.includes("SUM(b.so_bal)")) {
      return { rows: [{ prd_name: "Model H", due_date: "2026-11-25", qty: 12400 }] };
    }
    if (sql.includes("MAX(f_g)")) {
      return { rows: [{ prd_name: "Model H", item: "95H", f_g: 4300, unmovement: 0, updated_at: "2026-11-23 08:00:00" }] };
    }
    if (sql.includes("wip_in_process")) {
      return { rows: [{ prd_name: "Model H", wip_qty: 5203, wip_lots: 2, updated_at: "2026-11-23 08:05:00" }] };
    }
    throw new Error("unexpected query");
  };
  const loadWorkingCalendar = async () => {
    if (failCalendar) throw new Error("calendar down");
    return calendar;
  };
  const app = express();
  app.use(createPlanningOverviewRouter({ query, loadWorkingCalendar }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await callback(async (urlPath) => {
      const response = await fetch(base + urlPath);
      return { status: response.status, body: await response.json() };
    }, queries);
  } finally {
    console.warn = originalWarn;
    await new Promise((resolve) => server.close(resolve));
  }
}

test("GET /table defaults to 14 days from today and returns B/L per shown day", async () => {
  const calendar = { isWorking: (d) => d !== "2026-11-24" };
  await withApi({ calendar }, async (get, queries) => {
    const { status, body } = await get("/table");
    assert.equal(status, 200);
    assert.equal(body.status, "OK");
    assert.equal(body.data.start, "2026-11-23");
    assert.equal(body.data.end, "2026-12-06");
    assert.equal(body.data.calendar, "working-calendar");
    assert.equal(body.data.days.length, 13);
    assert.ok(!body.data.days.some((d) => d.date === "2026-11-24"));
    const [row] = body.data.products;
    assert.equal(row.prd_name, "Model H");
    assert.equal(row.type, "SMT");
    assert.deepEqual(row.bl.slice(0, 3), [9503, -2897, -2897]);
    assert.equal(body.data.updated_at, "2026-11-23 08:05:00");
    const poQuery = queries.find((q) => q.sql.includes("SUM(b.so_bal)"));
    assert.deepEqual(poQuery.params, ["2026-12-06"]);
  });
});

test("GET /table falls back to hiding Sundays when the calendar is unavailable", async () => {
  await withApi({ failCalendar: true }, async (get) => {
    const { body } = await get("/table?days=7");
    assert.equal(body.data.calendar, "fallback");
    assert.deepEqual(body.data.days.map((d) => d.dow), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  });
});

test("GET /table passes the item prefix as a bound LIKE parameter", async () => {
  await withApi({ calendar: { isWorking: () => true } }, async (get, queries) => {
    await get("/table?item_prefix=95&startdate=2026-11-25&days=3");
    const poQuery = queries.find((q) => q.sql.includes("SUM(b.so_bal)"));
    assert.deepEqual(poQuery.params, ["2026-11-27", "95%"]);
  });
});

test("GET /table rejects bad parameters", async () => {
  await withApi({}, async (get) => {
    assert.equal((await get("/table?startdate=2026-13-01")).status, 400);
    assert.equal((await get("/table?days=0")).status, 400);
    assert.equal((await get("/table?days=63")).status, 400);
    assert.equal((await get("/table?item_prefix=9'")).status, 400);
  });
});
