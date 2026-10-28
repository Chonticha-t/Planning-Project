export interface PlanningSummaryRow {
  id: number | string;
  prd_name: string;
  due_date: string;
  ship_to_p1?: string | null;
  priority?: string | null;
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
  updated_at: string;
}

export const SORT_OPTIONS: { field: keyof PlanningSummaryRow; label: string }[] = [
  { field: "prd_name", label: "Product" },
  { field: "due_date", label: "Due Date" },
  { field: "ship_to_p1", label: "Ship to P1" },
  { field: "priority", label: "Priority" },
  { field: "status", label: "Status" },
  { field: "po_bal", label: "PO Bal" },
  { field: "inventory", label: "Inventory" },
  { field: "net_required_pcs", label: "Net Required" },
  { field: "lot_no", label: "Lot No" },
  { field: "proc_disp", label: "Process" },
  { field: "seq", label: "Seq" },
  { field: "net_wip_qty", label: "Net WIP" },
  { field: "yield", label: "Yield %" },
  { field: "factory_desc", label: "Factory" },
  { field: "prd_type", label: "Type" },
  { field: "gate_name", label: "Gate" },
  { field: "lot_status", label: "Lot Status" },
];

export interface PlanningSummaryFilter {
  prd_name: string;
  status: string;
  priority?: string;
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
  lot_nos?: string[];
  statuses: string[];
  priorities?: string[];
  lot_statuses: string[];
  factories: string[];
}

export interface ApiResponse<T> {
  status: "OK" | "ERROR";
  data: T;
  message: string;
}
