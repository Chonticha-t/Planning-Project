import dayjs from "dayjs";
import { mergeMoveHistory } from "./moveHistory.ts";
import { isGateNeedWip, summarizeGateQuantities } from "../../Planning_Summary_Gate/gateUnits.ts";
import type {
  ApiCard,
  DayGateLoad,
  GateCell,
  GateArrivalRow,
  LevelingData,
  LevelingKpiData,
  LoadStatus,
  LotItem,
  MoveWarning,
  ProcessCategory,
  ShiftConfig,
} from "../types";

/** Green up to 85%, yellow up to 100%, red above. */
export const loadStatus = (pct: number): LoadStatus =>
  pct > 100 ? "red" : pct > 85 ? "yellow" : "green";

export const pctPillClass = (pct: number) => {
  const status = loadStatus(pct);
  if (status === "red") return "bg-[#fee2e2] text-[#991b1b] font-bold";
  if (status === "yellow") return "bg-[#fef3c7] text-[#92400e] font-bold";
  return "bg-[#d1fae5] text-[#065f46] font-semibold";
};

export const NEED_WIP_LABEL = "Need WIP";

export const toLotItem = (card: ApiCard): LotItem => {
  const { prdName, lotNo, moved: _moved, ...rest } = card;
  void _moved;
  return {
    ...rest,
    label: lotNo?.trim() || NEED_WIP_LABEL,
    product: prdName,
    savedDate: card.plannedDate,
  };
};

export const matchesCategory = (lot: LotItem, category: ProcessCategory) =>
  category === "ALL" || lot.processGroup === category;

export const isMoved = (lot: LotItem) => lot.plannedDate !== lot.baseDate;

/** Reset every allocation to its source arrival while retaining the last saved date for comparison. */
export const requiredLots = (cards: ApiCard[]): LotItem[] => cards.map((card) => ({
  ...toLotItem(card), plannedDate: card.baseDate,
}));

const siblingKey = (workKey: string, gate: string) => `${workKey}|${gate}`;

const routeKey = (row: GateArrivalRow, gate: string) => JSON.stringify([row.prd_name, row.lot_no?.trim(), row.due_date, row.status, row.pri, gate]);

/** Index each allocation's planned arrival and completion, including sibling gates. */
export const plannedDateIndex = (lots: LotItem[], data?: LevelingData) => {
  const index = new Map<string, string>();
  for (const lot of lots) {
    const end = data ? occupancyWindow(data, lot)?.endDate : null;
    for (const row of lot.allocations || []) {
      index.set(routeKey(row, lot.gate), lot.plannedDate);
      if (end) index.set(`${routeKey(row, lot.gate)}|end`, end);
    }
  }
  return index;
};

export const adjacentGateDates = (lot: LotItem, planned?: Map<string, string>) => {
  const previous = (lot.allocations || []).map((row) => row.prev_gate ? planned?.get(`${routeKey(row, row.prev_gate)}|end`) ?? row.prev_must_out : null).filter((date): date is string => Boolean(date)).sort();
  const next = (lot.allocations || []).map((row) => row.next_gate ? planned?.get(routeKey(row, row.next_gate)) ?? row.next_arrive_by : null).filter((date): date is string => Boolean(date)).sort();
  return { previous: previous[previous.length - 1] ?? lot.prevDate, next: next[0] ?? lot.nextDate };
};

/** Arrival moves must leave time to complete this gate before the next gate starts. */
export const moveWarning = (
  lot: LotItem,
  date: string,
  planned?: Map<string, string>,
  data?: LevelingData
): MoveWarning => {
  const end = data ? occupancyWindow(data, lot, date)?.endDate : date;
  let late = Boolean(end && lot.mustOut && end > lot.mustOut);
  for (const row of lot.allocations || []) {
    const next = row.next_gate ? planned?.get(routeKey(row, row.next_gate)) ?? row.next_arrive_by : null;
    const previous = row.prev_gate ? planned?.get(`${routeKey(row, row.prev_gate)}|end`) ?? row.prev_must_out : null;
    if (next && end && end > next) return "order";
    if (previous && date < previous) return "order";
    if (row.must_out && end && end > row.must_out) late = true;
  }
  if (late) return "late";
  return date < lot.baseDate ? "early" : "none";
};

export const WARNING_TEXT: Record<Exclude<MoveWarning, "none">, string> = {
  early: "Before the source arrival: confirm upstream availability",
  late: "Projected completion is after must-out",
  order: "Arrival or completion overlaps an adjacent gate",
};

const emptyCell = (capacity: LevelingData["capacity"][string][string] | undefined): GateCell => ({
  loadMin: 0,
  capacityMin: capacity ? capacity.capacityMin : null,
  pct: 0,
  configured: Boolean(capacity) && capacity!.capacityMin !== null,
  off: !capacity || capacity.off,
  hasOt: Boolean(capacity?.hasOt),
  lotCount: 0,
  needCount: 0,
  unidentifiedCount: 0,
  totalPcs: 0,
  totalSheets: 0,
  missingPlanning: 0,
  shiftLoadMin: { day: 0, night: 0 },
});

const calendarCache = new WeakMap<LevelingData, { working: string[]; all: string[] }>();

const planningDates = (data: LevelingData) => {
  let cache = calendarCache.get(data);
  if (!cache) {
    cache = {
      working: data.calendarDays.filter((day) => day.isWorking).map((day) => day.date),
      all: data.calendarDays.map((day) => day.date),
    };
    calendarCache.set(data, cache);
  }
  return cache;
};

const upperBound = (dates: string[], value: string) => {
  let low = 0;
  let high = dates.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (dates[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return low;
};

/** Summary Gate completion is leadDays working days after arrival; same-day handoff is valid. */
export const occupancyWindow = (data: LevelingData, lot: LotItem, arrival = lot.plannedDate) => {
  if (!lot.leadDays || lot.leadDays < 1 || !Number.isInteger(lot.leadDays)) return null;
  const calendar = planningDates(data);
  const first = upperBound(calendar.all, arrival) - 1;
  if (first < 0 || calendar.all[first] !== arrival) return null;
  const following = upperBound(calendar.working, arrival);
  const endDate = calendar.working[following + lot.leadDays - 1];
  if (!endDate) return null;
  const last = upperBound(calendar.all, endDate);
  return { startDate: arrival, endDate, get dates() { return calendar.all.slice(first, last); } };
};

/** Planned dates are arrival dates in the arrival-plan version. */
export const plannedArrivalDate = (
  arrival: string | null | undefined,
  lot?: Pick<LotItem, "plannedDate" | "baseDate">,
  useBaseDates = false
): string | null => {
  if (!arrival || !/^\d{4}-\d{2}-\d{2}$/.test(arrival) || !dayjs(arrival).isValid() || dayjs(arrival).format("YYYY-MM-DD") !== arrival) return null;
  const date = !useBaseDates && lot ? lot.plannedDate : arrival;
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) && dayjs(date).isValid() && dayjs(date).format("YYYY-MM-DD") === date ? date : null;
};

export const lotKind = (lot: LotItem) => lot.kind ?? (lot.gateState === "need_wip" || lot.label.trim().toUpperCase() === "NEED WIP" ? "need" : "lot");
export const boardCounts = (lots: LotItem[]) => ({
  lots: lots.filter((lot) => lotKind(lot) === "lot").length,
  need: lots.filter((lot) => lotKind(lot) === "need").length,
  unidentified: lots.filter((lot) => lotKind(lot) === "unidentified").length,
});
export const boardCountLabel = (lots: LotItem[]) => {
  const counts = boardCounts(lots);
  return `${counts.lots} lots / ${counts.need} need${counts.unidentified ? ` / ${counts.unidentified} no ID` : ""}`;
};
export const expandBoardLots = (allLots: LotItem[], selected: LotItem[]) => {
  const ids = new Set(selected.flatMap((lot) => lot.sourceIds || [lot.id]));
  return allLots.filter((lot) => ids.has(lot.id));
};

type BoardPriority = readonly [number, number, number | null, number | null];

const boardPriority = (row: GateArrivalRow): BoardPriority => {
  const process = row.proc_disp?.trim().toUpperCase();
  const gate = row.current_gate?.trim().toUpperCase();
  const stateRank = row.gate_state === "in_gate" ? 0 : row.gate_state === "coming" ? 1 : row.gate_state === "need_wip" ? 2 : 3;
  const remaining = row.rem_proc_in_gate;
  // WIP already in this gate always comes before coming / Need WIP work.
  return [
    stateRank,
    process && gate && process === gate ? 0 : 1,
    typeof remaining === "number" && Number.isInteger(remaining) && remaining >= 0 ? -remaining : null,
    Number.isInteger(row.pri) && row.pri >= 0 ? row.pri : null,
  ];
};

const compareNullableNumber = (a: number | null, b: number | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;

const compareBoardPriority = (a: BoardPriority, b: BoardPriority) =>
  a[0] - b[0] || a[1] - b[1] || compareNullableNumber(a[2], b[2]) || compareNullableNumber(a[3], b[3]);

/** One visible card per physical lot/gate/planned arrival; retain every allocation. */
export const buildBoardLots = (data: LevelingData, lots: LotItem[], category: ProcessCategory = "ALL"): LotItem[] => {
  const sources = new Map(lots.map((lot) => [siblingKey(lot.workKey, lot.gate), lot]));
  const buckets = new Map<string, { rows: GateArrivalRow[]; members: Map<string, LotItem>; date: string }>();
  for (const row of data.arrivalRows) {
    if (row.gate_state === "passed" || (category !== "ALL" && row.process_group !== category)) continue;
    const source = sources.get(siblingKey(row.workKey, row.gate_name));
    const date = plannedArrivalDate(row.arrive_by, source);
    if (!date || !source) continue;
    const kind = isGateNeedWip(row) ? "need" : row.lot_no?.trim() ? "lot" : "unidentified";
    const key = JSON.stringify([row.gate_name, date, kind, kind === "lot" ? row.lot_no!.trim() : row.workKey]);
    const bucket = buckets.get(key) || { rows: [] as GateArrivalRow[], members: new Map<string, LotItem>(), date };
    bucket.rows.push(row);
    bucket.members.set(source.id, source);
    buckets.set(key, bucket);
  }
  return [...buckets].map(([id, { rows, members, date }]) => {
    const sources = [...members.values()];
    const representative = sources.find(isMoved) || sources[0];
    const summary = summarizeGateQuantities(rows);
    const deadlines = rows.map((row) => row.must_out).filter(Boolean).sort();
    const durations = sources.map((lot) => lot.leadDays);
    // Keep one allocation's entire priority; never mix fields or sum duplicate remaining counts.
    const priority = rows.map(boardPriority).reduce((best, next) => compareBoardPriority(next, best) < 0 ? next : best);
    const lot: LotItem = {
      ...representative, id, plannedDate: date, product: new Set(rows.map((row) => row.prd_name)).size > 1 ? "Multiple products" : representative.product, qty: summary.total.piece, sheets: summary.total.sheet,
      kind: summary.total.lot ? "lot" : summary.needCount ? "need" : "unidentified",
      loadMin: summary.total.lot ? representative.loadMin : 0,
      sourceIds: sources.map((lot) => lot.id), allocations: rows,
      moveHistory: mergeMoveHistory(...sources.map((lot) => lot.moveHistory)),
      isHold: sources.some((lot) => lot.isHold), sourceChanged: sources.some((lot) => lot.sourceChanged),
      mustOut: deadlines[0] || "", leadDays: durations.every((value) => value && value > 0) ? Math.max(...durations as number[]) : null,
    };
    return { lot, priority };
  }).sort((a, b) => a.lot.plannedDate.localeCompare(b.lot.plannedDate)
    || compareBoardPriority(a.priority, b.priority)
    || Number(lotKind(a.lot) !== "lot") - Number(lotKind(b.lot) !== "lot")
    || a.lot.label.localeCompare(b.lot.label)
    || a.lot.id.localeCompare(b.lot.id))
    .map(({ lot }) => lot);
};

/** Same arrival buckets and physical-lot counting helper as Summary Gate. */
export const buildGrid = (
  data: LevelingData,
  lots: LotItem[],
  useBaseDates = false,
  category: ProcessCategory = "ALL"
): DayGateLoad[] => {
  const grid: DayGateLoad[] = data.days.map((day) => {
    const gates: DayGateLoad["gates"] = {};
    for (const { gate } of data.gates) gates[gate] = emptyCell(data.capacity[gate]?.[day.date]);
    const d = dayjs(day.date);
    return {
      date: day.date,
      dayLabel: d.format("ddd"),
      displayDate: d.format("DD/MM"),
      isToday: day.date === data.today,
      isOff: Object.values(gates).every((cell) => cell.off),
      gates,
      gateStatusDots: {},
    };
  });
  const byDate = new Map(grid.map((day) => [day.date, day]));

  const cards = new Map(lots.map((lot) => [siblingKey(lot.workKey, lot.gate), lot]));
  const buckets = new Map<GateCell, GateArrivalRow[]>();
  for (const row of data.arrivalRows) {
    if (row.gate_state === "passed" || (category !== "ALL" && row.process_group !== category)) continue;
    const date = plannedArrivalDate(row.arrive_by, cards.get(siblingKey(row.workKey, row.gate_name)), useBaseDates);
    const cell = date ? byDate.get(date)?.gates[row.gate_name] : undefined;
    if (!cell) continue;
    const rows = buckets.get(cell) ?? [];
    rows.push(row);
    buckets.set(cell, rows);
  }
  const standardByGate = new Map(data.gates.map((gate) => [gate.gate, gate.standardShiftMin]));
  for (const [cell, rows] of buckets) {
    const summary = summarizeGateQuantities(rows);
    cell.lotCount = summary.total.lot;
    cell.needCount = summary.needCount;
    cell.unidentifiedCount = summary.unidentifiedCount;
    cell.totalPcs = summary.total.piece;
    cell.totalSheets = summary.total.sheet;
    const standard = standardByGate.get(rows[0].gate_name);
    if (!standard || !Number.isFinite(standard.day) || !Number.isFinite(standard.night) ||
      standard.day < 0 || standard.night < 0 || standard.day + standard.night <= 0) {
      cell.missingPlanning = cell.lotCount;
    } else {
      cell.shiftLoadMin = { day: cell.lotCount * standard.day, night: cell.lotCount * standard.night };
      cell.loadMin = cell.shiftLoadMin.day + cell.shiftLoadMin.night;
    }
  }

  for (const day of grid) {
    for (const [gate, cell] of Object.entries(day.gates)) {
      if (cell.configured && cell.capacityMin! > 0) {
        cell.pct = Math.round((cell.loadMin / cell.capacityMin!) * 100);
      }
      day.gateStatusDots[gate] = cell.off ? "off" : !cell.configured || cell.missingPlanning > 0 ? "unset"
        : cell.capacityMin === 0 && cell.loadMin > 0 ? "red" : loadStatus(cell.pct);
    }
  }
  return grid;
};

/** Load % of a cell, or null when it is off or MC is not configured. */
export const cellPct = (cell: GateCell | undefined, preview = false): number | null => {
  if (!cell || cell.off || !cell.configured || cell.capacityMin === 0 || cell.missingPlanning > 0) return null;
  return preview && cell.previewPct !== undefined ? cell.previewPct : cell.pct;
};

/** Marks the cells whose % would change if the given cards moved to the target date. */
export const computeMovePreview = (
  data: LevelingData,
  currentGrid: DayGateLoad[],
  allLots: LotItem[],
  movingLots: LotItem[],
  targetDate: string,
  category: ProcessCategory = "ALL"
) => {
  const movingIds = new Set(movingLots.flatMap((lot) => lot.sourceIds || [lot.id]));
  const projected = buildGrid(
    data,
    allLots.map((lot) => (movingIds.has(lot.id) ? { ...lot, plannedDate: targetDate } : lot)),
    false,
    category
  );
  const projectedByDate = new Map(projected.map((day) => [day.date, day]));
  const previewGrid = currentGrid.map((day) => ({
    ...day,
    gates: Object.fromEntries(
      Object.entries(day.gates).map(([gate, cell]) => {
        const next = projectedByDate.get(day.date)?.gates[gate] ?? cell;
        return [gate, { ...next, pct: cell.pct, previewPct: next.pct !== cell.pct ? next.pct : undefined }];
      })
    ),
  }));

  // Show changed arrival dates, which can differ from the target release date.
  const gate = movingLots[0]?.gate;
  const dates = currentGrid.filter((day) => {
    const before = day.gates[gate];
    const after = projectedByDate.get(day.date)?.gates[gate];
    return before && after && (before.loadMin !== after.loadMin || before.lotCount !== after.lotCount ||
      before.needCount !== after.needCount || before.totalPcs !== after.totalPcs || before.totalSheets !== after.totalSheets);
  }).map((day) => day.date);
  const impactRows = gate
    ? dates.flatMap((date) => {
        const before = currentGrid.find((day) => day.date === date)?.gates[gate];
        const after = projectedByDate.get(date)?.gates[gate];
        if (!before || !after) return [];
        return [{
          gate,
          date,
          isTarget: date === targetDate,
          beforePct: cellPct(before),
          afterPct: cellPct(after),
          capacityMin: after.capacityMin,
          hasOt: after.hasOt,
        }];
      })
    : [];
  return { previewGrid, impactRows };
};

export const calculateKpis = (
  grid: DayGateLoad[],
  requiredGrid: DayGateLoad[],
  lots: LotItem[],
  data?: LevelingData
): LevelingKpiData => {
  const overloaded = (data: DayGateLoad[]) =>
    data.flatMap((day) =>
      Object.entries(day.gates)
        .filter(([, cell]) => cell.configured && (cell.pct > 100 || (cell.capacityMin === 0 && cell.loadMin > 0)))
        .map(([gate]) => `${gate} · ${day.displayDate}`)
    );
  const red = overloaded(grid);
  const planned = plannedDateIndex(lots, data);
  const warnings = lots.map((lot) => moveWarning(lot, lot.plannedDate, planned, data));
  const late = lots.filter((_, index) => warnings[index] === "late" || warnings[index] === "order");
  const moved = lots.filter(isMoved);
  const unset = new Set<string>();
  for (const day of grid) {
    for (const [gate, cell] of Object.entries(day.gates)) {
      if (!cell.off && !cell.configured) unset.add(gate);
    }
  }
  return {
    overloadCells: red.length,
    overloadCellsRequired: overloaded(requiredGrid).length,
    overloadDetail: red.length ? red.slice(0, 6).join(", ") : "No gate-day above 100%",
    lateCards: late.length,
    movedLateCards: late.filter(isMoved).length,
    orderCards: warnings.filter((warning) => warning === "order").length,
    lateDetail: late.length
      ? `${late[0].label} · ${late[0].product} @ ${late[0].gate}`
      : "Projected completions are on or before must-out",
    movedCount: moved.length,
    totalCount: lots.length,
    movedEarlier: moved.filter((lot) => lot.plannedDate < lot.baseDate).length,
    movedLater: moved.filter((lot) => lot.plannedDate > lot.baseDate).length,
    missingPlanningCards: lots.filter((lot) => isMoved(lot) && (!data || lot.plannedDate >= data.today) && (lot.loadMin === null || (data && !occupancyWindow(data, lot)))).length,
    unsetCapacityGates: [...unset],
  };
};

/** Minutes one machine can run in the shift: regular - enabled breaks (+ OT when open). */
export const shiftMinutesPerMachine = (cfg: ShiftConfig, otOn = cfg.otEnabled) => {
  const breaks =
    (cfg.break1 ? cfg.break1Min : 0) +
    (cfg.break2 ? cfg.break2Min : 0) +
    (cfg.lunch ? cfg.lunchMin : 0);
  return Math.max(0, cfg.minPerShift - breaks + (otOn ? cfg.otMinutes : 0));
};

/** Shift capacity in minutes; null while MC is not entered, 0 when the shift is off. */
export const shiftCapacityMin = (cfg: ShiftConfig, otOn = cfg.otEnabled): number | null => {
  if (!cfg.enabled) return 0;
  if (cfg.mcLines === null) return null;
  return Math.round(cfg.mcLines * cfg.efficiency * shiftMinutesPerMachine(cfg, otOn) * 100) / 100;
};

export const formatMinutes = (value: number | null) =>
  value === null ? "Set MC" : `${Math.round(value).toLocaleString()} min`;
