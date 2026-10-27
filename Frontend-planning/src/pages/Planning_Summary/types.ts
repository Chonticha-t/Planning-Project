export interface PlanningSummaryRow {
  id: number | string;
  prd_name: string;
  due_date: string;
  po_bal: number;
  inventory: number;
  net_required_pcs: number;
  cal_net_required?: number;
  status: string;
  lot_no: string;
  proc_disp: string;
  seq: number | null;
  net_wip_qty: number;
  factory_desc: string;
  prd_type: string;
  gate_name: string;
  yield: number | null;
  lot_status: string;
  lot_problem: string;
  pending_reason: string;
  updated_at: string;
}

export interface PlanningSummaryFilter {
  prd_name: string;
  status: string;
  lot_status: string;
  factory_desc: string;
  startdate: string;
  stopdate: string;
}

export interface PlanningSummaryKPI {
  total_rows: number;
  total_products: number;
  total_lots: number;
  total_po_bal: number;
  total_inventory: number;
  total_net_required: number;
  total_net_wip: number;
  total_problems: number;
  last_updated?: string;
}

export interface DistinctFilters {
  products: string[];
  statuses: string[];
  lot_statuses: string[];
  factories: string[];
}

export interface ApiResponse<T> {
  status: "OK" | "ERROR";
  data: T;
  message: string;
}

