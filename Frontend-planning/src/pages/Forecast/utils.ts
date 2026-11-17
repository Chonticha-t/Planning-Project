import type { ForecastUnit, ProcessFilter } from "./types";

export const SERIES_COLORS = [
  "#1d63dc", // Blue
  "#06b6d4", // Cyan
  "#ea580c", // Orange
  "#8b5cf6", // Purple
  "#10b981", // Emerald
  "#ef4444", // Red
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#84cc16", // Lime
  "#0284c7", // Sky
];

export const OTHERS_COLOR = "#f59e0b"; // Amber Gold

export const matchesProcessFilter = (prdType: string, filter: ProcessFilter): boolean => {
  if (filter === "ALL") return true;
  const upper = (prdType || "").toUpperCase();
  if (filter === "FPC") return upper === "E-FPC" || upper.includes("FPC");
  if (filter === "SMT") return upper === "M-SMT" || upper.includes("SMT");
  return true;
};

export const formatQty = (val: number, unit: ForecastUnit): string => {
  if (unit === "Lot") {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  }
  return Math.round(val).toLocaleString();
};

export const formatAxisTick = (val: number): string => {
  if (val === 0) return "0";
  if (val >= 1_000_000) {
    const m = val / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  if (val >= 1000) {
    const k = val / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
  }
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
};
