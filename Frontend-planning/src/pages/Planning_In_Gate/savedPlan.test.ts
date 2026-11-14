/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import type { ApiCard, LevelingData, PlanHistoryDetail, PlanHistoryInfo } from "../Capacity_Leveling/types";
import { planQuantity, planStatus, readLatestSavedPlan, savedMonth, savedPlanGates, savedPlanRows, validateSnapshot } from "./savedPlan.ts";

const day = "2026-11-16";
function snapshot(): LevelingData {
  const cards: ApiCard[] = ["A", "B", "C"].map((name, index) => ({
    id: name, workKey: name, gate: "GATE_A", prdName: `PRODUCT-${name}`, lotNo: `LOT-${name}`,
    item: null, qty: 100, sheets: 10, kind: "lot", status: "production plan", gateState: "coming",
    processGroup: index === 2 ? "EFPC_GEN" : "EFPC_AUTO", currentGate: null, currentProc: null,
    isHold: false, dueDate: "2026-11-20", arriveBy: day, mustOut: "2026-11-18", baseDate: day,
    plannedDate: index === 1 ? "2026-11-17" : day, moved: index === 1, overdue: false,
    sourceChanged: false, prevGate: null, prevDate: null, nextGate: null, nextDate: null,
    loadMin: 900, leadDays: 2, standardShiftMin: { day: 450, night: 450 },
  }));
  return {
    today: day, days: [], calendarDays: [], capacity: {},
    gates: [{ gate: "GATE_A", group: "FPC", standardShiftMin: { day: 450, night: 450 } },
      { gate: "GATE_B", group: "SMT", standardShiftMin: { day: 450, night: 450 } }],
    cards, arrivalRows: cards.map((card, index) => ({
      pri: index, gate_order: 1, prd_name: card.prdName, item: card.item, lot_no: card.lotNo,
      due_date: card.dueDate, status: card.status, qty: card.qty, pcs_per_sheet: 10,
      gate_name: card.gate, gate_state: card.gateState, process_group: card.processGroup,
      arrive_by: card.arriveBy, must_out: card.mustOut, next_gate: "", lead_days: 2, workKey: card.workKey,
    })),
    orphanMoves: [], undatedCount: 0, undatedArrivalCount: 0, duplicateWorkCount: 0,
    loadBasis: "summary_gate_arrivals_v1", calculationMethod: "gate_arrival_max_target_v1",
    legacyPlanAvailable: false, plan: null,
    boardCardOrder: [{ gate: "GATE_A", date: day, cardIds: [
      JSON.stringify(["GATE_A", day, "lot", "LOT-C"]), JSON.stringify(["GATE_A", day, "lot", "LOT-A"]),
    ] }],
  };
}
const plan = (version = 1): PlanHistoryInfo => ({
  planId: `plan-${version}`, version, note: null, savedAt: "2026-11-13 10:00", savedBy: "PLANNER",
  hasSnapshot: true, isActive: true,
});
const detail = (version = 1): PlanHistoryDetail => ({ plan: plan(version), snapshot: snapshot(), moves: [], boardCardOrder: [] });

test("saved rows include unmoved work, preserve arrival moves and apply saved physical-card order without mutation", () => {
  const data = snapshot();
  const before = JSON.stringify(data);
  validateSnapshot(data);
  const rows = savedPlanRows(data, "ALL");
  assert.deepEqual(rows.map(row => row.label), ["LOT-C", "LOT-A", "LOT-B"]);
  assert.equal(rows[2].plannedDate, "2026-11-17");
  assert.equal(rows[1].plannedDate, day);
  assert.equal(JSON.stringify(data), before);
});

test("multiple allocations of one physical lot do not double count quantities", () => {
  const data = snapshot();
  data.arrivalRows.push({ ...data.arrivalRows[0], pri: 10, due_date: "2026-11-21" });
  const rows = savedPlanRows(data, "ALL");
  assert.equal(rows.length, 3);
  assert.equal(rows.find(row => row.label === "LOT-A")?.qty, 100);
  assert.equal(rows.find(row => row.label === "LOT-A")?.sheets, 10);
});

test("category filters retain correct order and gates without using mock gate names", () => {
  const data = snapshot();
  assert.deepEqual(savedPlanRows(data, "EFPC_AUTO").map(row => row.label), ["LOT-A", "LOT-B"]);
  assert.deepEqual(savedPlanRows(data, "EFPC_GEN").map(row => row.label), ["LOT-C"]);
  assert.deepEqual(savedPlanRows(data, "SMT"), []);
  assert.deepEqual(savedPlanGates(data, "SMT").map(gate => gate.gate), ["GATE_B"]);
  assert.deepEqual(savedPlanGates(data, "ALL").map(gate => gate.gate), ["GATE_A", "GATE_B"]);
});

test("Need WIP retains its identity and invalid conversion remains unknown", () => {
  const data = snapshot();
  data.cards[0] = { ...data.cards[0], kind: "need", lotNo: null, gateState: "need_wip" };
  data.arrivalRows[0] = { ...data.arrivalRows[0], lot_no: null, gate_state: "need_wip", pcs_per_sheet: null };
  const need = savedPlanRows(data, "ALL").find(row => row.kind === "need")!;
  assert.equal(need.label, "Need WIP");
  assert.equal(need.qty, 100);
  assert.equal(need.sheets, null);
});

test("no saved plan does not invent a default plan or request details", async () => {
  const result = await readLatestSavedPlan({ list: async () => ({ plans: [], nextBefore: null }),
    detail: async () => { throw new Error("Must not read details"); } });
  assert.equal(result, null);
});

test("an older plan without a snapshot is not substituted with live or mock data", async () => {
  await assert.rejects(readLatestSavedPlan({ list: async () => ({ plans: [plan()], nextBefore: null }),
    detail: async () => ({ ...detail(), snapshot: null }) }), /no saved snapshot/);
});

test("a concurrent save retries metadata and details together", async () => {
  let reads = 0;
  const ids: string[] = [];
  const result = await readLatestSavedPlan({
    list: async () => ({ plans: [plan(++reads)], nextBefore: null }),
    detail: async id => { ids.push(id); const value = detail(reads); value.plan.isActive = reads === 2; return value; },
  });
  assert.equal(result?.plan.version, 2);
  assert.deepEqual(ids, ["plan-1", "plan-2"]);
});

test("repeated concurrent saves stop with a retryable error", async () => {
  let reads = 0;
  await assert.rejects(readLatestSavedPlan({ list: async () => { reads++; return { plans: [plan()], nextBefore: null }; },
    detail: async () => ({ ...detail(), plan: { ...plan(), isActive: false } }) }), /changed while loading/);
  assert.equal(reads, 2);
});

test("mismatched versions and malformed snapshots fail instead of displaying partial data", async () => {
  await assert.rejects(readLatestSavedPlan({ list: async () => ({ plans: [plan()], nextBefore: null }), detail: async () => detail(2) }), /does not match/);
  for (const corrupt of [null, { ...snapshot(), cards: [] }, { ...snapshot(), boardCardOrder: null },
    { ...snapshot(), orphanMoves: null }, { ...snapshot(), today: "2026-02-30" },
    { ...snapshot(), gates: [] }, { ...snapshot(), cards: [...snapshot().cards, snapshot().cards[0]] }]) {
    assert.throws(() => validateSnapshot(corrupt));
  }
});

test("aborted reads and connection failures never return a saved plan", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readLatestSavedPlan({ list: async () => ({ plans: [], nextBefore: null }), detail: async () => detail() }, controller.signal), { name: "AbortError" });
  await assert.rejects(readLatestSavedPlan({ list: async () => { throw new Error("Offline"); }, detail: async () => detail() }), /Offline/);
});

test("monthly view aggregates saved dates and units without creating actual output or weekend rules", () => {
  const data = snapshot();
  const rows = savedPlanRows(data, "ALL");
  const month = savedMonth(rows, data, "2026-11", "pcs");
  assert.equal(month.total, 300);
  assert.equal(month.days.find(day => day.date === "2026-11-16")?.plan, 200);
  assert.equal(month.days.find(day => day.date === "2026-11-17")?.plan, 100);
  assert.equal(month.days.find(day => day.date === "2026-11-15")?.off, false);
  assert.equal("actual" in month, false);
  data.calendarDays = [{ date: "2026-11-16", isWorking: false }];
  assert.equal(savedMonth(rows, data, "2026-11", "lots").days.find(day => day.date === "2026-11-16")?.plan, 2, "planned arrivals must not disappear on a saved off day");
  assert.equal(savedMonth(rows, data, "2028-02", "lots").days.length, 29);
  assert.throws(() => savedMonth(rows, data, "2026-13", "pcs"));
});

test("unknown quantities stay unknown and Need WIP is not counted as a physical lot", () => {
  const data = snapshot();
  const rows = savedPlanRows(data, "ALL");
  rows[0].sheets = null;
  rows[0].kind = "need";
  assert.equal(planQuantity(rows, "lots"), 2);
  assert.equal(planQuantity(rows, "sheets"), null);
  assert.equal(savedMonth(rows, data, "2026-11", "sheets").total, null);
  assert.equal(planStatus(rows[0]), "Need WIP");
  rows[1].gateState = "in_gate";
  assert.equal(planStatus(rows[1]), "In gate", "being in a gate must not invent a Running status");
});

test("live-enriched saved plan preserves unchanged order and places newly in_gate lots after unchanged in_gate lots", () => {
  const names = ["B", "A", "E", "D", "C", "F"];
  const cards: ApiCard[] = names.map((name, index) => ({
    id: name, workKey: name, gate: "GATE_A", prdName: `PRODUCT-${name}`, lotNo: `LOT-${name}`,
    item: null, qty: 100, sheets: 10, kind: "lot", status: "production plan",
    gateState: index < 2 || name === "D" || name === "F" ? "in_gate" : "coming",
    savedGateState: index < 2 ? "in_gate" : "coming",
    processGroup: "EFPC_AUTO", currentGate: "GATE_A", currentProc: name === "F" ? "GATE_A" : "OTHER",
    isHold: name === "A", dueDate: "2026-11-20", arriveBy: day, mustOut: "2026-11-18", baseDate: day,
    plannedDate: day, moved: false, overdue: false, sourceChanged: false,
    prevGate: null, prevDate: null, nextGate: null, nextDate: null,
    loadMin: 900, leadDays: 2, standardShiftMin: { day: 450, night: 450 },
  }));
  const data: LevelingData = {
    ...snapshot(),
    cards,
    arrivalRows: cards.map((card, index) => ({
      pri: index + 1, saved_pri: index + 1, gate_order: 1, prd_name: card.prdName, item: card.item,
      lot_no: card.lotNo, due_date: card.dueDate, status: card.status, qty: card.qty, pcs_per_sheet: 10,
      gate_name: card.gate, gate_state: card.gateState, saved_gate_state: card.savedGateState,
      current_gate: card.currentGate, proc_disp: card.currentProc,
      rem_proc_in_gate: card.lotNo === "LOT-D" ? 3 : card.lotNo === "LOT-F" ? 8 : 5,
      saved_rem_proc_in_gate: 5, is_hold: card.isHold, process_group: card.processGroup,
      arrive_by: card.arriveBy, must_out: card.mustOut, next_gate: "", lead_days: 2, workKey: card.workKey,
    })),
    boardCardOrder: [{
      gate: "GATE_A",
      date: day,
      cardIds: names.map(name => JSON.stringify(["GATE_A", day, "lot", `LOT-${name}`])),
    }],
  };
  validateSnapshot(data);
  const rows = savedPlanRows(data, "ALL");
  assert.deepEqual(rows.map(row => row.label), ["LOT-B", "LOT-A", "LOT-F", "LOT-D", "LOT-E", "LOT-C"]);
  assert.equal(planStatus(rows.find(row => row.label === "LOT-F")!), "In gate");
  assert.equal(planStatus(rows.find(row => row.label === "LOT-A")!), "HOLD");
  assert.equal(planStatus(rows.find(row => row.label === "LOT-C")!), "Coming");
});
