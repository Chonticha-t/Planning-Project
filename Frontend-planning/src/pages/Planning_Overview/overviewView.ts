import type { OverviewProduct, ShowFilter, UnitFilter } from "./types";

export const WINDOW_SIZE = 7;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

// "|| 0" turns -0 into 0 so an empty PO balance never shows as "-0".
export const formatQty = (value: number) =>
  (Math.round(value) || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

/** "2026-11-23" -> "23-Nov" (column headers). */
export const dayLabel = (iso: string) => {
  const { m, d } = parts(iso);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}`;
};

/** "2026-12-06" -> "6 Dec". */
export const shortDate = (iso: string) => {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
};

/** "2026-11-23 08:30:12" -> "08:30" when it is today, else "22/11 08:30". */
export const updatedLabel = (updatedAt: string | null | undefined, today: string | undefined) => {
  if (!updatedAt) return "--:--";
  const date = updatedAt.slice(0, 10);
  const time = updatedAt.slice(11, 16);
  if (date === today) return time;
  const { m, d } = parts(date);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")} ${time}`;
};

/** "2026-11-23", "2026-12-06" -> "23 Nov – 6 Dec 2026". */
export const rangeLabel = (start: string, end: string) => {
  const a = parts(start);
  const b = parts(end);
  const left = a.y === b.y ? `${a.d} ${MONTHS[a.m - 1]}` : `${a.d} ${MONTHS[a.m - 1]} ${a.y}`;
  return `${left} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
};

export const addDays = (iso: string, days: number) => {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export const localToday = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const isShort = (p: OverviewProduct) => p.first_short >= 0;

export const filterByUnit = (products: OverviewProduct[], unit: UnitFilter) =>
  unit === "ALL" ? products : products.filter((p) => p.type === unit);

export const filterProducts = (
  products: OverviewProduct[],
  { show, search }: { show: ShowFilter; search: string }
) => {
  const q = search.trim().toLowerCase();
  return products.filter(
    (p) => (show === "all" || isShort(p)) && (!q || p.prd_name.toLowerCase().includes(q))
  );
};

export interface OverviewKpi {
  products: number;
  lots: number;
  lotsNoYield: number;
  po: number;
  fgStock: number;
  wip: number;
  enough: number;
  short: number;
  shortPcs: number;
}

export const computeKpi = (products: OverviewProduct[]): OverviewKpi => {
  const kpi: OverviewKpi = {
    products: products.length, lots: 0, lotsNoYield: 0, po: 0, fgStock: 0, wip: 0, enough: 0, short: 0, shortPcs: 0,
  };
  for (const p of products) {
    kpi.lots += p.wip_lots;
    kpi.lotsNoYield += p.wip_lots_no_yield;
    kpi.po += p.po_cum[p.po_cum.length - 1] ?? 0;
    kpi.fgStock += p.fg_stock;
    kpi.wip += p.wip_qty;
    if (isShort(p)) {
      kpi.short += 1;
      kpi.shortPcs += Math.max(0, -p.end_bl);
    } else {
      kpi.enough += 1;
    }
  }
  return kpi;
};

/** Total row: FG and WIP sums, PO balance sums, and B/L FG as the total short (negative balances only). */
export const computeTotals = (rows: OverviewProduct[], dayIndexes: number[]) => {
  let fg = 0;
  let wip = 0;
  const po = dayIndexes.map(() => 0);
  const short = dayIndexes.map(() => 0);
  for (const r of rows) {
    fg += r.fg_stock;
    wip += r.wip_qty;
    dayIndexes.forEach((d, i) => {
      po[i] += r.po_cum[d] ?? 0;
      const bl = r.bl[d] ?? 0;
      if (bl < 0) short[i] += bl;
    });
  }
  return { fg, wip, po, short };
};

/** The days shown at once; paging moves by a whole window and the last page shows the final days. */
export const dayWindow = (totalDays: number, start: number, size = WINDOW_SIZE) => {
  const maxStart = Math.max(0, totalDays - size);
  const from = Math.min(Math.max(0, start), maxStart);
  const indexes: number[] = [];
  for (let i = from; i < Math.min(totalDays, from + size); i++) indexes.push(i);
  return { from, indexes, maxStart };
};
