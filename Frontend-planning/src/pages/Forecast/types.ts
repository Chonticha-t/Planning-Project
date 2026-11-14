export type ProcessFilter = "ALL" | "FPC" | "SMT";
export type ForecastUnit = "Pcs" | "Lot";
export type ChartGroupMode = "Customer" | "Product";
export type TableGroupMode = "Customer" | "Product";

export interface ForecastWeekMeta {
  code: string;
  shortNum: string;
  inputDate?: string | null;
  isCurrentWeek?: boolean;
}

export interface ForecastProductItem {
  product: string;
  prdType: string; // "M-SMT" | "E-FPC"
  customer: string;
  pcsLot: number | null;
  weeklyPcs: Record<string, number>;
}

export interface ForecastApiResponse {
  status: string;
  lastUpdated: {
    date: string;
    time: string;
    iso: string | null;
  };
  weeks: ForecastWeekMeta[];
  products: ForecastProductItem[];
}

export interface AggregatedForecastRow {
  id: string;
  name: string;
  subLabel?: string;
  color: string;
  weekly: Record<string, number>;
  rowTotal: number;
}
