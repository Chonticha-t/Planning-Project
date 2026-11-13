/// <reference types="node" />
// Run with: npm test  (Node's built-in runner; no browser needed)
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeGateQuantities } from "../../Planning_Summary_Gate/gateUnits.ts";
import { allocateBoardShifts } from "./boardShiftAllocation.ts";
import { applyBoardCardOrder, readBoardCardOrder, reorderBoardCards, serializeBoardCardOrder } from "./boardCardOrder.ts";
import { appendMoveHistory, mergeMoveHistory, reorderMoveHistory } from "./moveHistory.ts";
import type { ApiCard, CapacityDay, GateArrivalRow, LevelingData, ShiftConfig } from "../types";
import {
  buildGrid,
  buildBoardLots,
  boardCounts,
  expandBoardLots,
  calculateKpis,
  cellPct,
  computeMovePreview,
  loadStatus,
  moveWarning,
  occupancyWindow,
  plannedDateIndex,
  plannedArrivalDate,
  shiftCapacityMin,
  toLotItem,
  requiredLots,
} from "./levelingCalculations.ts";

test("reset to Required reconciles every gate's grid with source arrivals and clears saved order on save", () => {
  const original = data([
    card({ plannedDate: "2026-11-18" }),
    card({ id: "smt", workKey: "smt", lotNo: "L2", gate: "MMOT", processGroup: "SMT", plannedDate: "2026-11-19" }),
    card({ id: "past", workKey: "past", lotNo: "L3", gate: "FIN", arriveBy: "2026-11-12", plannedDate: "2026-11-17" }),
    card({ id: "future", workKey: "future", lotNo: "L4", baseDate: "2026-12-20", arriveBy: "2026-12-20", plannedDate: "2026-12-22" }),
  ]);
  const before = JSON.stringify(original);
  const lots = requiredLots(original.cards);
  assert.deepEqual(buildGrid(original, lots), buildGrid(original, original.cards.map(toLotItem), true));
  assert.equal(lots.find(lot => lot.id === "past")!.plannedDate, "2026-11-12");
  assert.equal(lots.find(lot => lot.id === "future")!.plannedDate, "2026-12-20");
  assert.equal(lots[0].savedDate, "2026-11-18");
  assert.equal(calculateKpis(buildGrid(original, lots), buildGrid(original, lots, true), lots, original).movedCount, 0);
  assert.deepEqual(serializeBoardCardOrder(buildBoardLots(original, lots), new Map(), original.today), []);
  assert.equal(JSON.stringify(original), before, "reset must preserve loaded saved data for comparison");
});

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
  mustOut: "2026-11-18", baseDate: overrides.arriveBy ?? "2026-11-16", plannedDate: overrides.arriveBy ?? "2026-11-16", moved: false, overdue: false,
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
  gates: [
    { gate: "FADL", group: "FPC", standardShiftMin: { day: 475, night: 475 } },
    { gate: "FIN", group: "FPC", standardShiftMin: { day: 475, night: 475 } },
    { gate: "MMOT", group: "SMT", standardShiftMin: { day: 475, night: 475 } },
  ],
  capacity: {
    FADL: { "2026-11-16": open(1900), "2026-11-17": open(1900), "2026-11-18": open(2620, true), "2026-11-19": closed },
    FIN: { "2026-11-16": open(950), "2026-11-17": open(950), "2026-11-18": open(950), "2026-11-19": open(950) },
    MMOT: { "2026-11-16": open(null), "2026-11-17": open(null), "2026-11-18": open(null), "2026-11-19": open(null) },
  },
  arrivalRows: cards.map((item, index) => ({
    pri: index, gate_order: 1, prd_name: item.prdName, item: item.item, lot_no: item.lotNo,
    due_date: item.dueDate, status: item.status, qty: item.qty, pcs_per_sheet: 12,
    gate_name: item.gate, gate_state: item.gateState, process_group: item.processGroup,
    arrive_by: item.arriveBy, must_out: item.mustOut, next_gate: item.nextGate ?? "",
    lead_days: item.leadDays ?? 0, workKey: item.workKey,
  })),
  undatedArrivalCount: 0, loadBasis: "summary_gate_arrivals_v1",
  cards, orphanMoves: [], undatedCount: 0, duplicateWorkCount: 0,
  calculationMethod: "gate_arrival_max_target_v1", legacyPlanAvailable: false, plan: null,
});

const cellOf = (grid: ReturnType<typeof buildGrid>, date: string, gate: string) =>
  grid.find((day) => day.date === date)!.gates[gate];

const shiftDay = (day: number | null, night: number | null): CapacityDay => ({
  off: false, hasOt: false, capacityMin: day === null || night === null ? null : day + night,
  shifts: { day: { open: true, otOn: false, capacityMin: day }, night: { open: true, otOn: false, capacityMin: night } },
});

test("same-day reordering changes shift priority without changing dates, quantities or the load grid", () => {
  const source = data([0, 1, 2].map(i => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}` })));
  source.capacity.FADL["2026-11-16"] = shiftDay(950, 950);
  const lots = source.cards.map(toLotItem);
  const board = buildBoardLots(source, lots);
  const original = structuredClone(board);
  const order = reorderBoardCards(board, new Map(), [board[2].id], board[0].id, "before");
  const reordered = applyBoardCardOrder(board, order);
  assert.deepEqual(reordered.map(lot => lot.label), ["LOT-2", "LOT-0", "LOT-1"]);
  const shifts = allocateBoardShifts(source, reordered);
  assert.deepEqual(reordered.map(lot => shifts.get(lot.id)?.status), ["day", "night", "over"]);
  assert.deepEqual(buildGrid(source, reordered), buildGrid(source, board));
  assert.deepEqual(board, original);
  assert.deepEqual(applyBoardCardOrder(board, reorderBoardCards(board, order, [board[2].id], board[0].id, "after"))
    .map(lot => lot.label), ["LOT-0", "LOT-2", "LOT-1"]);
});

test("same-day reorder history records the moved card's old and new positions and survives board rebuilding", () => {
  const source = data([0, 1, 2].map(i => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}` })));
  const lots = source.cards.map(toLotItem);
  const board = buildBoardLots(source, lots);
  const order = reorderBoardCards(board, new Map(), [board[2].id], board[0].id, "before");
  const events = reorderMoveHistory(board, applyBoardCardOrder(board, order), [board[2].id],
    { id: "drag-1", changedAt: "2026-11-16T02:00:00Z", changedBy: "Planner - Draft" });
  const rebuilt = buildBoardLots(source, appendMoveHistory(lots, events));
  const history = rebuilt.find(lot => lot.id === board[2].id)!.moveHistory!;
  assert.equal(history.length, 1);
  assert.deepEqual([history[0].kind, history[0].fromPosition, history[0].toPosition], ["reorder", 3, 1]);
  assert.equal(history[0].fromDate, history[0].toDate);
  assert.equal(lots[2].moveHistory, undefined);
  assert.equal(rebuilt[0].moveHistory?.length, 0);
  assert.equal(reorderMoveHistory(board, board, [board[0].id],
    { id: "no-op", changedAt: "2026-11-16T02:00:00Z", changedBy: "Planner" }).size, 0);
});

test("merged board cards preserve all members' histories without duplicating a shared move", () => {
  const source = data([card(), card({ id: "other", workKey: "other", arriveBy: "2026-11-17" })]);
  const event = { id: "shared", kind: "reorder" as const, fromDate: "2026-11-16", toDate: "2026-11-16",
    fromPosition: 2, toPosition: 1, changedAt: "2026-11-16T02:00:00Z", changedBy: "Planner" };
  const earlier = { ...event, id: "earlier", changedAt: "2026-11-16T01:00:00Z", planVersion: 1 };
  const lots = source.cards.map(toLotItem).map((lot, i) => ({ ...lot, plannedDate: "2026-11-16",
    moveHistory: i === 0 ? [event] : [event, earlier] }));
  const merged = buildBoardLots(source, lots);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].moveHistory?.map(entry => entry.id), ["shared", "earlier"]);
  assert.deepEqual(mergeMoveHistory([earlier], [event]).map(entry => entry.id), ["shared", "earlier"]);
  // API adaptation must preserve saved history, including server actor and version.
  assert.deepEqual(toLotItem({ ...source.cards[0], moveHistory: [earlier] }).moveHistory, [earlier]);
});

test("batch reordering preserves the visible selection order and rejects cross-day, cross-gate and stale selections", () => {
  const source = data([0, 1, 2, 3].map(i => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}` })));
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const empty = new Map<string, string[]>();
  const order = reorderBoardCards(board, empty, [board[2].id, board[0].id], board[3].id, "after");
  assert.deepEqual(applyBoardCardOrder(board, order).map(lot => lot.label), ["LOT-1", "LOT-3", "LOT-0", "LOT-2"]);
  for (const invalid of [
    [board[0].id], ["missing"], [board[1].id, "missing"], [],
  ]) assert.equal(reorderBoardCards(board, empty, invalid, board[0].id, "before"), empty);
  for (const patch of [{ plannedDate: "2026-11-17" }, { gate: "FIN" }]) {
    const mixed = board.map((lot, i) => i === 1 ? { ...lot, ...patch } : lot);
    assert.equal(reorderBoardCards(mixed, empty, [mixed[1].id], mixed[0].id, "before"), empty);
  }
});

test("saved order survives a JSON round trip, retains other groups and appends new cards in source priority", () => {
  const source = data([0, 1, 2].map(i => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}` })));
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const order = reorderBoardCards(board.slice(0, 2), new Map(), [board[1].id], board[0].id, "before");
  const saved = serializeBoardCardOrder(board, order, source.today);
  const restored = readBoardCardOrder(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(applyBoardCardOrder([...board].reverse(), restored).map(lot => lot.label), ["LOT-1", "LOT-0", "LOT-2"]);
  const filtered = board.filter(lot => lot.id !== board[0].id);
  assert.deepEqual(applyBoardCardOrder(filtered, restored).map(lot => lot.label), ["LOT-1", "LOT-2"]);
  const moved = board.map((lot, i) => i === 0 ? { ...lot, plannedDate: "2026-11-17" } : lot);
  assert.deepEqual(serializeBoardCardOrder(moved, restored, source.today)[0].cardIds, [board[1].id, board[2].id]);
  assert.deepEqual(serializeBoardCardOrder(board, restored, "2026-11-17"), []);
});

test("shift allocation fills day before night and leaves excess work on its planned date", () => {
  const source = data(Array.from({ length: 5 }, (_, i) => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}` })));
  source.capacity.FADL["2026-11-16"] = shiftDay(1900, 950);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const before = structuredClone(source);
  const allocations = allocateBoardShifts(source, board);
  assert.deepEqual(board.map(lot => allocations.get(lot.id)?.status), ["day", "day", "night", "over", "over"]);
  assert.equal(allocations.get(board[3].id)?.overflowMin, 950);
  assert.ok(board.every(lot => lot.plannedDate === "2026-11-16"));
  assert.deepEqual(source, before);
});

test("work spanning shifts shows both and allocated minutes agree with the arrival grid", () => {
  const source = data(Array.from({ length: 3 }, (_, i) => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}` })));
  source.capacity.FADL["2026-11-16"] = shiftDay(1425, 1425);
  const lots = source.cards.map(toLotItem);
  const board = buildBoardLots(source, lots);
  const allocations = allocateBoardShifts(source, board);
  assert.deepEqual(board.map(lot => allocations.get(lot.id)), [
    { status: "day", dayMin: 950, nightMin: 0, overflowMin: 0 },
    { status: "split", dayMin: 475, nightMin: 475, overflowMin: 0 },
    { status: "night", dayMin: 0, nightMin: 950, overflowMin: 0 },
  ]);
  const allocated = board.reduce((sum, lot) => {
    const item = allocations.get(lot.id)!;
    return sum + item.dayMin + item.nightMin + item.overflowMin;
  }, 0);
  assert.equal(allocated, cellOf(buildGrid(source, lots), "2026-11-16", "FADL").loadMin);
});

test("a partially allocated lot retains its scheduled minutes and reports only the remainder as overflow", () => {
  const source = data([card(), card({ id: "second", workKey: "second", lotNo: "SECOND" })]);
  source.capacity.FADL["2026-11-16"] = shiftDay(600, 500);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const allocations = allocateBoardShifts(source, board);
  assert.deepEqual(allocations.get(board[0].id), { status: "split", dayMin: 600, nightMin: 350, overflowMin: 0 });
  assert.deepEqual(allocations.get(board[1].id), { status: "over", dayMin: 0, nightMin: 150, overflowMin: 800 });
});

test("closed shifts are skipped, closed days overflow, and updated capacity changes assignments", () => {
  const source = data([card(), card({ id: "second", workKey: "second", lotNo: "SECOND" })]);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  source.capacity.FADL["2026-11-16"] = shiftDay(null, 950);
  source.capacity.FADL["2026-11-16"].shifts.day.open = false;
  let allocations = allocateBoardShifts(source, board);
  assert.deepEqual(board.map(lot => allocations.get(lot.id)?.status), ["night", "over"]);
  source.capacity.FADL["2026-11-16"] = closed;
  allocations = allocateBoardShifts(source, board);
  assert.deepEqual(board.map(lot => allocations.get(lot.id)?.status), ["over", "over"]);
  source.capacity.FADL["2026-11-16"] = shiftDay(1900, 0);
  source.capacity.FADL["2026-11-16"].shifts.day.otOn = true;
  allocations = allocateBoardShifts(source, board);
  assert.deepEqual(board.map(lot => allocations.get(lot.id)?.status), ["day", "day"]);
});

test("missing or invalid open-shift capacity never invents a shift assignment", () => {
  const source = data([card()]);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  for (const invalid of [null, NaN, Infinity, -1, Number.MAX_VALUE]) {
    source.capacity.FADL["2026-11-16"] = shiftDay(950, invalid);
    const allocation = allocateBoardShifts(source, board).get(board[0].id)!;
    assert.equal(allocation.status, "unassigned");
    assert.match(allocation.reason!, /capacity/);
  }
  delete source.capacity.FADL["2026-11-16"];
  assert.equal(allocateBoardShifts(source, board).get(board[0].id)?.status, "unassigned");
});

test("unknown workload blocks lower priorities in that gate and date only", () => {
  const source = data([
    card({ loadMin: null }), card({ id: "second", workKey: "second", lotNo: "SECOND" }),
    card({ id: "other-date", workKey: "other-date", lotNo: "OTHER-DATE", arriveBy: "2026-11-17" }),
    card({ id: "other-gate", workKey: "other-gate", lotNo: "OTHER-GATE", gate: "FIN" }),
  ]);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const allocations = allocateBoardShifts(source, board);
  assert.equal(allocations.get(source.cards[0].id)?.status, "unassigned");
  assert.equal(allocations.get(source.cards[1].id)?.status, "unassigned");
  assert.equal(allocations.get(source.cards[2].id)?.status, "day");
  assert.equal(allocations.get(source.cards[3].id)?.status, "day");
});

test("Need WIP and missing identifiers do not reserve shift capacity; duplicate physical lots reserve once", () => {
  const source = data([
    card(), card({ id: "need", workKey: "need", lotNo: "NEED WIP", gateState: "need_wip", loadMin: 0 }),
    card({ id: "missing", workKey: "missing", lotNo: null, kind: "unidentified" }),
    card({ id: "second", workKey: "second", lotNo: "SECOND" }),
  ]);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const duplicate = { ...board[0], id: "duplicate-card", sourceIds: ["duplicate-source"] };
  const allocations = allocateBoardShifts(source, [board[0], duplicate, ...board.slice(1)]);
  assert.equal(allocations.get("need")?.status, "none");
  assert.equal(allocations.get("missing")?.status, "none");
  assert.equal(allocations.get("second")?.status, "day");
  assert.deepEqual(allocations.get("duplicate-source"), allocations.get(board[0].id));
});

test("decimal minutes fit exact capacity without floating-point overflow", () => {
  const source = data(Array.from({ length: 3 }, (_, i) => card({ id: `card-${i}`, workKey: `work-${i}`, lotNo: `LOT-${i}`, loadMin: 0.1 })));
  source.capacity.FADL["2026-11-16"] = shiftDay(0.3, 0);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  const allocations = allocateBoardShifts(source, board);
  assert.deepEqual(board.map(lot => allocations.get(lot.id)?.status), ["day", "day", "day"]);
});

test("move previews reapply priority and retain stable source IDs after destination merging", () => {
  const source = data([
    card({ id: "first", workKey: "first", lotNo: "FIRST" }),
    card({ id: "moving", workKey: "moving", lotNo: "MOVING", arriveBy: "2026-11-17" }),
    card({ id: "last", workKey: "last", lotNo: "LAST" }),
  ]);
  source.capacity.FADL["2026-11-16"] = shiftDay(950, 950);
  source.arrivalRows[1].proc_disp = "GATE_A";
  source.arrivalRows[1].current_gate = "GATE_A";
  const lots = source.cards.map(toLotItem);
  const projected = lots.map(lot => lot.id === "moving" ? { ...lot, plannedDate: "2026-11-16" } : lot);
  const allocations = allocateBoardShifts(source, buildBoardLots(source, projected));
  assert.equal(allocations.get("moving")?.status, "day");
  assert.equal(allocations.get("first")?.status, "night");
  assert.equal(allocations.get("last")?.status, "over");
  assert.equal(lots[1].plannedDate, "2026-11-17");

  // Two source arrivals for the same physical lot merge at the destination and share one reservation.
  source.arrivalRows[1].lot_no = "FIRST";
  lots[1].label = "FIRST";
  const merged = lots.map(lot => lot.id === "moving" ? { ...lot, plannedDate: "2026-11-16" } : lot);
  const mergedAllocations = allocateBoardShifts(source, buildBoardLots(source, merged));
  assert.equal(mergedAllocations.get("first"), mergedAllocations.get("moving"));
  assert.equal(mergedAllocations.get("last")?.status, "night");
});


test("load counts arrivals once on arrive_by, not every occupied date or release date", () => {
  const source = data([card(), card({ id: "b", workKey: "LOT|L2|2026-11-25", lotNo: "L2" })]);
  const grid = buildGrid(source, source.cards.map(toLotItem));
  const cell = cellOf(grid, "2026-11-16", "FADL");
  assert.deepEqual([cell.loadMin, cell.pct, cell.lotCount, cell.totalPcs], [1900, 100, 2, 2000]);
  assert.equal(Math.ceil(cell.totalSheets!), 167);
  assert.equal(cellOf(grid, "2026-11-17", "FADL").lotCount, 0);
  assert.deepEqual([85, 86, 100, 101].map(loadStatus), ["green", "yellow", "yellow", "red"]);
});

test("same Summary Gate helper produces 32 actual lots and 3 separate need items", () => {
  const source = data(Array.from({ length: 32 }, (_, i) => card({ id: `id-${i}`, lotNo: `LOT-${i}`, workKey: `work-${i}` })));
  const first = source.arrivalRows[0];
  source.arrivalRows.push({ ...first, pri: 100, due_date: "2026-12-01", workKey: "another-allocation" });
  for (let i = 0; i < 3; i++) source.arrivalRows.push({ ...first, pri: 200 + i, lot_no: "NEED WIP", gate_state: "need_wip", workKey: `need-${i}` });
  const expected = summarizeGateQuantities(source.arrivalRows);
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem), false, "EFPC_GEN"), "2026-11-16", "FADL");
  assert.deepEqual([cell.lotCount, cell.needCount], [32, 3]);
  assert.deepEqual([cell.totalPcs, cell.totalSheets], [expected.total.piece, expected.total.sheet]);
  assert.equal(cell.loadMin, 32 * 950);
  assert.equal(cell.pct, Math.round(32 * 950 / 1900 * 100));
});

test("trimmed lot identity ignores due dates, quantity is max and Need WIP variants are not actual lots", () => {
  const source = data([card()]);
  const first = source.arrivalRows[0];
  source.arrivalRows.push(
    { ...first, lot_no: " L1 ", pri: 2, due_date: "2026-12-01", qty: 2000 },
    { ...first, lot_no: " need wip ", pri: 3 },
    { ...first, lot_no: "L-NEED", gate_state: "need_wip", pri: 4 },
    { ...first, lot_no: "PASSED", gate_state: "passed", pri: 5 },
    { ...first, lot_no: null, pri: 6 },
  );
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL");
  assert.deepEqual([cell.lotCount, cell.needCount, cell.unidentifiedCount, cell.loadMin], [1, 2, 1, 950]);
  assert.equal(cell.totalPcs, 5000);
});

test("source rows omitted from release cards still count as arrivals without requiring lead time", () => {
  const source = data([card({ loadMin: null, leadDays: null })]);
  source.arrivalRows[0].must_out = "";
  source.cards = [];
  const cell = cellOf(buildGrid(source, []), "2026-11-16", "FADL");
  assert.deepEqual([cell.lotCount, cell.loadMin, cell.missingPlanning, cell.pct], [1, 950, 0, 50]);
});

test("overdue releases clamped to today do not pull historical arrivals into today", () => {
  const source = data([card({ arriveBy: "2026-11-10", mustOut: "2026-11-12", baseDate: "2026-11-10", plannedDate: "2026-11-10", overdue: true })]);
  assert.equal(cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL").lotCount, 0);
});

test("process filter applies to both arrivals and load; unknown groups appear only in ALL", () => {
  const source = data([card()]);
  const first = source.arrivalRows[0];
  source.arrivalRows.push(
    { ...first, lot_no: "AUTO", process_group: "EFPC_AUTO" },
    { ...first, lot_no: "SMT", process_group: "SMT" },
    { ...first, lot_no: "UNKNOWN", process_group: null },
  );
  for (const [category, count] of [["EFPC_GEN", 1], ["EFPC_AUTO", 1], ["SMT", 1], ["ALL", 4]] as const) {
    const cell = cellOf(buildGrid(source, source.cards.map(toLotItem), false, category), "2026-11-16", "FADL");
    assert.deepEqual([cell.lotCount, cell.loadMin], [count, count * 950]);
  }
});

test("Need WIP quantities match Summary Gate but do not reserve machine minutes", () => {
  const source = data([card({ lotNo: "NEED WIP", gateState: "need_wip" })]);
  source.arrivalRows.push({ ...source.arrivalRows[0] });
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL");
  assert.deepEqual([cell.lotCount, cell.needCount, cell.loadMin, cell.pct, cell.totalPcs], [0, 1, 0, 0, 1000]);
});

test("missing or conflicting conversion factors stay unknown without losing the physical lot", () => {
  const source = data([card()]);
  source.arrivalRows.push({ ...source.arrivalRows[0], pcs_per_sheet: 20 });
  const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL");
  assert.deepEqual([cell.totalSheets, cell.lotCount, cell.loadMin], [null, 1, 950]);
  source.arrivalRows[0].qty = null;
  assert.equal(cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL").totalPcs, null);
});

test("missing and invalid arrival dates are excluded without inventing today's date", () => {
  const source = data([card()]);
  for (const arrive_by of [null, "", "2026-02-30", "not-a-date"]) {
    source.arrivalRows[0].arrive_by = arrive_by;
    assert.equal(buildGrid(source, source.cards.map(toLotItem)).reduce((sum, day) => sum + day.gates.FADL.lotCount, 0), 0);
  }
});

test("moving arrivals uses the target date directly, previews the selected group and leaves Required unchanged", () => {
  const source = data([card(), card({ id: "fin", gate: "FIN" }), card({ id: "auto", lotNo: "AUTO", workKey: "auto", processGroup: "EFPC_AUTO" })]);
  const lots = source.cards.map(toLotItem);
  const before = buildGrid(source, lots, false, "EFPC_GEN");
  const { previewGrid, impactRows } = computeMovePreview(source, before, lots, [lots[0]], "2026-11-18", "EFPC_GEN");
  assert.equal(cellOf(previewGrid, "2026-11-16", "FADL").previewPct, 0);
  assert.equal(cellOf(previewGrid, "2026-11-18", "FADL").previewPct, 36);
  assert.equal(cellOf(previewGrid, "2026-11-18", "FADL").lotCount, 1);
  assert.equal(cellOf(previewGrid, "2026-11-16", "FIN").pct, 100);
  assert.deepEqual(impactRows.map(row => [row.date, row.beforePct, row.afterPct]), [["2026-11-16", 50, 0], ["2026-11-18", 0, 36]]);
  const moved = lots.map(lot => lot.id === lots[0].id ? { ...lot, plannedDate: "2026-11-18" } : lot);
  assert.equal(cellOf(buildGrid(source, moved, true, "EFPC_GEN"), "2026-11-16", "FADL").lotCount, 1);
  assert.equal(plannedArrivalDate(lots[0].arriveBy, moved[0]), "2026-11-18");
});

test("removing one allocation does not subtract a physical lot still represented by another", () => {
  const source = data([card()]);
  source.arrivalRows.push({ ...source.arrivalRows[0], workKey: "other-due-date", due_date: "2026-12-01" });
  source.arrivalRows = source.arrivalRows.filter(row => row.workKey !== source.cards[0].workKey);
  assert.equal(cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL").loadMin, 950);
});

test("a physical lot can appear on separate arrival dates exactly as in Summary Gate", () => {
  const source = data([card()]);
  source.arrivalRows.push({ ...source.arrivalRows[0], workKey: "another-arrival", arrive_by: "2026-11-17" });
  const grid = buildGrid(source, source.cards.map(toLotItem));
  assert.deepEqual([cellOf(grid, "2026-11-16", "FADL").lotCount, cellOf(grid, "2026-11-17", "FADL").lotCount], [1, 1]);
});

test("an arrival remains visible when its release is outside the displayed period", () => {
  const source = data([card({ mustOut: "2026-11-23", leadDays: 6 })]);
  const grid = buildGrid(source, source.cards.map(toLotItem));
  assert.equal(cellOf(grid, "2026-11-16", "FADL").lotCount, 1);
  assert.equal(cellOf(grid, "2026-11-17", "FADL").lotCount, 0);
});

test("agreed Max Target examples use only actual arrivals and keep demand fixed when capacity changes", () => {
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
    const source = data(Array.from({ length: scenario.count }, (_, i) => card({ id: `lot-${i}`, lotNo: `LOT-${i}`, workKey: `work-${i}`, qty: i === 0 ? 1 : 100000 })));
    source.capacity.FADL["2026-11-16"] = {
      off: false, hasOt: scenario.day > 3800, capacityMin: scenario.day + scenario.night,
      shifts: { day: { open: true, otOn: scenario.day > 3800, capacityMin: scenario.day }, night: { open: scenario.night > 0, otOn: scenario.night > 3800, capacityMin: scenario.night } },
    };
    const cell = cellOf(buildGrid(source, source.cards.map(toLotItem)), "2026-11-16", "FADL");
    assert.equal(cell.pct, scenario.pct);
    assert.equal(cell.loadMin, scenario.count * 950);
    assert.deepEqual(cell.shiftLoadMin, { day: scenario.count * 475, night: scenario.count * 475 });
  }
});

test("normal shift lengths come from gate settings even with no release cards", () => {
  const source = data([card()]);
  source.gates[0].standardShiftMin.night = 420;
  const cell = cellOf(buildGrid(source, []), "2026-11-16", "FADL");
  assert.deepEqual(cell.shiftLoadMin, { day: 475, night: 420 });
  assert.equal(cell.loadMin, 895);
});

test("invalid normal minutes preserve lot counts but cannot report a valid percentage", () => {
  const source = data([card()]);
  source.gates[0].standardShiftMin = { day: 0, night: 0 };
  const cell = cellOf(buildGrid(source, []), "2026-11-16", "FADL");
  assert.deepEqual([cell.lotCount, cell.missingPlanning, cellPct(cell)], [1, 1, null]);
});

test("missing MC and closed days never display zero percent as free capacity", () => {
  const source = data([card({ gate: "MMOT" }), card({ arriveBy: "2026-11-19" })]);
  const grid = buildGrid(source, source.cards.map(toLotItem));
  const unset = cellOf(grid, "2026-11-16", "MMOT");
  assert.deepEqual([unset.configured, unset.lotCount, cellPct(unset)], [false, 1, null]);
  const off = cellOf(grid, "2026-11-19", "FADL");
  assert.deepEqual([off.off, off.lotCount, cellPct(off)], [true, 1, null]);
});

test("opening OT on a closed arrival day changes capacity only", () => {
  const source = data([card({ arriveBy: "2026-11-19" })]);
  const lots = source.cards.map(toLotItem);
  const before = cellOf(buildGrid(source, lots), "2026-11-19", "FADL");
  assert.equal(before.loadMin, 950);
  assert.equal(cellPct(before), null);
  source.capacity.FADL["2026-11-19"] = open(1310, true);
  const after = cellOf(buildGrid(source, lots), "2026-11-19", "FADL");
  assert.equal(after.loadMin, before.loadMin);
  assert.equal(after.pct, 73);
});

test("zero capacity with arrivals is unavailable and counts as an overloaded gate-day", () => {
  const source = data([card()]);
  source.capacity.FADL["2026-11-16"] = open(0);
  const lots = source.cards.map(toLotItem);
  const grid = buildGrid(source, lots);
  assert.equal(cellPct(cellOf(grid, "2026-11-16", "FADL")), null);
  assert.equal(calculateKpis(grid, grid, lots, source).overloadCells, 1);
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



const priorityData = (rows: Partial<GateArrivalRow>[]) => {
  const source = data(rows.map((_, index) => card({ id: `card-${index}`, workKey: `work-${index}`, lotNo: `LOT-${index}` })));
  source.arrivalRows = source.arrivalRows.map((row, index) => ({
    ...row, pri: index + 1, proc_disp: "PROCESS_A", current_gate: "GATE_A", ...rows[index],
  }));
  return source;
};

test("board prioritizes gate state, then process matches, then remaining processes descending", () => {
  const source = priorityData([
    { gate_state: "in_gate", rem_proc_in_gate: 99 },
    { proc_disp: "GATE_A", gate_state: "coming", rem_proc_in_gate: 100 },
    { proc_disp: "GATE_A", gate_state: "in_gate", rem_proc_in_gate: 3 },
    { proc_disp: "GATE_A", gate_state: "in_gate", rem_proc_in_gate: 8, pri: 99 },
    { proc_disp: "GATE_A", gate_state: "need_wip", rem_proc_in_gate: 200 },
    { gate_state: "coming", rem_proc_in_gate: 999 },
    { gate_state: "need_wip", rem_proc_in_gate: 999 },
    { proc_disp: "GATE_A", gate_state: "unknown", rem_proc_in_gate: 999 },
  ]);
  const before = structuredClone(source);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  assert.deepEqual(board.map(lot => lot.label), ["LOT-3", "LOT-2", "LOT-0", "LOT-1", "LOT-5", "LOT-4", "LOT-6", "LOT-7"]);
  assert.deepEqual(source, before);
});

test("process matching trims spaces and ignores case without matching blanks or partial names", () => {
  const source = priorityData([
    { proc_disp: "  ", current_gate: "" },
    { proc_disp: " gate_a ", current_gate: "GATE_A " },
    { proc_disp: null, current_gate: null },
    { proc_disp: "GATE_A_EXTRA" },
  ]);
  assert.deepEqual(buildBoardLots(source, source.cards.map(toLotItem)).map(lot => lot.label), ["LOT-1", "LOT-0", "LOT-2", "LOT-3"]);
});

test("remaining processes sort descending with zero ahead of missing and invalid values", () => {
  const source = priorityData([
    { rem_proc_in_gate: 2 }, { rem_proc_in_gate: 9 }, { rem_proc_in_gate: 0 },
    { rem_proc_in_gate: null }, {}, { rem_proc_in_gate: NaN },
    { rem_proc_in_gate: Infinity }, { rem_proc_in_gate: -1 },
  ]);
  assert.deepEqual(buildBoardLots(source, source.cards.map(toLotItem)).map(lot => lot.label), ["LOT-1", "LOT-0", "LOT-2", "LOT-3", "LOT-4", "LOT-5", "LOT-6", "LOT-7"]);
});

test("equal board priorities use source PRI and deterministic ties regardless of arrival order", () => {
  const source = priorityData([
    { rem_proc_in_gate: 5, pri: 9 }, { rem_proc_in_gate: 5, pri: 2 },
    { rem_proc_in_gate: 5, pri: NaN }, { rem_proc_in_gate: 5, pri: 2 },
  ]);
  const expected = ["LOT-1", "LOT-3", "LOT-0", "LOT-2"];
  assert.deepEqual(buildBoardLots(source, source.cards.map(toLotItem)).map(lot => lot.label), expected);
  source.arrivalRows.reverse();
  assert.deepEqual(buildBoardLots(source, source.cards.map(toLotItem)).map(lot => lot.label), expected);
});

test("merged cards use one allocation's best priority without mixing fields or adding duplicates", () => {
  const source = priorityData([
    { proc_disp: "GATE_A", gate_state: "coming", rem_proc_in_gate: 2 },
    { proc_disp: "GATE_A", gate_state: "coming", rem_proc_in_gate: 3 },
    { gate_state: "in_gate", rem_proc_in_gate: 99 },
  ]);
  const first = source.arrivalRows[0];
  source.arrivalRows.push(
    { ...first, pri: 4, proc_disp: "PROCESS_A", gate_state: "in_gate", rem_proc_in_gate: 50 },
    { ...first, pri: 5 },
  );
  const lots = source.cards.map(toLotItem);
  const gridBefore = buildGrid(source, lots);
  let board = buildBoardLots(source, lots);
  assert.deepEqual(board.map(lot => lot.label), ["LOT-2", "LOT-0", "LOT-1"]);
  assert.equal(board.find(lot => lot.label === "LOT-0")?.allocations?.length, 3);
  assert.deepEqual(boardCounts(board), { lots: 3, need: 0, unidentified: 0 });
  // A better allocation must win even when it is not the first or the display representative.
  source.arrivalRows.push({ ...first, pri: 6, gate_state: "in_gate", rem_proc_in_gate: 4 });
  board = buildBoardLots(source, lots);
  assert.deepEqual(board.map(lot => lot.label), ["LOT-0", "LOT-2", "LOT-1"]);
  assert.deepEqual(buildGrid(source, lots), gridBefore);
});

test("board recalculates current state after coming becomes in_gate while keeping dates primary", () => {
  const source = priorityData([
    { gate_state: "coming", rem_proc_in_gate: 9 },
    { gate_state: "in_gate", rem_proc_in_gate: 2 },
    { proc_disp: "GATE_A", gate_state: "in_gate", rem_proc_in_gate: 99 },
  ]);
  const lots = source.cards.map(toLotItem);
  lots[2].plannedDate = "2026-11-17";
  assert.deepEqual(buildBoardLots(source, lots).map(lot => lot.label), ["LOT-1", "LOT-0", "LOT-2"]);
  source.arrivalRows[0].gate_state = "in_gate";
  assert.deepEqual(buildBoardLots(source, lots).map(lot => lot.label), ["LOT-0", "LOT-1", "LOT-2"]);
});

test("board and grid show the same 32 actual lots and 3 need cards with allocation details retained", () => {
  const cards = Array.from({ length: 32 }, (_, i) => card({ id: `actual-${i}`, lotNo: `LOT-${i}`, workKey: `actual-${i}` }));
  cards.push(...Array.from({ length: 3 }, (_, i) => card({ id: `need-${i}`, lotNo: "NEED WIP", gateState: "need_wip", workKey: `need-${i}`, loadMin: 0 })));
  const source = data(cards);
  source.arrivalRows.push({ ...source.arrivalRows[0], due_date: "2026-12-01", qty: 2000 });
  const lots = cards.map(toLotItem);
  const board = buildBoardLots(source, lots, "EFPC_GEN");
  const cell = cellOf(buildGrid(source, lots, false, "EFPC_GEN"), "2026-11-16", "FADL");
  assert.deepEqual(boardCounts(board), { lots: 32, need: 3, unidentified: 0 });
  assert.deepEqual([cell.lotCount, cell.needCount], [32, 3]);
  const first = board.find(lot => lot.label === "LOT-0")!;
  assert.equal(first.allocations?.length, 2);
  assert.equal(first.qty, 2000);
  assert.equal(board.filter(lot => lot.kind === "need").reduce((sum, lot) => sum + (lot.loadMin ?? 0), 0), 0);
});

test("merging the same lot on one arrival date creates one card and dragging it moves all source allocations", () => {
  const source = data([card({ id: "first", workKey: "first" }), card({ id: "second", workKey: "second", arriveBy: "2026-11-17", plannedDate: "2026-11-16" })]);
  const lots = source.cards.map(toLotItem);
  const board = buildBoardLots(source, lots);
  assert.equal(board.length, 1);
  assert.equal(board[0].allocations?.length, 2);
  assert.deepEqual(new Set(board[0].sourceIds), new Set(["first", "second"]));
  assert.equal(expandBoardLots(lots, board).length, 2);
  const before = buildGrid(source, lots);
  assert.equal(cellOf(before, "2026-11-16", "FADL").loadMin, 950);
  const { previewGrid } = computeMovePreview(source, before, lots, board, "2026-11-18");
  assert.deepEqual([cellOf(previewGrid, "2026-11-16", "FADL").lotCount, cellOf(previewGrid, "2026-11-18", "FADL").lotCount], [0, 1]);
  const members = new Set(expandBoardLots(lots, board).map(lot => lot.id));
  const moved = lots.map(lot => members.has(lot.id) ? { ...lot, plannedDate: "2026-11-18" } : lot);
  assert.equal(buildBoardLots(source, moved)[0].plannedDate, "2026-11-18");
  const required = buildGrid(source, moved, true);
  assert.deepEqual([cellOf(required, "2026-11-16", "FADL").lotCount, cellOf(required, "2026-11-17", "FADL").lotCount], [1, 1]);
});

test("board category filters, closed-day arrivals and unknown lot identifiers agree with grid totals", () => {
  const source = data([
    card({ id: "gen", workKey: "gen", arriveBy: "2026-11-19" }),
    card({ id: "auto", workKey: "auto", lotNo: "AUTO", processGroup: "EFPC_AUTO", arriveBy: "2026-11-19" }),
    card({ id: "unknown", workKey: "unknown", lotNo: null, kind: "unidentified", arriveBy: "2026-11-19" }),
  ]);
  const lots = source.cards.map(toLotItem);
  for (const category of ["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"] as const) {
    const counts = boardCounts(buildBoardLots(source, lots, category));
    const cell = cellOf(buildGrid(source, lots, false, category), "2026-11-19", "FADL");
    assert.deepEqual([counts.lots, counts.need, counts.unidentified], [cell.lotCount, cell.needCount, cell.unidentifiedCount]);
  }
});

test("historical arrivals retain their dates on the board instead of being clamped to today", () => {
  const source = data([card({ arriveBy: "2026-11-10", mustOut: "2026-11-12" })]);
  const board = buildBoardLots(source, source.cards.map(toLotItem));
  assert.equal(board[0].plannedDate, "2026-11-10");
  assert.equal(board.filter(lot => lot.plannedDate === source.today).length, 0);
});

test("arrival duration runs forward through working days and does not depend on OT", () => {
  const source = data([card({ arriveBy: "2026-11-21", leadDays: 2 })]);
  const lot = toLotItem(source.cards[0]);
  assert.deepEqual(occupancyWindow(source, lot)?.dates, ["2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24"]);
  source.capacity.FADL["2026-11-21"] = open(1310, true);
  assert.equal(occupancyWindow(source, lot)?.endDate, "2026-11-24");
  assert.equal(occupancyWindow(source, { ...lot, leadDays: 30 }), null);
});

test("arrival warnings compare projected completion and every allocation with neighboring planned gates", () => {
  const source = data([card(), card({ id: "next", workKey: "next", gate: "FIN", arriveBy: "2026-11-19", mustOut: "2026-11-20" })]);
  const rows = source.arrivalRows;
  rows[0].prev_gate = "FVAC";
  rows[0].prev_must_out = "2026-11-14";
  rows[0].next_gate = "FIN";
  rows[0].next_arrive_by = "2026-11-19";
  rows[1].pri = rows[0].pri;
  rows[1].next_gate = "";
  const lots = source.cards.map((item, index) => ({ ...toLotItem(item), allocations: [rows[index]] }));
  assert.equal(moveWarning(lots[0], "2026-11-16", plannedDateIndex(lots, source), source), "none");
  assert.equal(moveWarning(lots[0], "2026-11-17", plannedDateIndex(lots, source), source), "late");
  assert.equal(moveWarning(lots[0], "2026-11-18", plannedDateIndex(lots, source), source), "order");
  assert.equal(moveWarning(lots[0], "2026-11-13", plannedDateIndex(lots, source), source), "order");
  const movedNext = [lots[0], { ...lots[1], plannedDate: "2026-11-20" }];
  assert.equal(moveWarning(lots[0], "2026-11-18", plannedDateIndex(movedNext, source), source), "late");
  const other = { ...rows[0], pri: 99, next_arrive_by: "2026-11-17" };
  assert.equal(moveWarning({ ...lots[0], allocations: [rows[0], other] }, "2026-11-16", undefined, source), "order");
});
