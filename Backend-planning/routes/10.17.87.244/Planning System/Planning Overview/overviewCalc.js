// Pure calculations for the Planning Overview page (PO Balance vs B/L FG).
// B/L FG on a day = FG stock (F/G + Unmovement) + WIP after yield − PO balance still open up to that day.

const DAY_MS = 86400000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const isIsoDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
};

const addDays = (iso, days) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const weekday = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`)).getUTCDay();

// Every calendar date from start to end, inclusive.
const listDates = (start, end) => {
  const dates = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
};

// The days shown as columns. isWorking comes from the working-day calendar; without it, Sundays are hidden.
const buildDays = (start, end, today, isWorking) => {
  const working = typeof isWorking === "function" ? isWorking : (iso) => weekday(iso) !== 0;
  return listDates(start, end)
    .filter((iso) => working(iso))
    .map((iso) => ({ date: iso, dow: DOW[weekday(iso)], is_today: iso === today }));
};

// Item codes starting 94 are FPC and 95 are SMT, the same rule as the other planning pages.
const productType = (item) => {
  const code = String(item ?? "").trim();
  if (code.startsWith("94")) return "FPC";
  if (code.startsWith("95")) return "SMT";
  return "";
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Builds one row per product that has PO open on or before the last shown day.
 * po_new[i] holds the PO that becomes due by day i and after day i-1, so PO due on a hidden
 * non-working day lands on the next shown day. The first day also carries PO due before it.
 */
const buildOverviewRows = ({ days, poLines = [], supply = [], wip = [] }) => {
  if (!days.length) return [];
  const dates = days.map((d) => d.date);
  const lastDay = dates[dates.length - 1];

  const poByProduct = new Map();
  for (const line of poLines) {
    const qty = num(line.qty);
    if (!line.prd_name || !isIsoDate(line.due_date) || line.due_date > lastDay || qty <= 0) continue;
    // First shown day on or after the due date.
    const idx = dates.findIndex((d) => d >= line.due_date);
    if (idx < 0) continue;
    const perDay = poByProduct.get(line.prd_name) || new Array(dates.length).fill(0);
    perDay[idx] += qty;
    poByProduct.set(line.prd_name, perDay);
  }

  const supplyByProduct = new Map(supply.map((s) => [s.prd_name, s]));
  const wipByProduct = new Map(wip.map((w) => [w.prd_name, w]));

  const rows = [];
  for (const [prdName, poNew] of poByProduct) {
    const s = supplyByProduct.get(prdName) || {};
    const w = wipByProduct.get(prdName) || {};
    const fg = num(s.f_g);
    const unmovement = num(s.unmovement);
    const fgStock = fg + unmovement;
    const wipQty = num(w.wip_qty);
    const available = fgStock;

    let cum = 0;
    let firstShort = -1;
    const poCum = [];
    const bl = [];
    poNew.forEach((qty, i) => {
      cum += qty;
      poCum.push(cum);
      const balance = available - cum;
      bl.push(balance);
      if (balance < 0 && firstShort < 0) firstShort = i;
    });

    rows.push({
      prd_name: prdName,
      item: s.item ? String(s.item).trim() : "",
      type: productType(s.item),
      fg_stock: fgStock,
      f_g: fg,
      unmovement,
      wip_qty: wipQty,
      wip_lots: num(w.wip_lots),
      wip_lots_no_yield: num(w.wip_lots_no_yield),
      po_new: poNew,
      po_cum: poCum,
      bl,
      first_short: firstShort,
      end_bl: bl[bl.length - 1],
    });
  }

  // Products that go short first are on top; then the smaller balance first.
  rows.sort((a, b) => {
    const fa = a.first_short < 0 ? Infinity : a.first_short;
    const fb = b.first_short < 0 ? Infinity : b.first_short;
    if (fa !== fb) return fa - fb;
    if (a.end_bl !== b.end_bl) return a.end_bl - b.end_bl;
    return a.prd_name.localeCompare(b.prd_name);
  });
  return rows;
};

module.exports = { DOW, addDays, buildDays, buildOverviewRows, isIsoDate, listDates, productType };
