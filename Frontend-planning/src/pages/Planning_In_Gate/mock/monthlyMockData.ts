// Mock data for In Gate → "Summary · Month" (lots out of a gate per day by shift).
// Deterministic per scope/gate/month/plan version until the backend endpoint exists.
import dayjs from "dayjs";
import type {
  CountUnit,
  InGateGate,
  MonthCell,
  MonthDay,
  MonthLot,
  MonthProduct,
  MonthSummaryData,
} from "../types";
import { PCS_PER_SHEET } from "./inGateMockData";

const PRODUCT_POOL: MonthProduct[] = [
  { name: "DAN-120S-2A", code: "95-01234", lotPcs: 1200, dailyLots: 48, satLots: 30 },
  { name: "VLO-155W-0A", code: "94-00871", lotPcs: 960, dailyLots: 36, satLots: 22 },
  { name: "CAD-170S-1A", code: "94-00912", lotPcs: 1440, dailyLots: 30, satLots: 18 },
  { name: "MOK-210F-3B", code: "94-01007", lotPcs: 720, dailyLots: 26, satLots: 16 },
  { name: "KIT-090S-1C", code: "95-01310", lotPcs: 1080, dailyLots: 20, satLots: 12 },
  { name: "RAM-130W-2B", code: "94-00955", lotPcs: 840, dailyLots: 16, satLots: 10 },
  { name: "SEN-160F-1A", code: "95-01402", lotPcs: 600, dailyLots: 12, satLots: 0 },
  { name: "PIM-075S-2C", code: "95-01188", lotPcs: 1320, dailyLots: 22, satLots: 14 },
  { name: "TAK-140W-1B", code: "94-01066", lotPcs: 900, dailyLots: 14, satLots: 0 },
];

const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Lots → selected count unit */
export const toUnit = (lots: number, product: MonthProduct, unit: CountUnit) => {
  if (unit === "lots") return lots;
  const pcs = lots * product.lotPcs;
  return unit === "pcs" ? pcs : Math.ceil(pcs / PCS_PER_SHEET);
};

export const UNIT_LABEL: Record<CountUnit, string> = { lots: "lots", pcs: "pcs", sheets: "sheets" };

/**
 * Month summary of one gate. Sundays are OFF. Days before `today` have scan-out actuals,
 * `today` is partly done, later days only carry the saved plan.
 */
export const buildMonthSummary = (
  scope: string,
  gate: InGateGate,
  month: string, // YYYY-MM
  planVersion: number,
  today: string // YYYY-MM-DD
): MonthSummaryData => {
  const seedKey = `${scope}|${gate.id}|${month}|v${planVersion}`;
  const rnd = mulberry32(hashString(seedKey));
  const start = dayjs(`${month}-01`);
  const nowHour = dayjs().hour();

  // 6–7 products per gate, volume scaled a little per gate
  const offset = hashString(`${scope}|${gate.id}`) % PRODUCT_POOL.length;
  const count = 6 + (hashString(gate.id) % 2);
  const scale = gate.capacityMin < 5000 ? 0.5 : 0.85 + (hashString(`${gate.id}|s`) % 4) * 0.08;
  const products = Array.from({ length: count }, (_, i) => {
    const p = PRODUCT_POOL[(offset + i) % PRODUCT_POOL.length];
    return {
      ...p,
      dailyLots: Math.max(2, Math.round(p.dailyLots * scale)),
      satLots: Math.round(p.satLots * scale),
    };
  });

  const days: MonthDay[] = Array.from({ length: start.daysInMonth() }, (_, i) => {
    const d = start.add(i, "day");
    const date = d.format("YYYY-MM-DD");
    return {
      date,
      day: d.date(),
      dow: d.day(),
      off: d.day() === 0,
      phase: date < today ? "past" : date === today ? "today" : "future",
    };
  });

  const rows = products.map((product) => {
    const cells: Record<string, MonthCell> = {};
    days.forEach((d) => {
      if (d.off) return;
      const plan = d.dow === 6 ? product.satLots : product.dailyLots;
      if (plan === 0) return;
      // Always draw the same amount of randomness per cell so values do not shift as days pass
      const r1 = rnd();
      const r2 = rnd();
      const r3 = rnd();
      if (d.phase === "future") {
        cells[d.date] = { plan, ds: null, ns: null };
        return;
      }
      // ~30% of cells miss the plan a little, a few beat it
      const ratio = r1 < 0.3 ? 0.9 + r2 * 0.08 : r1 < 0.85 ? 1 : 1 + r2 * 0.05;
      let total = Math.max(1, Math.round(plan * ratio));
      const noNight = d.dow === 6 && r3 < 0.6; // Saturday often runs day shift only
      let ds = noNight ? total : Math.round(total * (0.58 + r3 * 0.08));
      let ns: number | null = noNight ? null : total - ds;
      if (d.phase === "today") {
        // Partly done: day shift in progress, night shift not started before 20:00
        const progress = Math.min(1, Math.max(0.15, (nowHour - 8) / 12));
        ds = Math.round(ds * progress);
        ns = nowHour >= 20 && ns !== null ? Math.round(ns * Math.min(1, (nowHour - 20) / 12 + 0.1)) : null;
        total = ds + (ns ?? 0);
      }
      cells[d.date] = { plan, ds, ns };
    });
    return { product, cells };
  });

  return { days, rows };
};

/** Lots behind one cell (product × day) with scan in / out times. */
export const buildCellLots = (
  seedKey: string,
  product: MonthProduct,
  date: string,
  cell: MonthCell
): MonthLot[] => {
  const rnd = mulberry32(hashString(`${seedKey}|${product.code}|${date}`));
  const day = dayjs(date);
  const lots: MonthLot[] = [];
  let seq = 1 + Math.floor(rnd() * 700);
  const add = (shift: "D" | "N", n: number) => {
    for (let i = 0; i < n; i++) {
      // D/S 08:00–20:00 · N/S 20:00–08:00 (next morning still belongs to this day)
      const out = day.hour(shift === "D" ? 8 : 20).minute(0).add(Math.floor(rnd() * 72) * 10, "minute");
      const scanIn = out.subtract(4 + Math.floor(rnd() * 16), "hour").subtract(Math.floor(rnd() * 6) * 10, "minute");
      const r = rnd();
      const lateDays = r < 0.12 ? 1 : r < 0.15 ? 2 : 0;
      const due = lateDays ? out.subtract(lateDays, "day") : out.add(Math.floor(rnd() * 3), "day");
      lots.push({
        id: `XXXXX-${String(seq++).padStart(3, "0")}`,
        product: product.name,
        scanIn: scanIn.format("YYYY-MM-DD HH:mm"),
        scanOut: out.format("YYYY-MM-DD HH:mm"),
        shift,
        po: `45001${18 + Math.floor(rnd() * 3)}`,
        due: due.format("YYYY-MM-DD"),
        lateDays,
      });
    }
  };
  add("D", cell.ds ?? 0);
  add("N", cell.ns ?? 0);
  return lots.sort((a, b) => a.scanOut.localeCompare(b.scanOut));
};

export interface DayTotal {
  plan: number;
  ds: number;
  ns: number;
  hasActual: boolean;
}

/** Per-day totals of one gate in the selected unit */
export const dayTotals = (data: MonthSummaryData, unit: CountUnit, rows = data.rows) => {
  const out: Record<string, DayTotal> = {};
  data.days.forEach((d) => {
    const t: DayTotal = { plan: 0, ds: 0, ns: 0, hasActual: false };
    rows.forEach((r) => {
      const c = r.cells[d.date];
      if (!c) return;
      t.plan += toUnit(c.plan, r.product, unit);
      if (c.ds !== null) {
        t.hasActual = true;
        t.ds += toUnit(c.ds, r.product, unit);
        t.ns += toUnit(c.ns ?? 0, r.product, unit);
      }
    });
    out[d.date] = t;
  });
  return out;
};
