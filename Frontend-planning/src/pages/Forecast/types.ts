export type ProcessFilter = "ALL" | "FPC" | "SMT";
export type ForecastUnit = "Pcs" | "Sheet";
export type ChartGroupMode = "Customer" | "Product";
export type TableDisplayMode = "Forecast" | "Change";

export interface ForecastVersionOption {
  value: string;
  label: string;
  uploadedAt?: string;
}

export interface ForecastWeekMeta {
  code: string;
  shortNum: string;
  isCurrentWeek?: boolean;
}

export interface CustomerForecastRow {
  id: string;
  name: string;
  color: string;
  weekly: Record<string, number>;
  compareWeekly: Record<string, number>;
  rowTotal: number;
  compareRowTotal: number;
}

export interface ProductSeriesItem {
  id: string;
  name: string;
  color: string;
  share: number;
}
