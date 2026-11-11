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
  loadMin: 660, uphStatus: "ok", procCount: 3, uphCount: 3, ...overrides,
});

const data = (cards: ApiCard[]): LevelingData => ({
  today: "2026-11-16",
  days: ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].map((date) => ({ date, isWorking: true })),
  gates: [{ gate: "FADL", group: "FPC" }, { gate: "FIN", group: "FPC" }, { gate: "MMOT", group: "SMT" }],
  capacity: {
    FADL: { "2026-11-16": open(1900), "2026-11-17": open(1900), "2026-11-18": open(2620, true), "2026-11-19": closed },
    FIN: { "2026-11-16": open(950), "2026-11-17": open(950), "2026-11-18": open(950), "2026-11-19": open(950) },
    MMOT: { "2026-11-16": open(null), "2026-11-17": open(null), "2026-11-18": open(null), "2026-11-19": open(null) },
  },
  cards, orphanMoves: [], undatedCount: 0, plan: null,
});

const cellOf = (grid: ReturnType<typeof buildGrid>, date: string, gate: string) =>
  grid.find((day) => day.date === date)!.gates[gate];

test("load % is the summed card minutes over the gate's capacity that day", () => {
  const source = data([card(), card({ id: "b", workKey: "LOT|L2|2026-11-25", lotNo: "L2", loadMin: 1050 })]);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
  assert.deepEqual([cell.loadMin, cell.pct, cell.lotCount, cell.totalPcs, cell.totalSheets], [1710, 90, 2, 2000, 168]);
  assert.deepEqual([85, 86, 100, 101].map(loadStatus), ["green", "yellow", "yellow", "red"]);
});

test("cards without UPH are counted as work but add no minutes", () => {
  const source = data([card(), card({ id: "b", lotNo: "L2", loadMin: null, uphStatus: "missing", uphCount: 0 })]);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-17", "FADL");
  assert.deepEqual([cell.loadMin, cell.lotCount, cell.missingUph, cell.pct], [660, 2, 1, 35]);
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

test("moving a card changes only its own gate, on the old and the new day", () => {
  const source = data([card(), card({ id: "fin", gate: "FIN", mustOut: "2026-11-19", baseDate: "2026-11-19", plannedDate: "2026-11-19", loadMin: 475 })]);
  const lots = source.cards.map(toLotItem);
  const before = buildGrid(source, lots);
  const { previewGrid, impactRows } = computeMovePreview(source, before, lots, [lots[0]], "2026-11-18");
  assert.equal(cellOf(previewGrid, "2026-11-17", "FADL").previewPct, 0);
  assert.equal(cellOf(previewGrid, "2026-11-18", "FADL").previewPct, 25); // 660 / 2620 with OT open
  // The same work's FIN card stays on its own date.
  assert.equal(cellOf(previewGrid, "2026-11-19", "FIN").previewPct, undefined);
  assert.equal(cellOf(previewGrid, "2026-11-19", "FIN").pct, 50);
  assert.deepEqual(impactRows.map((row) => [row.date, row.beforePct, row.afterPct, row.isTarget]), [
    ["2026-11-17", 35, 0, false], ["2026-11-18", 0, 25, true],
  ]);

  const moved = lots.map((lot) => (lot.id === lots[0].id ? { ...lot, plannedDate: "2026-11-18" } : lot));
  const after = buildGrid(source, moved);
  assert.equal(cellOf(after, "2026-11-18", "FADL").pct, 25);
  // Required view keeps every card on its must-out date.
  assert.equal(cellOf(buildGrid(source, moved, true), "2026-11-17", "FADL").pct, 35);
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
    card({ id: "b", workKey: "LOT|L2|2026-11-25", lotNo: "L2", plannedDate: "2026-11-18", loadMin: null, uphStatus: "missing" }),
    card({ id: "m", workKey: "LOT|L3|2026-11-25", gate: "MMOT", nextGate: null, nextDate: null }),
  ]);
  const lots = source.cards.map(toLotItem);
  const kpis = calculateKpis(buildGrid(source, lots), buildGrid(source, lots, true), lots);
  assert.deepEqual(
    [kpis.overloadCells, kpis.lateCards, kpis.movedLateCards, kpis.movedCount, kpis.movedLater, kpis.totalCount, kpis.missingUphCards, kpis.unsetCapacityGates],
    [1, 1, 1, 1, 1, 3, 1, ["MMOT"]]
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
