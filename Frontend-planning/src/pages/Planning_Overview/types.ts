export interface OverviewDay {
  date: string; // YYYY-MM-DD
  dow: string; // Mon, Tue, ...
  is_today: boolean;
}

export interface OverviewProduct {
  prd_name: string;
  item: string;
  type: "FPC" | "SMT" | "";
  fg_stock: number; // F/G + Unmovement
  f_g: number;
  unmovement: number;
  wip_qty: number; // sum of net_wip_qty (after yield)
  wip_lots: number;
  wip_lots_no_yield: number; // lots with yield 0, so they add nothing to wip_qty
  po_new: number[]; // PO that becomes due on each shown day
  po_cum: number[]; // PO still open up to each shown day
  bl: number[]; // fg_stock + wip_qty - po_cum
  first_short: number; // index of the first day with B/L < 0, or -1
  end_bl: number;
}

export interface OverviewData {
  today: string;
  start: string;
  end: string;
  calendar: "working-calendar" | "fallback";
  days: OverviewDay[];
  products: OverviewProduct[];
  updated_at: string | null;
}

export interface ApiResponse<T> {
  status: "OK" | "ERROR";
  data: T;
  message: string;
}

export type UnitFilter = "ALL" | "FPC" | "SMT";
export type ShowFilter = "all" | "short";

export const HORIZON_OPTIONS = [30] as const;
export type Horizon = (typeof HORIZON_OPTIONS)[number];
export const DEFAULT_HORIZON: Horizon = 30;
