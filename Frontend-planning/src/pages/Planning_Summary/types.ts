export interface PlanningSummaryRow {
  id: number | string;
  prd_name: string;
  item?: string;
  due_date: string;
  ship_to_p1?: string | null;
  scan_in?: string | null;
  priority?: string | null;
  day_left?: number | null;
  po_bal: number;
  inventory: number;
  net_required_pcs: number;
  cal_net_required?: number;
  status: string;
  lot_no: string;
  proc_disp: string;
  seq: number | null;
  net_wip_qty: number;
  rem_wip_qty?: number | null;
  factory_desc: string;
  prd_type: string;
  gate_name: string;
  yield: number | null;
  lot_status: string;
  lot_problem: string;
  pending_reason: string;
  skipped_due_date?: string | null;
  updated_at: string;
}

export const SORT_OPTIONS: { field: keyof PlanningSummaryRow; label: string }[] = [
  { field: "prd_name", label: "Product" },
  { field: "due_date", label: "Due Date" },
  { field: "ship_to_p1", label: "Target Ship P1" },
  { field: "priority", label: "Priority" },
  { field: "day_left", label: "Day Left" },
  { field: "status", label: "Status" },
  { field: "cal_net_required", label: "Net Required" },
  { field: "lot_no", label: "Lot No" },
  { field: "net_wip_qty", label: "Net WIP" },
  { field: "proc_disp", label: "Process (Gate Process)" },
  { field: "scan_in", label: "Scan WIP FFPC" },
  { field: "lot_status", label: "Lot Status" },
];

export type ItemUnitFilter = "" | "94" | "95";

export const ITEM_UNIT_OPTIONS: { value: ItemUnitFilter; label: "ALL" | "FPC" | "SMT" }[] = [
  { value: "", label: "ALL" },
  { value: "94", label: "FPC" },
  { value: "95", label: "SMT" },
];

export interface PlanningSummaryFilter {
  prd_name: string;
  status: string;
  priority?: string;
  item_prefix?: string;
  proc_disp?: string;
  gate_name?: string;
  lot_status: string;
  factory_desc: string;
  startdate: string;
  stopdate: string;
}

export interface PlanningSummaryKPI {
  total_rows: number;
  total_products: number;
  total_lots: number;
  total_net_required: number;
  total_net_wip: number;
  top_count?: number;
  urgent_count?: number;
  high_count?: number;
  wip_count?: number;
  hold_count?: number;
  pending_count?: number;
  last_updated?: string;
}

export interface DistinctFilters {
  products: string[];
  lot_nos?: string[];
  statuses: string[];
  priorities?: string[];
  processes?: string[];
  gate_names?: string[];
  lot_statuses: string[];
  factories: string[];
}

export interface ApiResponse<T> {
  status: "OK" | "ERROR";
  data: T;
  message: string;
}
