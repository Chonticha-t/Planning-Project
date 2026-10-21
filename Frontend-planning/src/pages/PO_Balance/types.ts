export type PlanningStatus = "ready" | "production plan";

export interface PlanningRow {
  prd_name: string;
  due_date: string;
  po_bal: number;
  unmovement: number;
  f_g: number;

  net_required_pcs: number;
  rem_unmovement: number;
  rem_fg: number;
  status: PlanningStatus;
  updated_at: string;
}

export const SORT_OPTIONS: { field: keyof PlanningRow; label: string }[] = [
  { field: "prd_name", label: "Product" },
  { field: "due_date", label: "Due Date" },
  { field: "po_bal", label: "PO Bal" },
  { field: "unmovement", label: "Unmovement" },
  { field: "rem_unmovement", label: "Rem Unmove" },
  { field: "f_g", label: "F/G" },
  { field: "rem_fg", label: "Rem F/G" },
  { field: "net_required_pcs", label: "Net Required" },
];

export interface PlanningSummaryRow {
  status: PlanningStatus;
  total_rows: number;
  total_products: number;
  po_bal: number;
  net_required_pcs: number;
  updated_at: string;
}

export interface PlanningFilter {
  status: "" | PlanningStatus;
  prd_name: string;
  startdate: string;
  stopdate: string;
}

export interface ApiResponse<T> {
  status: "OK" | "ERROR";
  data: T;
  message: string;
}
