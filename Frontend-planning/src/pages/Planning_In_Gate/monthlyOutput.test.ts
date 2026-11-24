/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { computeMonthlyKpis, observedMonth, observedTotals, validateMonthlyOutput, validateOutputLots } from "./monthlyOutput.ts";
import type { OutputGroup, OutputSelection } from "./monthlyOutput.ts";

const row: OutputGroup = { gate: "GATE_A", product: "PRODUCT_A", date: "2026-11-12", shift: "N/S", lots: 2, pcs: 100, sheets: 10.2 };
const checkedAt = "2026-11-13T01:00:00.000Z";
const payload = () => ({ month: "2026-11", category: "ALL", search: "", checkedAt,
  coverage: "observed_only", rows: [row], workToday: "2026-11-13", firstRecordedAt: checkedAt, lastRecordedAt: checkedAt,
  shiftRules: [{ timeZone: "Asia/Bangkok", dayStart: "08:00:00", nightStart: "20:00:00" }] });

test("absence, unknown quantity and confirmed zero are distinct", () => {
  assert.equal(observedTotals([], "pcs").total, null);
  assert.equal(observedTotals([{ ...row, pcs: null }], "pcs").total, null);
  assert.equal(observedTotals([{ ...row, pcs: 0 }], "pcs").total, 0);
  assert.equal(observedTotals([{ ...row, pcs: null }], "lots").total, 2);
  assert.equal(observedTotals([row, { ...row, pcs: null }], "pcs").total, null);
});

test("night-only output, actual-only products and dates remain visible without a saved plan or calendar", () => {
  const result = observedMonth([row, { ...row, product: "UNPLANNED", date: "2026-11-15", sheets: 2.2 }], "sheets");
  assert.equal(result.ds, null);
  assert.equal(result.hasDs, false);
  assert.equal(result.hasNs, true);
  assert.equal(result.products.has("UNPLANNED"), true);
  assert.equal(result.dates.has("2026-11-15"), true);
  assert.equal(result.cells.get(JSON.stringify(["PRODUCT_A", "2026-11-12"]))?.total, 10.2);
  assert.ok(Math.abs(result.total! - 12.4) < 1e-9, "sheets are not rounded per record");
});

test("summary response validation rejects stale scopes, duplicates and malformed data", () => {
  assert.equal(validateMonthlyOutput(payload(), "2026-11", "ALL", "").rows.length, 1);
  for (const value of [{ ...payload(), month: "2026-10" }, { ...payload(), category: "SMT" },
    { ...payload(), rows: [row, row] }, { ...payload(), rows: [{ ...row, pcs: -1 }] },
    { ...payload(), rows: [{ ...row, date: "2026-11-31" }] }, { ...payload(), rows: [{ ...row, shift: "X" }] },
    { ...payload(), shiftRules: [{ timeZone: "Invalid", dayStart: "08:00:00", nightStart: "20:00:00" }] }]) {
    assert.throws(() => validateMonthlyOutput(value, "2026-11", "ALL", ""));
  }
});

test("detail pages must match the selected gate, date, product, snapshot and descending cursor", () => {
  const selection: OutputSelection = { month: "2026-11", category: "ALL", search: "", gate: "GATE_A", date: row.date, product: row.product, asOf: checkedAt };
  const detail = { id: "10", gate: row.gate, product: row.product, lot: "LOT_A", nextGate: "GATE_B", date: row.date,
    shift: row.shift, pcs: null, sheets: null, outAt: checkedAt, timeZone: "Asia/Bangkok" };
  const page = { month: selection.month, category: "ALL", search: "", checkedAt, rows: [detail], nextCursor: null };
  assert.equal(validateOutputLots(page, selection, "11").rows[0].pcs, null);
  for (const value of [{ ...page, checkedAt: "2026-11-13T02:00:00.000Z" },
    { ...page, rows: [{ ...detail, gate: "OTHER" }] }, { ...page, rows: [detail, detail] },
    { ...page, nextCursor: "9" }, { ...page, rows: [{ ...detail, product: "OTHER" }] }]) {
    assert.throws(() => validateOutputLots(value, selection, "11"));
  }
  assert.throws(() => validateOutputLots(page, selection, "10"));
});

test("monthly KPIs compute daily average across active output days and count past days below plan", () => {
  const actual = observedMonth([
    { ...row, date: "2026-11-20", shift: "D/S", lots: 6, pcs: 600, sheets: 60 },
    { ...row, date: "2026-11-20", shift: "N/S", lots: 6, pcs: 600, sheets: 60 },
    { ...row, date: "2026-11-21", shift: "D/S", lots: 7, pcs: 700, sheets: 70 },
    { ...row, date: "2026-11-23", shift: "N/S", lots: 6, pcs: 600, sheets: 60 },
    { ...row, date: "2026-11-24", shift: "D/S", lots: 3, pcs: 300, sheets: 30 },
  ], "lots");
  const days = [
    { date: "2026-11-19", plan: 5 },  // past, planned, no output
    { date: "2026-11-20", plan: 10 }, // past, 12 >= 10 -> OK
    { date: "2026-11-21", plan: 10 }, // past, 7 < 10 -> below
    { date: "2026-11-22", plan: 0 },  // past, off / no plan
    { date: "2026-11-23", plan: 8 },  // past, 6 < 8 -> below
    { date: "2026-11-24", plan: 10 }, // today -> excluded from below plan
    { date: "2026-11-25", plan: 10 }, // future -> excluded from below plan
  ];
  const metrics = computeMonthlyKpis(actual, days, "2026-11-24", true);
  assert.equal(metrics.activeOutputDays, 4);
  assert.equal(metrics.dailyAverage, 7);
  assert.equal(metrics.belowPlanDays, 2);
  assert.equal(metrics.comparedPlanDays, 3);
  assert.equal(metrics.noOutputPlanDays, 1);
  assert.deepEqual(metrics.belowPlanDates, ["2026-11-21", "2026-11-23"]);

  const noPlan = computeMonthlyKpis(actual, days, "2026-11-24", false);
  assert.equal(noPlan.dailyAverage, 7);
  assert.equal(noPlan.comparedPlanDays, 0);
  assert.equal(noPlan.belowPlanDays, 0);

  const unknownQty = observedMonth([{ ...row, date: "2026-11-21", pcs: null }], "pcs");
  const unknownMetrics = computeMonthlyKpis(unknownQty, [{ date: "2026-11-21", plan: 100 }], "2026-11-24", true);
  assert.equal(unknownMetrics.activeOutputDays, 1);
  assert.equal(unknownMetrics.dailyAverage, null);
  assert.equal(unknownMetrics.comparedPlanDays, 0);
});
