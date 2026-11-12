import type { PlanningSummaryGateRow } from "../Planning_Summary_Gate/types";

export type ProcessCategory = "ALL" | "EFPC_GEN" | "EFPC_AUTO" | "SMT";

export type ViewMode = "board" | "list";
export type Granularity = "days" | "weeks";
export type PlanMode = "required" | "planned";
export type Shift = "day" | "night";
export type SpecialDay = "ot" | "work" | "off";
export type LoadStatus = "green" | "yellow" | "red";
export interface BoardShiftAllocation {
  status: "day" | "night" | "split" | "over" | "unassigned" | "none";
  dayMin: number;
  nightMin: number;
  overflowMin: number;
  reason?: string;
}
/** early = before arrive-by, late = after must-out, order = on or after the next gate's date */
export type MoveWarning = "none" | "early" | "late" | "order";

export interface MoveHistoryEntry {
  id: string;
  kind?: "date" | "reorder";
  fromPosition?: number;
  toPosition?: number;
  planVersion?: number;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  changedAt: string;
  changedBy: string;
  note?: string;
}

/** One card on the board: a work item at ONE gate. */
export interface LotItem {
  id: string;
  workKey: string;
  gate: string;
  /** Lot number, or "Need WIP" for work that has no lot yet */
  label: string;
  product: string;
  item: string | null;
  qty: number | null;
  kind?: "lot" | "need" | "unidentified";
  /** All source allocations represented by this visible card. */
  allocations?: GateArrivalRow[];
  /** Source cards moved together when duplicate arrivals merge on the board. */
  sourceIds?: string[];
  sheets: number | null;
  status: string;
  gateState: string;
  processGroup: string | null;
  currentGate: string | null;
  currentProc: string | null;
  isHold: boolean;
  dueDate: string;
  arriveBy: string | null;
  mustOut: string;
  /** Original arrival date at this gate; overdue arrivals are never clamped to today. */
  baseDate: string;
  /** Date in the current draft */
  plannedDate: string;
  /** Date in the last saved plan (equals baseDate when the card was never moved) */
  savedDate: string;
  overdue: boolean;
  /** The source arrival changed after the move was saved */
  sourceChanged: boolean;
  prevGate: string | null;
  prevDate: string | null;
  nextGate: string | null;
  nextDate: string | null;
  /** Normal minutes per occupied planning day; excludes OT, MC count and efficiency. */
  loadMin: number | null;
  leadDays: number | null;
  standardShiftMin: Record<Shift, number>;
  moveHistory?: MoveHistoryEntry[];
}

export interface ShiftCapacity {
  open: boolean;
  otOn: boolean;
  capacityMin: number | null;
}

export interface CapacityDay {
  off: boolean;
  hasOt: boolean;
  /** null = MC is not configured for an open shift */
  capacityMin: number | null;
  shifts: Record<Shift, ShiftCapacity>;
}

export interface GateInfo {
  gate: string;
  group: "FPC" | "SMT";
  standardShiftMin: Record<Shift, number>;
}

export interface GateArrivalRow extends PlanningSummaryGateRow {
  workKey: string;
  prev_gate?: string | null;
  prev_arrive_by?: string | null;
  prev_must_out?: string | null;
  next_arrive_by?: string | null;
  next_must_out?: string | null;
}

export interface PlanInfo {
  planId: string;
  version: number;
  note: string | null;
  savedBy: string;
  savedAt: string;
}

export interface BoardCardOrderGroup {
  gate: string;
  date: string;
  cardIds: string[];
}

export interface OrphanMove {
  workKey: string;
  gate: string;
  prdName: string | null;
  lotNo: string | null;
  dueDate: string | null;
  originalDate: string;
  plannedDate: string;
}

export interface LevelingData {
  today: string;
  days: { date: string; isWorking: boolean }[];
  calendarDays: { date: string; isWorking: boolean }[];
  gates: GateInfo[];
  capacity: Record<string, Record<string, CapacityDay>>;
  cards: ApiCard[];
  arrivalRows: GateArrivalRow[];
  undatedArrivalCount: number;
  loadBasis: "summary_gate_arrivals_v1";
  orphanMoves: OrphanMove[];
  undatedCount: number;
  duplicateWorkCount: number;
  calculationMethod: string;
  legacyPlanAvailable: boolean;
  plan: PlanInfo | null;
  boardCardOrder?: BoardCardOrderGroup[];
}

/** Card as returned by the API before it is adapted for the board. */
export interface ApiCard extends Omit<LotItem, "label" | "product" | "savedDate"> {
  prdName: string;
  lotNo: string | null;
  moved: boolean;
}

export interface GateCell {
  loadMin: number;
  capacityMin: number | null;
  /** 0 when capacity is not configured; check `configured` before reading */
  pct: number;
  configured: boolean;
  off: boolean;
  hasOt: boolean;
  previewPct?: number; // while dragging
  lotCount: number;
  needCount: number;
  unidentifiedCount: number;
  totalPcs: number | null;
  totalSheets: number | null;
  /** Actual arrivals with missing normal shift minutes. */
  missingPlanning: number;
  shiftLoadMin: Record<Shift, number>;
}

export interface DayGateLoad {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Mon", "Tue", etc.
  displayDate: string; // "03/11"
  isToday: boolean;
  /** Every leveled gate is closed on this date */
  isOff: boolean;
  gates: Record<string, GateCell>;
  gateStatusDots: Record<string, LoadStatus | "off" | "unset">;
}

export interface LevelingKpiData {
  overloadCells: number;
  overloadCellsRequired: number;
  overloadDetail: string;
  lateCards: number;
  /** Late cards that the planner moved; cards that were already overdue are not included */
  movedLateCards: number;
  orderCards: number;
  lateDetail: string;
  movedCount: number;
  totalCount: number;
  movedEarlier: number;
  movedLater: number;
  missingPlanningCards: number;
  unsetCapacityGates: string[];
}

export interface ShiftConfig {
  settingId: string | null;
  enabled: boolean;
  mcLines: number | null;
  manpower: number | null;
  minPerShift: number;
  otEnabled: boolean;
  otMinutes: number;
  break1: boolean;
  break1Min: number;
  break2: boolean;
  break2Min: number;
  lunch: boolean;
  lunchMin: number;
  efficiency: number;
  specialDays: Record<string, SpecialDay>;
}

export interface GateShiftConfig {
  gate: string;
  group: "FPC" | "SMT";
  shifts: Record<Shift, ShiftConfig>;
}
