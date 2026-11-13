import type { LevelingData, LotItem, PlanHistoryDetail, PlanHistoryPage, ProcessCategory } from "../Capacity_Leveling/types";
import type { CountUnit } from "./types";
import { buildBoardLots, toLotItem } from "../Capacity_Leveling/utils/levelingCalculations.ts";
import { applyBoardCardOrder, readBoardCardOrder } from "../Capacity_Leveling/utils/boardCardOrder.ts";

export interface SavedGatePlan {
  plan: PlanHistoryDetail["plan"];
  snapshot: LevelingData;
}

export interface PlanReader {
  list: (signal?: AbortSignal) => Promise<PlanHistoryPage>;
  detail: (id: string, signal?: AbortSignal) => Promise<PlanHistoryDetail>;
}

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Reject incomplete historical payloads rather than silently inventing a plan. */
export function validateSnapshot(value: unknown): asserts value is LevelingData {
  if (!object(value) || value.calculationMethod !== "gate_arrival_max_target_v1"
    || value.loadBasis !== "summary_gate_arrivals_v1" || !date(value.today)
    || !Array.isArray(value.cards) || !Array.isArray(value.arrivalRows)
    || !Array.isArray(value.gates) || !Array.isArray(value.boardCardOrder)
    || !object(value.capacity) || !Array.isArray(value.calendarDays)
    || !value.calendarDays.every(day => object(day) && date(day.date) && typeof day.isWorking === "boolean")
    || !Array.isArray(value.orphanMoves) || !Number.isSafeInteger(value.undatedArrivalCount) || Number(value.undatedArrivalCount) < 0
    || !value.cards.every(card => object(card) && typeof card.id === "string" && typeof card.workKey === "string"
      && typeof card.gate === "string" && typeof card.prdName === "string"
      && (card.lotNo === null || typeof card.lotNo === "string") && date(card.plannedDate) && date(card.baseDate)
      && (card.item == null || typeof card.item === "string")
      && (card.currentGate == null || typeof card.currentGate === "string")
      && (card.currentProc == null || typeof card.currentProc === "string")
      && (card.loadMin === null || typeof card.loadMin === "number" && Number.isFinite(card.loadMin) && card.loadMin >= 0)
      && ["lot", "need", "unidentified"].includes(String(card.kind))
      && (card.moveHistory === undefined || Array.isArray(card.moveHistory) && card.moveHistory.every(entry => object(entry)
        && typeof entry.id === "string" && typeof entry.changedAt === "string" && typeof entry.changedBy === "string"
        && typeof entry.fromDate === "string" && typeof entry.toDate === "string" && (entry.note == null || typeof entry.note === "string"))))
    || !value.arrivalRows.every(row => object(row) && typeof row.workKey === "string" && typeof row.gate_name === "string"
      && typeof row.prd_name === "string" && (row.lot_no === null || typeof row.lot_no === "string")
      && (row.must_out == null || typeof row.must_out === "string")
      && (row.proc_disp == null || typeof row.proc_disp === "string")
      && (row.current_gate == null || typeof row.current_gate === "string"))
    || !value.gates.every(gate => object(gate) && typeof gate.gate === "string" && ["FPC", "SMT"].includes(String(gate.group)))
    || !value.boardCardOrder.every(group => object(group) && typeof group.gate === "string" && date(group.date)
      && Array.isArray(group.cardIds) && group.cardIds.every(id => typeof id === "string"))) {
    throw new Error("This saved plan has an unsupported or incomplete snapshot. Save a new plan in Capacity Leveling.");
  }
  const keys = new Set(value.cards.map(card => JSON.stringify([card.workKey, card.gate])));
  const gates = new Set(value.gates.map(gate => gate.gate));
  if (keys.size !== value.cards.length || gates.size !== value.gates.length
    || value.cards.some(card => !gates.has(card.gate))) {
    throw new Error("This saved plan has inconsistent card or gate identities. Save a new plan in Capacity Leveling.");
  }
  if (value.arrivalRows.some(row => row.gate_state !== "passed" && date(row.arrive_by)
    && !keys.has(JSON.stringify([row.workKey, row.gate_name])))) {
    throw new Error("This saved plan is missing arrival cards. Save a new plan in Capacity Leveling.");
  }
}

/** Pin both metadata and rows to one version; retry once if another planner saves during the read. */
export async function readLatestSavedPlan(reader: PlanReader, signal?: AbortSignal): Promise<SavedGatePlan | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    const page = await reader.list(signal);
    if (!Array.isArray(page?.plans)) throw new Error("The saved plan list is invalid. Please reload.");
    if (!page.plans.length) return null;
    const head = page.plans.find(plan => plan.isActive);
    if (!head || typeof head.planId !== "string" || !Number.isSafeInteger(head.version) || head.version < 1) {
      throw new Error("The active saved plan is unavailable. Please reload.");
    }
    const detail = await reader.detail(head.planId, signal);
    signal?.throwIfAborted();
    if (detail?.plan?.planId !== head.planId || detail.plan.version !== head.version
      || typeof detail.plan.savedAt !== "string" || typeof detail.plan.savedBy !== "string"
      || (detail.plan.note !== null && typeof detail.plan.note !== "string")) {
      throw new Error("The saved plan version does not match its details. Please reload.");
    }
    if (!detail.plan.isActive) continue;
    if (!detail.snapshot) throw new Error("This plan has no saved snapshot. Save a new version in Capacity Leveling first.");
    validateSnapshot(detail.snapshot);
    return { plan: detail.plan, snapshot: detail.snapshot };
  }
  throw new Error("The active plan changed while loading. Please reload the latest saved plan.");
}

/** Reuse the board's allocation grouping, quantities, source priority and explicit order. */
export function savedPlanRows(snapshot: LevelingData, category: ProcessCategory) {
  return applyBoardCardOrder(
    buildBoardLots(snapshot, snapshot.cards.map(toLotItem), category),
    readBoardCardOrder(snapshot.boardCardOrder),
  );
}

export function savedPlanGates(snapshot: LevelingData, category: ProcessCategory) {
  return snapshot.gates.filter(gate => category === "ALL" || gate.group === (category === "SMT" ? "SMT" : "FPC"));
}

/** Unknown quantities stay unknown; requirements never become physical lots. */
export function planQuantity(rows: LotItem[], unit: CountUnit): number | null {
  if (unit === "lots") return rows.filter(row => row.kind === "lot").length;
  return rows.reduce<number | null>((total, row) => {
    const value = unit === "pcs" ? row.qty : row.sheets;
    return total === null || value === null || !Number.isFinite(value) ? null : total + value;
  }, 0);
}

export function planStatus(lot: LotItem): string {
  if (lot.kind === "need") return "Need WIP";
  if (lot.kind === "unidentified") return "No lot ID";
  if (lot.isHold) return "HOLD";
  switch (lot.gateState) {
    case "in_gate": return "In gate";
    case "coming": return "Coming";
    default: return "Unknown";
  }
}

/** Aggregate saved arrivals, without generating output, shift splits or weekend rules. */
export function savedMonth(rows: LotItem[], snapshot: LevelingData, month: string, unit: CountUnit) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid month.");
  const first = new Date(`${month}-01T00:00:00Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const monthRows = rows.filter(row => row.plannedDate.startsWith(`${month}-`));
  const calendar = new Map((snapshot.calendarDays ?? []).map(day => [day.date, day.isWorking]));
  const days = Array.from({ length: last.getUTCDate() }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const lots = monthRows.filter(row => row.plannedDate === date);
    return { date, day: i + 1, off: calendar.get(date) === false, lots, plan: planQuantity(lots, unit) };
  });
  const products = [...new Set(monthRows.map(row => row.product))].sort().map(product => {
    const lots = monthRows.filter(row => row.product === product);
    return { product, total: planQuantity(lots, unit), cells: Object.fromEntries(days.map(day => [
      day.date, planQuantity(lots.filter(row => row.plannedDate === day.date), unit),
    ])) };
  });
  return { days, products, total: planQuantity(monthRows, unit) };
}
