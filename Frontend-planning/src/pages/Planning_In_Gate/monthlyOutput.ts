import type { CountUnit, InGateCategory } from "./types";

export interface OutputGroup {
  gate: string; product: string; date: string; shift: "D/S" | "N/S";
  lots: number; pcs: number | null; sheets: number | null;
}
export interface MonthlyOutput {
  month: string; category: InGateCategory; search: string; checkedAt: string;
  coverage: "observed_only"; rows: OutputGroup[]; workToday: string | null;
  firstRecordedAt: string | null; lastRecordedAt: string | null;
  shiftRules: { timeZone: string; dayStart: string; nightStart: string }[];
}
export interface OutputLot {
  id: string; gate: string; product: string; lot: string; nextGate: string;
  date: string; shift: "D/S" | "N/S"; outAt: string; timeZone: string;
  pcs: number | null; sheets: number | null;
}
export interface OutputLotPage {
  month: string; category: InGateCategory; search: string; checkedAt: string;
  rows: OutputLot[]; nextCursor: string | null;
}
export interface OutputSelection {
  month: string; category: InGateCategory; search: string;
  gate: string; date: string; product?: string; asOf: string;
}

const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const amount = (value: unknown): value is number | null => value === null
  || typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const day = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const zone = (value: unknown): value is string => {
  if (!text(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
};

export function validateMonthlyOutput(value: unknown, month: string, category: InGateCategory, search: string): MonthlyOutput {
  if (!object(value) || value.month !== month || value.category !== category || value.search !== search.trim()
    || value.coverage !== "observed_only" || !timestamp(value.checkedAt)
    || !(value.workToday === null || day(value.workToday))
    || !(value.firstRecordedAt === null || timestamp(value.firstRecordedAt))
    || !(value.lastRecordedAt === null || timestamp(value.lastRecordedAt))
    || !Array.isArray(value.shiftRules) || !value.shiftRules.every(rule => object(rule) && zone(rule.timeZone)
      && typeof rule.dayStart === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(rule.dayStart)
      && typeof rule.nightStart === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(rule.nightStart))
    || !Array.isArray(value.rows) || value.rows.length > 20000) throw new Error("Invalid monthly output response.");
  const keys = new Set<string>();
  if (!value.rows.every(row => {
    if (!object(row)) return false;
    const key = JSON.stringify([row.gate, row.product, row.date, row.shift]);
    if (keys.has(key)) return false;
    keys.add(key);
    return text(row.gate) && text(row.product) && day(row.date) && row.date.startsWith(`${month}-`)
      && ["D/S", "N/S"].includes(String(row.shift)) && Number.isSafeInteger(row.lots) && Number(row.lots) > 0
      && amount(row.pcs) && amount(row.sheets);
  })) throw new Error("Invalid monthly output rows.");
  return value as unknown as MonthlyOutput;
}

export function validateOutputLots(value: unknown, selection: OutputSelection, cursor?: string): OutputLotPage {
  if (!object(value) || value.month !== selection.month || value.category !== selection.category
    || value.search !== selection.search.trim() || value.checkedAt !== selection.asOf
    || !Array.isArray(value.rows) || value.rows.length > 100
    || !(value.nextCursor === null || typeof value.nextCursor === "string" && /^[1-9]\d{0,18}$/.test(value.nextCursor))) {
    throw new Error("Invalid output details response.");
  }
  let previous = cursor ? BigInt(cursor) : null;
  if (!value.rows.every(row => {
    if (!object(row) || typeof row.id !== "string" || !/^[1-9]\d{0,18}$/.test(row.id)) return false;
    const id = BigInt(row.id);
    if (previous !== null && id >= previous) return false;
    previous = id;
    return row.gate === selection.gate && row.date === selection.date && text(row.product) && text(row.lot)
      && (selection.product === undefined || row.product === selection.product)
      && text(row.nextGate) && ["D/S", "N/S"].includes(String(row.shift)) && timestamp(row.outAt) && zone(row.timeZone)
      && amount(row.pcs) && amount(row.sheets);
  }) || value.nextCursor !== null && (!value.rows.length || value.nextCursor !== value.rows[value.rows.length - 1]?.id)) {
    throw new Error("Invalid output details rows.");
  }
  return value as unknown as OutputLotPage;
}

/** Absence of evidence stays unknown; a missing quantity never becomes zero. */
export function observedTotals(rows: OutputGroup[], unit: CountUnit) {
  const sum = (items: OutputGroup[]): number | null => {
    if (!items.length) return null;
    return items.reduce<number | null>((total, row) => {
      const value = row[unit];
      if (total === null || value === null) return null;
      const next = total + value;
      return Number.isFinite(next) && next <= Number.MAX_SAFE_INTEGER ? next : null;
    }, 0);
  };
  const ds = rows.filter(row => row.shift === "D/S"), ns = rows.filter(row => row.shift === "N/S");
  return { ds: sum(ds), ns: sum(ns), hasDs: ds.length > 0, hasNs: ns.length > 0, total: sum(rows) };
}

export function observedMonth(rows: OutputGroup[], unit: CountUnit) {
  const dates = new Map<string, OutputGroup[]>();
  const products = new Map<string, OutputGroup[]>();
  const cells = new Map<string, OutputGroup[]>();
  for (const row of rows) {
    for (const [map, key] of [[dates, row.date], [products, row.product], [cells, JSON.stringify([row.product, row.date])]] as const) {
      const group = map.get(key) ?? [];
      group.push(row);
      map.set(key, group);
    }
  }
  const summarize = (map: Map<string, OutputGroup[]>) => new Map([...map].map(([key, group]) => [key, observedTotals(group, unit)]));
  return { dates: summarize(dates), products: summarize(products), cells: summarize(cells), ...observedTotals(rows, unit) };
}
