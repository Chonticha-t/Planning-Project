export type GateGroup = "FPC" | "SMT";

/** Same process-group switch as Planning Summary Gate / Capacity Leveling */
export type InGateCategory = "ALL" | "EFPC_GEN" | "EFPC_AUTO" | "SMT";

export type OrderBy = "plan" | "mustOut" | "lot" | "qty";

export type WorkMode = "edit" | "view";

/** Status the lot has before capacity is applied (capacity overflow → "Next day / OT" is derived). */
export type LotBaseStatus =
  | "done" // Completed (scanned out of this gate today)
  | "top" // Due moved earlier (pulled in by planning)
  | "carried" // Carried over from previous day
  | "running"
  | "waiting"
  | "hold"
  | "arriving";

export interface InGateGate {
  id: string;
  name: string;
  capacityMin: number;
}

export interface GateProcessStep {
  code: string; // e.g. "FVAC-01"
  name: string; // e.g. "Vacuum lamination"
  status: "done" | "running" | "upcoming";
  timeLabel: string; // e.g. "22:05 → 22:48" | "in 22:50" | "est. 35 min"
  subLabel?: string; // e.g. "43 min" | "running 10 min"
}

export interface SmartHint {
  tone: "amber" | "indigo";
  text: string;
  /** Optional target lot id to move after when clicked */
  moveAfterLotId?: string;
  /** Optional target index (0-based) when clicked */
  moveToIndex?: number;
}

export interface FinishedTodayLot {
  id: string;
  product: string;
  qty: number;
  shift: "D/S" | "N/S";
  outAt: string;
}

export interface FinishedTodaySummary {
  totalLots: number;
  totalPcs: number;
  dsLots: number;
  nsLots: number;
  plannedToNow: number;
  lots: FinishedTodayLot[];
}

export interface InGateLot {
  id: string; // e.g. "XXXXX-022"
  product: string;
  qty: number;
  sheet: number; // qty in sheets
  outputPcs: number; // already output from this gate today
  outputSheet: number;
  minutes: number; // remaining process time needed at this gate (for ETA calculation)
  nowAt: string; // e.g. "FVAC · step 2/3"
  mustOut: string; // YYYY-MM-DD
  status: LotBaseStatus;
  outAt?: string; // "09:12" when status === "done"
  arrivingAt?: string; // "11:00"
  note?: string;
  /** Which shift section the lot belongs to ("day" = closed D/S hold/carryover, "night" = active queue) */
  shiftSection?: "day" | "night";
  /** 1-based step index inside the current gate transition (e.g. 2 of 4) */
  stepNow?: number;
  stepTotal?: number;
  /** Current process code & name (e.g. "FVAC-02", "Curing") */
  currentProcCode?: string;
  currentProcName?: string;
  /** Origin gate and target next gate for this transition (e.g. "FVAC" -> "FADL") */
  fromGate?: string;
  nextGate?: string;
  /** Sub-process steps shown in the Gate route popover */
  gateSteps?: GateProcessStep[];
  /** Smart hint chip */
  smartHint?: SmartHint;
}

/** Plan pushed from Capacity Leveling → Save Plan */
export interface SavedPlanInfo {
  version: number;
  savedAt: string; // ISO
  savedBy: string;
  reason?: string;
  sourceCategory: string; // Capacity Leveling category at save time
}

/** Work-list order saved on the In Gate page per group/gate/day */
export interface SavedOrder {
  ids: string[];
  savedAt: string; // ISO
  savedBy: string;
  summary: string; // "moved XXXXX-016 to #1, XXXXX-041 to #2"
  planVersion: number;
}

/** One lot the planner deliberately moved (positions are 1-based) */
export interface OrderMove {
  lotId: string;
  product: string;
  from: number;
  to: number;
}

/** Result of comparing the saved order with the new order */
export interface OrderDiff {
  moves: OrderMove[];
  pushedOut: string[]; // fit today before → below the red line after
  nowFit: string[]; // below the red line before → fit today after
}

/** One "Save order" in the In Gate history */
export interface OrderHistoryEntry extends OrderDiff {
  id: string;
  savedAt: string; // ISO
  savedBy: string;
  planVersion: number;
  reason?: string;
}

// ── Summary · Month ─────────────────────────────────────────────────────────

export type InGateView = "day" | "month";
export type CountUnit = "lots" | "pcs" | "sheets";

export interface MonthProduct {
  name: string;
  code: string;
  lotPcs: number; // pcs per lot
  dailyLots: number; // plan lots on a weekday
  satLots: number; // plan lots on Saturday (0 = not running)
}

export interface MonthDay {
  date: string; // YYYY-MM-DD
  day: number;
  dow: number; // 0 = Sunday
  off: boolean;
  phase: "past" | "today" | "future";
}

/** One product on one day, in lots. ds / ns are null when there is no scan out (future, shift not run). */
export interface MonthCell {
  plan: number;
  planDs: number;
  planNs: number | null;
  ds: number | null;
  ns: number | null;
}

export interface MonthRow {
  product: MonthProduct;
  cells: Record<string, MonthCell>; // by date; missing = product not planned that day
}

export interface MonthSummaryData {
  days: MonthDay[];
  rows: MonthRow[];
}

export interface MonthLot {
  id: string;
  product: string;
  scanIn: string; // YYYY-MM-DD HH:mm
  scanOut: string;
  shift: "D" | "N";
  po: string;
  due: string; // YYYY-MM-DD
  lateDays: number; // 0 = on time (scan out date vs due)
}
