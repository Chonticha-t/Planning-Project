/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import type { OverviewProduct } from "./types.ts";
import {
  addDays,
  computeKpi,
  computeTotals,
  dayLabel,
  dayWindow,
  filterByUnit,
  filterProducts,
  rangeLabel,
} from "./overviewView.ts";

const product = (overrides: Partial<OverviewProduct> = {}): OverviewProduct => ({
  prd_name: "Model A", item: "94A", type: "FPC", fg_stock: 100, f_g: 100, unmovement: 0,
  wip_qty: 50, wip_lots: 2, wip_lots_no_yield: 0,
  po_new: [0, 200], po_cum: [0, 200], bl: [150, -50], first_short: 1, end_bl: -50,
  ...overrides,
});

test("labels match the design: 23-Nov headers and a 23 Nov – 6 Dec 2026 range", () => {
  assert.equal(dayLabel("2026-11-23"), "23-Nov");
  assert.equal(rangeLabel("2026-11-23", "2026-12-06"), "23 Nov – 6 Dec 2026");
  assert.equal(rangeLabel("2026-12-28", "2027-01-03"), "28 Dec 2026 – 3 Jan 2027");
  assert.equal(addDays("2026-11-23", 13), "2026-12-06");
});

test("unit, short-only and search filters combine", () => {
  const rows = [
    product(),
    product({ prd_name: "Model B", type: "SMT" }),
    product({ prd_name: "Model C", first_short: -1, end_bl: 10, bl: [150, 10] }),
  ];
  assert.deepEqual(filterByUnit(rows, "SMT").map((r) => r.prd_name), ["Model B"]);
  assert.deepEqual(filterProducts(rows, { show: "short", search: "" }).map((r) => r.prd_name), ["Model A", "Model B"]);
  assert.deepEqual(filterProducts(rows, { show: "all", search: "model c" }).map((r) => r.prd_name), ["Model C"]);
});

test("KPIs count short products and total shortage at the end of the range", () => {
  const kpi = computeKpi([
    product(),
    product({ prd_name: "Model C", first_short: -1, end_bl: 10, po_cum: [0, 40], wip_lots_no_yield: 1 }),
  ]);
  assert.equal(kpi.products, 2);
  assert.equal(kpi.short, 1);
  assert.equal(kpi.enough, 1);
  assert.equal(kpi.shortPcs, 50);
  assert.equal(kpi.po, 240);
  assert.equal(kpi.fgStock + kpi.wip, 300);
  assert.equal(kpi.lots, 4);
  assert.equal(kpi.lotsNoYield, 1);
});

test("the B/L total adds up shortages only", () => {
  const totals = computeTotals([product(), product({ bl: [-20, 30], po_cum: [10, 10] })], [0, 1]);
  assert.deepEqual(totals.po, [10, 210]);
  assert.deepEqual(totals.short, [-20, -50]);
  assert.equal(totals.fg, 200);
});

test("paging shows 7 days at a time and the last page ends on the last day", () => {
  assert.deepEqual(dayWindow(10, 0).indexes, [0, 1, 2, 3, 4, 5, 6]);
  const last = dayWindow(10, 7);
  assert.equal(last.from, 3);
  assert.deepEqual(last.indexes, [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(last.maxStart, 3);
  assert.deepEqual(dayWindow(4, 5).indexes, [0, 1, 2, 3]);
});
