/// <reference types="node" />
// Run with: npm test  (Node's built-in runner; no browser needed)
import test from "node:test";
import assert from "node:assert/strict";
import type { ApiCard, CapacityDay, LevelingData, ShiftConfig } from "../types";
import {
  buildGrid,
  calculateKpis,
  cellPct,
  computeMovePreview,
  loadStatus,
  moveWarning,
  occupancyWindow,
  plannedDateIndex,
  shiftCapacityMin,
  toLotItem,
} from "./levelingCalculations.ts";

const open = (capacityMin: number | null, hasOt = false): CapacityDay => ({
  off: false, hasOt, capacityMin,
  shifts: { day: { open: true, otOn: hasOt, capacityMin }, night: { open: false, otOn: false, capacityMin: 0 } },
});
const closed: CapacityDay = {
  off: true, hasOt: false, capacityMin: 0,
  shifts: { day: { open: false, otOn: false, capacityMin: 0 }, night: { open: false, otOn: false, capacityMin: 0 } },
};

const card = (overrides: Partial<ApiCard> = {}): ApiCard => ({
  id: "LOT|L1|2026-11-25|FADL", workKey: "LOT|L1|2026-11-25", gate: "FADL", prdName: "PRD-A", lotNo: "L1",
  item: null, qty: 1000, sheets: 84, status: "production plan", gateState: "in_gate", processGroup: "EFPC_GEN",
  currentGate: "FADL", currentProc: "A", isHold: false, dueDate: "2026-11-25", arriveBy: "2026-11-16",
  mustOut: "2026-11-17", baseDate: "2026-11-17", plannedDate: "2026-11-17", moved: false, overdue: false,
  sourceChanged: false, prevGate: "FVAC", prevDate: "2026-11-16", nextGate: "FIN", nextDate: "2026-11-19",
  loadMin: 950, leadDays: 2, standardShiftMin: { day: 475, night: 475 }, ...overrides,
});

const data = (cards: ApiCard[]): LevelingData => ({
  today: "2026-11-16",
  days: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map((date) => ({ date, isWorking: true })),
  calendarDays: Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, index + 1));
    return { date: date.toISOString().slice(0, 10), isWorking: date.getUTCDay() !== 0 };
  }),
  gates: [{ gate: "FADL", group: "FPC" }, { gate: "FIN", group: "FPC" }, { gate: "MMOT", group: "SMT" }],
  capacity: {
    FADL: { "2026-11-16": open(1900), "2026-11-17": open(1900), "2026-11-18": open(2620, true), "2026-11-19": closed },
    FIN: { "2026-11-16": open(950), "2026-11-17": open(950), "2026-11-18": open(950), "2026-11-19": open(950) },
    MMOT: { "2026-11-16": open(null), "2026-11-17": open(null), "2026-11-18": open(null), "2026-11-19": open(null) },
  },
  cards, orphanMoves: [], undatedCount: 0, duplicateWorkCount: 0,
  calculationMethod: "gate_max_target_occupancy_v1", legacyPlanAvailable: false, plan: null,
});

const cellOf = (grid: ReturnType<typeof buildGrid>, date: string, gate: string) =>
  grid.find((day) => day.date === date)!.gates[gate];

test("each distinct lot reserves normal minutes on every day in its gate window", () => {
  const source = data([card(), card({ id: "b", workKey: "LOT|L2|2026-11-25", lotNo: "L2" })]);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
  assert.deepEqual([cell.loadMin, cell.pct, cell.lotCount, cell.totalPcs, cell.totalSheets], [1900, 100, 2, 2000, 168]);
  assert.equal(cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL").loadMin, 1900);
  assert.deepEqual([85, 86, 100, 101].map(loadStatus), ["green", "yellow", "yellow", "red"]);
});

test("missing planning data is flagged instead of reporting available capacity", () => {
  const source = data([card(), card({ id: "b", workKey: "LOT|L2|2026-11-25", lotNo: "L2", loadMin: null, leadDays: null })]);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
  assert.deepEqual([cell.loadMin, cell.lotCount, cell.missingPlanning, cellPct(cell)], [950, 2, 1, null]);
});

test("a gate without MC has no load %, and a closed day is off", () => {
  const source = data([card({ id: "m", gate: "MMOT" }), card({ id: "off", plannedDate: "2026-11-19" })]);
  const grid = buildGrid(source, source.cards.map(toLotItem));
  const unset = cellOf(grid, "2026-11-17", "MMOT");
  assert.deepEqual([unset.configured, unset.lotCount, cellPct(unset)], [false, 1, null]);
  assert.equal(grid[1].gateStatusDots.MMOT, "unset");
  const off = cellOf(grid, "2026-11-19", "FADL");
  assert.deepEqual([off.off, off.lotCount, cellPct(off)], [true, 1, null]);
});

test("a move shifts the whole window at one gate and previews every affected day", () => {
  const source = data([card(), card({ id: "fin", gate: "FIN", mustOut: "2026-11-19", baseDate: "2026-11-19", plannedDate: "2026-11-19" })]);
  const lots = source.cards.map(toLotItem);
  const before = buildGrid(source, lots);
  const { previewGrid, impactRows } = computeMovePreview(source, before, lots, [lots[0]], "2026-11-18");
  assert.equal(cellOf(previewGrid, "2026-11-16", "FADL").previewPct, 0);
  assert.equal(cellOf(previewGrid, "2026-11-17", "FADL").previewPct, undefined);
  assert.equal(cellOf(previewGrid, "2026-11-18", "FADL").previewPct, 36);
  assert.equal(cellOf(previewGrid, "2026-11-18", "FADL").lotCount, 1);
  assert.equal(cellOf(previewGrid, "2026-11-16", "FADL").lotCount, 0);
  // The same work's FIN card stays on its own date.
  assert.equal(cellOf(previewGrid, "2026-11-19", "FIN").previewPct, undefined);
  assert.equal(cellOf(previewGrid, "2026-11-19", "FIN").pct, 100);
  assert.deepEqual(impactRows.map((row) => [row.date, row.beforePct, row.afterPct, row.isTarget]), [
    ["2026-11-16", 50, 0, false], ["2026-11-18", 0, 36, true],
  ]);

  const moved = lots.map((lot) => (lot.id === lots[0].id ? { ...lot, plannedDate: "2026-11-18" } : lot));
  const after = buildGrid(source, moved);
  assert.equal(cellOf(after, "2026-11-18", "FADL").pct, 36);
  // Required view keeps every card on its must-out date.
  assert.equal(cellOf(buildGrid(source, moved, true), "2026-11-17", "FADL").pct, 50);
});

test("warnings: inside the window fits, earlier is early, later is late, reaching the next gate breaks the order", () => {
  const lot = toLotItem(card());
  assert.equal(moveWarning(lot, "2026-11-17"), "none");
  assert.equal(moveWarning(lot, "2026-11-16"), "none");
  assert.equal(moveWarning(lot, "2026-11-15"), "early");
  assert.equal(moveWarning(lot, "2026-11-18"), "late");
  assert.equal(moveWarning(lot, "2026-11-19"), "order");
  // The next gate's own draft date wins over its must-out date.
  const next = { ...toLotItem(card({ id: "fin", gate: "FIN" })), plannedDate: "2026-11-18" };
  assert.equal(moveWarning(lot, "2026-11-18", plannedDateIndex([lot, next])), "order");
  // An overdue card that was not moved is late, not an order problem.
  const overdue = toLotItem(card({ mustOut: "2026-11-10", baseDate: "2026-11-16", plannedDate: "2026-11-16", nextDate: "2026-11-12", overdue: true }));
  assert.equal(moveWarning(overdue, "2026-11-16"), "late");
});

test("summary counts overloads, late cards, moves and what is missing from load %", () => {
  const source = data([
    card({ loadMin: 2000 }),
    card({ id: "b", workKey: "LOT|L2|2026-11-25", lotNo: "L2", plannedDate: "2026-11-18", loadMin: null, leadDays: null }),
    card({ id: "m", workKey: "LOT|L3|2026-11-25", gate: "MMOT", nextGate: null, nextDate: null }),
  ]);
  const lots = source.cards.map(toLotItem);
  const kpis = calculateKpis(buildGrid(source, lots), buildGrid(source, lots, true), lots);
  assert.deepEqual(
    [kpis.overloadCells, kpis.lateCards, kpis.movedLateCards, kpis.movedCount, kpis.movedLater, kpis.totalCount, kpis.missingPlanningCards, kpis.unsetCapacityGates],
    [2, 1, 1, 1, 1, 3, 1, ["MMOT"]]
  );
});

test("shift capacity: 475 min per machine, 655 with OT, empty MC is not zero", () => {
  const shift: ShiftConfig = {
    settingId: null, enabled: true, mcLines: 2, manpower: null, minPerShift: 540, otEnabled: false, otMinutes: 180,
    break1: true, break1Min: 10, break2: true, break2Min: 10, lunch: true, lunchMin: 45, efficiency: 1, specialDays: {},
  };
  assert.equal(shiftCapacityMin(shift), 950);
  assert.equal(shiftCapacityMin(shift, true), 1310);
  assert.equal(shiftCapacityMin({ ...shift, mcLines: null }), null);
  assert.equal(shiftCapacityMin({ ...shift, enabled: false }), 0);
});

test("agreed Max Target examples keep demand fixed while MC, OT and closed shifts change capacity", () => {
  const scenarios = [
    { count: 6, day: 3800, night: 3800, pct: 75 },
    { count: 9, day: 3800, night: 3800, pct: 113 },
    { count: 6, day: 3800, night: 2850, pct: 86 },
    { count: 6, day: 5240, night: 3800, pct: 63 },
    { count: 6, day: 5240, night: 5240, pct: 54 },
    { count: 9, day: 5240, night: 5240, pct: 82 },
    { count: 6, day: 3800, night: 0, pct: 150 },
  ];
  for (const scenario of scenarios) {
    const source = data(Array.from({ length: scenario.count }, (_, i) => card({
      id: `lot-${i}`, workKey: `work-${i}`, qty: i === 0 ? 1 : 100000,
    })));
    source.capacity.FADL["2026-11-17"] = {
      off: false, hasOt: scenario.day > 3800, capacityMin: scenario.day + scenario.night,
      shifts: {
        day: { open: true, otOn: scenario.day > 3800, capacityMin: scenario.day },
        night: { open: scenario.night > 0, otOn: scenario.night > 3800, capacityMin: scenario.night },
      },
    };
    const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
    assert.equal(cell.pct, scenario.pct, JSON.stringify(scenario));
    assert.equal(cell.loadMin, scenario.count * 950);
    assert.deepEqual(cell.shiftLoadMin, { day: scenario.count * 475, night: scenario.count * 475 });
  }
});

test("different normal shift lengths are preserved independently of actual shift capacity", () => {
  const source = data([card({ loadMin: 895, standardShiftMin: { day: 475, night: 420 } })]);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
  assert.deepEqual(cell.shiftLoadMin, { day: 475, night: 420 });
  assert.equal(cell.loadMin, 895);
});

test("work released outside the visible range still contributes its overlapping occupancy", () => {
  const source = data([card({ plannedDate: "2026-11-23", baseDate: "2026-11-23", leadDays: 6 })]);
  const grid = buildGrid(source, source.cards.map(toLotItem));
  assert.equal(cellOf(grid, "2026-11-16", "FADL").lotCount, 0);
  assert.equal(cellOf(grid, "2026-11-17", "FADL").lotCount, 1);
  assert.equal(cellOf(grid, "2026-11-19", "FADL").lotCount, 1);
});

test("a window retains occupancy on holidays; opening OT does not move or increase demand", () => {
  const source = data([card({ plannedDate: "2026-11-23", leadDays: 3 })]);
  source.days = ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"].map((date) => ({ date, isWorking: date !== "2026-11-22" }));
  source.capacity.FADL["2026-11-22"] = closed;
  const lots = source.cards.map(toLotItem);
  assert.deepEqual(occupancyWindow(source, lots[0])?.dates, ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
  const before = cellOf(buildGrid(source, lots), "2026-11-22", "FADL");
  assert.equal(before.loadMin, 950);
  assert.equal(cellPct(before), null);
  source.capacity.FADL["2026-11-22"] = open(1310, true);
  const after = cellOf(buildGrid(source, lots), "2026-11-22", "FADL");
  assert.equal(after.loadMin, before.loadMin);
  assert.equal(after.pct, 73);
});

test("duplicate rows never reserve a second machine for the same work and gate", () => {
  const source = data([card(), card({ id: "duplicate" })]);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
  assert.deepEqual([cell.lotCount, cell.loadMin], [1, 950]);
});

test("zero capacity with demand is unavailable and counted as a blocked gate-day", () => {
  const source = data([card()]);
  source.capacity.FADL["2026-11-17"] = open(0);
  const lots = source.cards.map(toLotItem);
  const grid = buildGrid(source, lots);
  assert.equal(cellPct(cellOf(grid, "2026-11-17", "FADL")), null);
  assert.equal(calculateKpis(grid, grid, lots, source).overloadCells, 1);
});

test("an incomplete calendar cannot silently truncate a planning window", () => {
  const source = data([card({ leadDays: 30 })]);
  const lots = source.cards.map(toLotItem);
  assert.equal(occupancyWindow(source, lots[0]), null);
  const grid = buildGrid(source, lots);
  assert.equal(calculateKpis(grid, grid, lots, source).missingPlanningCards, 1);
});

test("moving a full window before the previous gate's release is flagged", () => {
  const source = data([card({ arriveBy: "2026-11-14", prevDate: "2026-11-14" })]);
  const lot = source.cards.map(toLotItem)[0];
  assert.equal(moveWarning(lot, "2026-11-16", undefined, source), "early");
  assert.equal(moveWarning(lot, "2026-11-17", undefined, source), "none");
});

test("a release moved into the next gate's occupancy is flagged before its must-out", () => {
  const source = data([card(), card({ id: "fin", gate: "FIN", baseDate: "2026-11-19", plannedDate: "2026-11-19" })]);
  const lots = source.cards.map(toLotItem);
  assert.equal(moveWarning(lots[0], "2026-11-18", plannedDateIndex(lots, source), source), "order");
});
