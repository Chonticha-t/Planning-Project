import type { GateQuantitySummary, GateUnit, GateUnitValues, PlanningSummaryGateRow } from "./types";

export const GATE_UNIT_LABELS: Record<GateUnit, string> = { piece: "pcs", sheet: "sheets", lot: "lots" };
export const GATE_UNIT_TITLES: Record<GateUnit, string> = { piece: "Piece", sheet: "Sheet", lot: "Actual Lot" };

export const formatGateQuantity = (value: number | null, unit: GateUnit): string => {
  if (value === null || !Number.isFinite(value)) return "N/A";
  if (unit === "sheet") return Math.ceil(value).toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value > 0 && value < 0.01 && unit !== "lot") return "<0.01";
  return value.toLocaleString("en-US", { maximumFractionDigits: unit === "lot" ? 0 : 2 });
};

const nonNegative = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

export const isGateNeedWip = (row: PlanningSummaryGateRow): boolean =>
  row.gate_state === "need_wip" || row.lot_no?.trim().toUpperCase() === "NEED WIP";

const emptyValues = (): GateUnitValues => ({ piece: 0, sheet: 0, lot: 0 });
const sum = (left: number | null, right: number | null): number | null => {
  if (left === null || right === null) return null;
  const result = left + right;
  return Number.isFinite(result) ? result : null;
};

// Each call defines one reporting scope (a gate/date, period, or filtered details).
// Full-lot WIP is repeated across PO allocations: count it once, never sum it twice.
export const summarizeGateQuantities = (rows: PlanningSummaryGateRow[]): GateQuantitySummary => {
  const result: GateQuantitySummary = {
    total: emptyValues(), in_gate: emptyValues(), coming: emptyValues(),
    need_wip: emptyValues(), other: emptyValues(), needCount: 0, unidentifiedCount: 0,
  };
  type State = "in_gate" | "coming" | "need_wip" | "other";
  type Group = { state: State; piece: number | null; rate: number | null; actualLot: boolean; product: string };
  const groups = new Map<string, Group>();
  const rank: Record<State, number> = { in_gate: 3, coming: 2, other: 1, need_wip: 0 };
  for (const [index, row] of rows.entries()) {
    if (row.gate_state === "passed") continue;
    const need = isGateNeedWip(row);
    const lot = row.lot_no?.trim() ?? "";
    const product = row.prd_name?.trim() ?? "";
    const actualLot = !need && lot !== "";
    const state: State = need ? "need_wip" : row.gate_state === "in_gate" || row.gate_state === "coming" ? row.gate_state : "other";
    const identity = actualLot
      ? ["lot", row.gate_name, lot]
      : [need ? "need" : "unidentified", row.gate_name, row.prd_name, row.item, row.po_no, row.due_date, row.pri, row.arrive_by, need ? null : index];
    const key = JSON.stringify(identity);
    const piece = nonNegative(row.qty);
    const parsedRate = nonNegative(row.pcs_per_sheet);
    const rate = parsedRate !== null && parsedRate > 0 ? parsedRate : null;
    const existing = groups.get(key);
    if (existing) {
      existing.piece = existing.product !== product || existing.piece === null || piece === null ? null : Math.max(existing.piece, piece);
      // Conflicting conversion factors cannot produce a trustworthy sheet total.
      if (existing.rate !== rate) existing.rate = null;
      if (rank[state] > rank[existing.state]) existing.state = state;
    } else {
      groups.set(key, { state, piece, rate, actualLot, product });
    }
  }
  for (const group of groups.values()) {
    const converted = group.piece === 0 ? 0 : group.piece !== null && group.rate !== null ? group.piece / group.rate : null;
    const sheet = converted !== null && Number.isFinite(converted) ? converted : null;
    const values = { piece: group.piece, sheet, lot: group.actualLot ? 1 : 0 };
    for (const target of [result[group.state], result.total]) {
      target.piece = sum(target.piece, values.piece);
      target.sheet = sum(target.sheet, values.sheet);
      target.lot += values.lot;
    }
    if (group.state === "need_wip") result.needCount++;
    else if (!group.actualLot) result.unidentifiedCount++;
  }
  return result;
};
