import dayjs from "dayjs";
import type {
  ApiCard,
  DayGateLoad,
  GateCell,
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

const siblingKey = (workKey: string, gate: string) => `${workKey}|${gate}`;

/** Planned date of every card, used to compare a card with the same work's next gate. */
export const plannedDateIndex = (lots: LotItem[], data?: LevelingData) => {
  const index = new Map(lots.map((lot) => [siblingKey(lot.workKey, lot.gate), lot.plannedDate]));
  if (data) {
    for (const lot of lots) {
      const start = occupancyWindow(data, lot)?.startDate;
      if (start) index.set(`${siblingKey(lot.workKey, lot.gate)}|start`, start);
    }
  }
  return index;
};

/**
 * A card moves at ONE gate only, so the other gates of the same work stay where they are.
 * Moving later than must-out eats into the next gate's time; reaching the next gate's date
 * makes the gate order impossible.
 */
export const moveWarning = (
  lot: LotItem,
  date: string,
  planned?: Map<string, string>,
  data?: LevelingData
): MoveWarning => {
  const nextDate = lot.nextGate
    ? planned?.get(siblingKey(lot.workKey, lot.nextGate)) ?? lot.nextDate
    : null;
  if (nextDate && date >= nextDate && date > lot.baseDate) return "order";
  const nextStart = lot.nextGate ? planned?.get(`${siblingKey(lot.workKey, lot.nextGate)}|start`) : null;
  if (nextStart && date >= nextStart && date > lot.baseDate) return "order";
  if (date > lot.mustOut) return "late";
  const start = data ? occupancyWindow(data, lot, date)?.startDate : null;
  const previous = lot.prevGate ? planned?.get(siblingKey(lot.workKey, lot.prevGate)) ?? lot.prevDate : lot.arriveBy;
  if (start && previous && start <= previous) return "early";
  if (lot.arriveBy && date < lot.arriveBy) return "early";
  return "none";
};

export const WARNING_TEXT: Record<Exclude<MoveWarning, "none">, string> = {
  early: "Before arrive-by: the previous gate must deliver early",
  late: "After must-out: takes time from the next gate",
  order: "On or after the next gate's date: gate order is impossible",
};

const emptyCell = (capacity: LevelingData["capacity"][string][string] | undefined): GateCell => ({
  loadMin: 0,
  capacityMin: capacity ? capacity.capacityMin : null,
  pct: 0,
  configured: Boolean(capacity) && capacity!.capacityMin !== null,
  off: !capacity || capacity.off,
  hasOt: Boolean(capacity?.hasOt),
  lotCount: 0,
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

/** Release day is included. Preserve the master duration when the release is moved. */
export const occupancyWindow = (data: LevelingData, lot: LotItem, release = lot.plannedDate) => {
  if (!lot.leadDays || lot.loadMin === null) return null;
  const calendar = planningDates(data);
  const dates = calendar.working;
  const end = upperBound(dates, release);
  const endsOnWorkday = dates[end - 1] === release;
  const preceding = lot.leadDays - (endsOnWorkday ? 0 : 1);
  if (end < preceding) return null;
  const startDate = preceding > 0 ? dates[end - preceding] : release;
  // Reservation persists on closed dates inside the window. Opening OT never changes demand.
  const first = upperBound(calendar.all, startDate) - 1;
  const last = upperBound(calendar.all, release);
  if (first < 0 || calendar.all[first] !== startDate || calendar.all[last - 1] !== release) return null;
  return { startDate, endDate: release, get dates() { return calendar.all.slice(first, last); } };
};

/** Gate occupancy includes all process groups sharing its capacity. */
export const buildGrid = (
  data: LevelingData,
  lots: LotItem[],
  useBaseDates = false
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

  const seen = new Set<string>();
  for (const lot of lots) {
    const key = siblingKey(lot.workKey, lot.gate);
    if (seen.has(key)) continue;
    seen.add(key);
    const release = useBaseDates ? lot.baseDate : lot.plannedDate;
    const window = occupancyWindow(data, lot, release);
    const visibleDates = window
      ? grid.filter((day) => day.date >= window.startDate && day.date <= window.endDate).map((day) => day.date)
      : [release];
    for (const date of visibleDates) {
      const cell = byDate.get(date)?.gates[lot.gate];
      if (!cell) continue;
      cell.lotCount += 1;
      cell.totalPcs += lot.qty;
      cell.totalSheets += lot.sheets ?? 0;
      if (!window) cell.missingPlanning += 1;
      else {
        cell.loadMin += lot.loadMin!;
        cell.shiftLoadMin.day += lot.standardShiftMin.day;
        cell.shiftLoadMin.night += lot.standardShiftMin.night;
      }
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
  targetDate: string
) => {
  const movingIds = new Set(movingLots.map((lot) => lot.id));
  const projected = buildGrid(
    data,
    allLots.map((lot) => (movingIds.has(lot.id) ? { ...lot, plannedDate: targetDate } : lot))
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

  // Moving a release shifts the complete occupancy window at this gate only.
  const gate = movingLots[0]?.gate;
  const dates = currentGrid.filter((day) => {
    const before = day.gates[gate];
    const after = projectedByDate.get(day.date)?.gates[gate];
    return before && after && (before.loadMin !== after.loadMin || before.lotCount !== after.lotCount || day.date === targetDate);
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
      : "All cards are on or before must-out",
    movedCount: moved.length,
    totalCount: lots.length,
    movedEarlier: moved.filter((lot) => lot.plannedDate < lot.baseDate).length,
    movedLater: moved.filter((lot) => lot.plannedDate > lot.baseDate).length,
    missingPlanningCards: lots.filter((lot) => lot.loadMin === null || (data && !occupancyWindow(data, lot))).length,
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
