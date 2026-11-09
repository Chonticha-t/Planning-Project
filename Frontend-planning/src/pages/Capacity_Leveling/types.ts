export type ProcessCategory = "ALL" | "EFPC_GEN" | "EFPC_AUTO" | "SMT";

export type ViewMode = "board" | "list";
export type Granularity = "days" | "weeks";
export type PlanMode = "required" | "planned";

export interface RouteStep {
  gateId: string;
  gateName: string;
  offsetDays: number; // Days after release when lot arrives here
  minutes: number;
}

export interface MoveHistoryEntry {
  id: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  changedAt: string; // e.g. "09/11/2026 13:40"
  changedBy: string; // e.g. "Planner (Draft)" | "Plan v2"
  note?: string;
}

export interface LotItem {
  id: string; // e.g. "4500125"
  product: string; // e.g. "Model B"
  qty: number;
  routeId: string; // "FPC_CASE_1" | "FPC_CASE_2" | "FPC_CASE_3" | "FPC_CASE_4" | "SMT" | "FULL"
  systemStartDate: string; // "2026-11-16"
  mustStartDate: string; // "2026-11-17"
  releaseDate: string; // "2026-11-13" (current draft date)
  initialReleaseDate: string; // "2026-11-16"
  wasDate?: string; // e.g. "16/11" or "12/11" when moved
  shipDate: string; // e.g. "25/11"
  routeSteps: RouteStep[];
  moveHistory?: MoveHistoryEntry[];
}

export interface GateDefinition {
  id: string;
  name: string;
  normalCapacityMin: number;
  otCapacityMin: number;
  shifts: number;
  minutesPerShift: number;
  mcCount: number;
  efficiency: number; // e.g. 0.85
  otMinutes: number;
}

export interface DayGateLoad {
  date: string; // YYYY-MM-DD
  dayLabel: string; // "Mon", "Tue", etc.
  displayDate: string; // "03/11"
  isSunday: boolean;
  isFrozen: boolean; // week 1 (<= 7 days from start)
  hasOt: boolean;
  gates: Record<string, {
    loadMin: number;
    capacityMin: number;
    pct: number;
    previewPct?: number; // while dragging
    hasOt?: boolean;
    lotCount?: number;
    totalPcs?: number;
    totalSheets?: number;
  }>;
  totalNewWorkPct: number;
  gateStatusDots: Record<string, "green" | "yellow" | "red">;
}

export interface LevelingKpiData {
  redCellsPlanningBefore: number;
  redCellsPlanningAfter: number;
  redCellPlanningDetail: string;
  posAtRiskBefore: number;
  posAtRiskAfter: number;
  posAtRiskDetail: string;
  releasesMovedCount: number;
  releasesTotalCount: number;
  releasesMovedEarlier: number;
  releasesMovedLater: number;
  week1RedCells: number;
}
