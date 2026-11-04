export interface PlanningSummaryGateRow {
  pri: number;
  prd_name: string;
  item?: string | null;
  po_no?: string | null;
  due_date: string;
  status: string;
  lot_no?: string | null;
  qty?: number | null;
  allocated_qty?: number | null;
  net_required_pcs?: number | null;
  cal_net_required?: number | null;
  net_wip_qty?: number | null;
  rem_wip_qty?: number | null;
  prd_category?: string | null;
  routing_case?: string | null;
  first_gate?: string | null;
  current_gate?: string | null;
  proc_disp?: string | null;
  seq?: number | null;
  step_in_gate?: number | null;
  total_proc_in_gate?: number | null;
  rem_proc_in_gate?: number | null;
  scan_in?: string | null;
  lot_status?: string | null;
  lot_problem?: string | null;
  pending_reason?: string | null;
  gate_name: string;
  gate_order: number;
  next_gate: string;
  lead_days: number;
  gate_state: "in_gate" | "coming" | "need_wip" | string;
  start_by?: string | null;
  arrive_by?: string | null;
  must_out: string;
  start_by_no_skip?: string | null;
  arrive_by_no_skip?: string | null;
  must_out_no_skip?: string | null;
  skipped_holidays?: string[] | null;
  is_coming_3d?: boolean | null;
  must_out_today?: boolean | null;
  is_hold?: boolean | null;
  is_late?: boolean | null;
  on_time?: boolean | null;
  today_action?: string | null;
  updated_at?: string | null;
}

export interface GateKpiSummary {
  gate_name: string;
  gate_order: number;
  in_gate_count: number;
  in_gate_qty: number;
  coming_3d_count: number;
  need_wip_count: number;
  must_out_today_count: number;
  on_schedule_today_count?: number;
  hold_count: number;
  late_count: number;
}

export type PrdCategory = "FPC" | "SMT" | "ALL";
export type PlanWindow = "2w" | "1m";

export interface GateFilterState {
  category: PrdCategory;
  planWindow: PlanWindow;
  skipHolidays: boolean;
  search: string;
  selectedGate: string;
  selectedDate: string | null;
  actionTab: "all" | "today" | "in_gate" | "need_wip";
}

export interface MatrixDayCell {
  dateStr: string;
  dayName: string;
  dateDisplay: string;
  isToday: boolean;
  isHoliday: boolean;
  isLate: boolean;
  lotsCount: number;
  needCount: number;
  inGateCount: number;
  comingCount: number;
}

export interface MatrixGateRow {
  gate_name: string;
  gate_order: number;
  lateCell: MatrixDayCell;
  todayCell: MatrixDayCell;
  days: MatrixDayCell[];
}

export interface GateDailyChartData {
  dateLabel: string;
  fullDate: string;
  in_gate: number;
  coming: number;
  need_wip: number;
  total: number;
  isLate?: boolean;
  isToday?: boolean;
}

