/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import type { DayGateLoad, GateCell } from "../types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits.ts";
import { dailyGateTotals } from "./dailyGateTotals.ts";

const gates = [{ gate: "GATE_A" }, { gate: "GATE_B" }];
const cell = (overrides: Partial<GateCell> = {}): GateCell => ({
  loadMin: 100, capacityMin: 100, pct: 100, configured: true, off: false, hasOt: false,
  lotCount: 1, needCount: 0, unidentifiedCount: 0, totalPcs: 100, totalSheets: 10,
  missingPlanning: 0, shiftLoadMin: { day: 50, night: 50 }, ...overrides,
});
const day = (values: Record<string, GateCell>): DayGateLoad => ({
  date: "2026-11-12", dayLabel: "Thu", displayDate: "12/11", isToday: true, isOff: false,
  gates: values, gateStatusDots: {},
});

test("daily load is weighted by minutes instead of summing or averaging gate percentages", () => {
  const source = day({ GATE_A: cell({ loadMin: 200, pct: 200 }), GATE_B: cell({ loadMin: 100, capacityMin: 900, pct: 11 }) });
  const total = dailyGateTotals(source, gates);
  assert.equal(total.loadMin, 300);
  assert.equal(total.capacityMin, 1000);
  assert.equal(total.pct, 30);
  assert.equal(total.overloadGates, 1);
  assert.equal(total.incompleteGates, 0);
});

test("totals use only displayed gates, ignore repeated gate definitions and preserve the source", () => {
  const source = day({ GATE_A: cell(), GATE_B: cell({ loadMin: 900, totalPcs: 900 }) });
  const before = structuredClone(source);
  const total = dailyGateTotals(source, [gates[0], gates[0]]);
  assert.equal(total.pct, 100);
  assert.equal(total.totalPcs, 100);
  assert.equal(total.lotCount, 1);
  assert.deepEqual(source, before);
});

test("quantities sum gate workloads including demand and sheets are rounded only after summing", () => {
  const source = day({
    GATE_A: cell({ totalPcs: 120, totalSheets: 0.2, needCount: 1 }),
    GATE_B: cell({ loadMin: 0, pct: 0, totalPcs: 80, totalSheets: 0.3, lotCount: 0, needCount: 2, unidentifiedCount: 1 }),
  });
  const total = dailyGateTotals(source, gates);
  assert.equal(total.totalPcs, 200);
  assert.equal(total.totalSheets, 0.5);
  assert.equal(formatGateQuantity(total.totalSheets, "sheet"), "1");
  assert.equal(total.lotCount, 1);
  assert.equal(total.needCount, 3);
  assert.equal(total.unidentifiedCount, 1);
  assert.equal(total.pct, 50);
});

test("missing capacity makes load percent unavailable without hiding known quantities", () => {
  const source = day({ GATE_A: cell(), GATE_B: cell({ configured: false, capacityMin: null }) });
  const total = dailyGateTotals(source, gates);
  assert.equal(total.capacityMin, null);
  assert.equal(total.pct, null);
  assert.equal(total.totalPcs, 200);
  assert.equal(total.lotCount, 2);
  assert.equal(total.incompleteGates, 1);
});

test("incomplete planning and unknown quantities do not become zeros", () => {
  const source = day({ GATE_A: cell({ missingPlanning: 1 }), GATE_B: cell({ totalPcs: null, totalSheets: null }) });
  const total = dailyGateTotals(source, gates);
  assert.equal(total.loadMin, null);
  assert.equal(total.pct, null);
  assert.equal(total.capacityMin, 200);
  assert.equal(total.totalPcs, null);
  assert.equal(total.totalSheets, null);
  assert.equal(total.incompleteGates, 1);
});

test("closed gates still contribute workload and report arrivals exceeding zero capacity", () => {
  const total = dailyGateTotals(day({ GATE_A: cell(), GATE_B: cell({ off: true, loadMin: 200, capacityMin: 0 }) }), gates);
  assert.equal(total.loadMin, 300);
  assert.equal(total.capacityMin, 100);
  assert.equal(total.pct, 300);
  assert.equal(total.overloadGates, 1);
  assert.equal(total.off, false);
  const closed = dailyGateTotals(day({ GATE_A: cell({ off: true, loadMin: 0, capacityMin: 0 }) }), [gates[0]]);
  assert.equal(closed.off, true);
  assert.equal(closed.pct, null);
  assert.equal(closed.overloadGates, 0);
});

test("zero capacity and missing gate cells are distinct from a complete zero-load day", () => {
  const zero = dailyGateTotals(day({ GATE_A: cell({ loadMin: 10, capacityMin: 0 }) }), [gates[0]]);
  assert.equal(zero.pct, null);
  assert.equal(zero.overloadGates, 1);
  assert.equal(zero.incompleteGates, 0);
  const missing = dailyGateTotals(day({ GATE_A: cell() }), gates);
  assert.equal(missing.incompleteGates, 1);
  assert.equal(missing.pct, null);
  assert.equal(missing.totalPcs, null);
  assert.equal(missing.lotCount, null);
  const empty = dailyGateTotals(day({ GATE_A: cell({ loadMin: 0 }) }), [gates[0]]);
  assert.equal(empty.pct, 0);
});

test("preview totals use projected workload minutes, not the original or rounded cell percentages", () => {
  const source = day({ GATE_A: cell({ loadMin: 250, pct: 100, previewPct: 250 }), GATE_B: cell({ loadMin: 50, pct: 100, previewPct: 50 }) });
  assert.equal(dailyGateTotals(source, gates).pct, 150);
  assert.equal(dailyGateTotals(source, gates).overloadGates, 1);
});

test("invalid and overflowing numeric totals fail safely", () => {
  for (const value of [NaN, Infinity, -1]) {
    const total = dailyGateTotals(day({ GATE_A: cell({ capacityMin: value, totalPcs: value }), GATE_B: cell() }), gates);
    assert.equal(total.pct, null);
    assert.equal(total.totalPcs, null);
    assert.equal(total.incompleteGates, 1);
  }
  const large = dailyGateTotals(day({ GATE_A: cell({ loadMin: Number.MAX_VALUE }), GATE_B: cell({ loadMin: Number.MAX_VALUE }) }), gates);
  assert.equal(large.loadMin, null);
  assert.equal(large.pct, null);
});
