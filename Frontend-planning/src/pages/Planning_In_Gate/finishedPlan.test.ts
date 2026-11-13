/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import type { LotItem } from "../Capacity_Leveling/types";
import type { FinishedEvidence } from "./hooks/useFinishedToday";
import { allocateBoardShifts } from "../Capacity_Leveling/utils/boardShiftAllocation.ts";
import { buildWorkRows, indexFinishedPlans, matchFinishedPlan } from "./finishedPlan.ts";

const lot = (extra: Partial<LotItem> = {}): LotItem => ({
  id: "saved-card", workKey: "work", gate: "GATE-A", label: "LOT-A", product: "PRODUCT-A",
  item: null, qty: 1000, sheets: 125, kind: "lot", status: "production plan", gateState: "coming",
  processGroup: "EFPC_GEN", currentGate: null, currentProc: null, isHold: false,
  dueDate: "2026-11-20", arriveBy: "2026-11-11", mustOut: "2026-11-15", baseDate: "2026-11-11",
  plannedDate: "2026-11-11", savedDate: "2026-11-11", overdue: false, sourceChanged: false,
  prevGate: null, prevDate: null, nextGate: "GATE-B", nextDate: null,
  loadMin: 150, leadDays: 1, standardShiftMin: { day: 100, night: 100 }, ...extra,
});
const evidence: FinishedEvidence = { id: "observed", product: "PRODUCT-A", lotNo: "LOT-A", gate: "GATE-A",
  nextGate: "GATE-B", currentProcess: "PROCESS-B", scannedAt: "2026-11-13T22:56:00.000", scanType: "SCAN IN",
  processGroup: "EFPC_GEN", sourceUpdatedAt: "2026-11-13 23:00" };

test("unique saved identity supplies quantities and minutes even when planned date differs from scan date", () => {
  const saved = lot();
  const matched = matchFinishedPlan(evidence, indexFinishedPlans([saved]));
  assert.equal(matched.status, "matched");
  assert.equal(matched.lot, saved);
  assert.equal(matched.lot?.qty, 1000);
  assert.equal(matched.lot?.sheets, 125);
  assert.equal(matched.lot?.loadMin, 150);
  assert.equal(matched.lot?.plannedDate, "2026-11-11");
});

test("wrong product, wrong gate and work outside the plan never borrow another lot's quantities", () => {
  const index = indexFinishedPlans([lot()]);
  for (const record of [{ ...evidence, product: "PRODUCTA" }, { ...evidence, gate: "GATE-C" }, { ...evidence, lotNo: "LOT-UNKNOWN" }]) {
    assert.deepEqual(matchFinishedPlan(record, index), { status: "unplanned", lot: null });
  }
});

test("several saved dates remain ambiguous rather than selecting the first or the scan-day match", () => {
  const saved = [lot(), lot({ id: "another-date", plannedDate: "2026-11-13" })];
  assert.deepEqual(matchFinishedPlan(evidence, indexFinishedPlans(saved)), { status: "ambiguous", lot: null });
});

test("duplicate references to the same board identity do not create ambiguity", () => {
  const saved = lot();
  assert.equal(matchFinishedPlan(evidence, indexFinishedPlans([saved, saved])).status, "matched");
});

test("Need WIP and unidentified cards never become matched physical plan lots", () => {
  assert.equal(matchFinishedPlan(evidence, indexFinishedPlans([lot({ kind: "need" }), lot({ id: "unknown", kind: "unidentified" })])).status, "unplanned");
});

test("null quantities stay unknown while zero remains zero", () => {
  const matched = matchFinishedPlan(evidence, indexFinishedPlans([lot({ qty: null, sheets: null, loadMin: 0 })]));
  assert.equal(matched.lot?.qty, null);
  assert.equal(matched.lot?.sheets, null);
  assert.equal(matched.lot?.loadMin, 0);
});

test("mixed-product board quantities cannot be attributed in full to one finished product", () => {
  const saved = lot({ product: "Multiple products", allocations: [
    { prd_name: "PRODUCT-A" }, { prd_name: "PRODUCT-B" },
  ] as LotItem["allocations"] });
  assert.equal(matchFinishedPlan(evidence, indexFinishedPlans([saved])).status, "ambiguous");
});

test("matched identity uses the full saved queue's allocation, preserving Night and Over minutes", () => {
  const saved = lot();
  const earlier = lot({ id: "earlier", label: "LOT-EARLIER", loadMin: 100 });
  const allocations = allocateBoardShifts({ capacity: { "GATE-A": { "2026-11-11": {
    off: false, hasOt: false, capacityMin: 200,
    shifts: { day: { open: true, otOn: false, capacityMin: 100 }, night: { open: true, otOn: false, capacityMin: 100 } },
  } } } }, [earlier, saved]);
  const matched = matchFinishedPlan(evidence, indexFinishedPlans([earlier, saved]));
  assert.deepEqual(allocations.get(matched.lot!.id), { status: "over", dayMin: 0, nightMin: 100, overflowMin: 50 });
});

test("a queued row changes to Finished with the exact same lot data and original position", () => {
  const saved = lot();
  const before = buildWorkRows([saved], [saved], []);
  const after = buildWorkRows([saved], [saved], [evidence]);
  assert.equal(before.queue[0].lot, saved);
  assert.equal(after.queue.length, 0);
  assert.equal(after.finished[0].lot, before.queue[0].lot);
  assert.equal(after.all[0], after.finished[0]);
  assert.equal(after.finished[0].sequence, 1);
  assert.equal(after.finished[0].evidence, evidence);
});

test("All preserves plan ordering with no duplicated finished lot", () => {
  const first = lot({ id: "first", label: "LOT-FIRST" });
  const done = lot();
  const last = lot({ id: "last", label: "LOT-LAST" });
  const rows = buildWorkRows([first, done, last], [first, done, last], [evidence]);
  assert.deepEqual(rows.all.map(row => row.lot?.id), ["first", "saved-card", "last"]);
  assert.deepEqual(rows.queue.map(row => row.lot?.id), ["first", "last"]);
  assert.equal(rows.finished[0].sequence, 2);
});

test("completed work on another planned date keeps that saved row while unplanned work has no plan values", () => {
  const saved = lot();
  const rows = buildWorkRows([], [saved], [evidence, { ...evidence, id: "outside", lotNo: "LOT-OUTSIDE" }]);
  assert.equal(rows.finished[0].lot, saved);
  assert.equal(rows.finished[1].lot, null);
  assert.equal(rows.finished[1].matchStatus, "unplanned");
  assert.equal(rows.all.length, 2);
});

test("ambiguous finished evidence remains a single row without choosing a plan date", () => {
  const first = lot();
  const second = lot({ id: "another-date", plannedDate: "2026-11-12" });
  const rows = buildWorkRows([first], [first, second], [evidence]);
  assert.equal(rows.queue.length, 0);
  assert.equal(rows.all.length, 1);
  assert.equal(rows.all[0].matchStatus, "ambiguous");
  assert.equal(rows.all[0].lot, null);
});
