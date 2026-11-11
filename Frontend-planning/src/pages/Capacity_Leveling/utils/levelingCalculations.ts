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
export const plannedDateIndex = (lots: LotItem[]) =>
  new Map(lots.map((lot) => [siblingKey(lot.workKey, lot.gate), lot.plannedDate]));

/**
 * A card moves at ONE gate only, so the other gates of the same work stay where they are.
 * Moving later than must-out eats into the next gate's time; reaching the next gate's date
 * makes the gate order impossible.
 */
export const moveWarning = (
  lot: LotItem,
  date: string,
  planned?: Map<string, string>
): MoveWarning => {
  const nextDate = lot.nextGate
    ? planned?.get(siblingKey(lot.workKey, lot.nextGate)) ?? lot.nextDate
    : null;
  if (nextDate && date >= nextDate && date > lot.baseDate) return "order";
  if (date > lot.mustOut) return "late";
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
  missingUph: 0,
});

/**
 * Gate Load by Day. Load is shared by every process group on the gate, so it is always
 * built from ALL cards, never from the filtered board list.
 */
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

  for (const lot of lots) {
    const cell = byDate.get(useBaseDates ? lot.baseDate : lot.plannedDate)?.gates[lot.gate];
    if (!cell) continue;
    cell.lotCount += 1;
    cell.totalPcs += lot.qty;
    cell.totalSheets += lot.sheets ?? 0;
    // A card without UPH is reported separately; it is never counted as zero load.
    if (lot.loadMin === null) cell.missingUph += 1;
    else cell.loadMin += lot.loadMin;
  }

  for (const day of grid) {
    for (const [gate, cell] of Object.entries(day.gates)) {
      if (cell.configured && cell.capacityMin! > 0) {
        cell.pct = Math.round((cell.loadMin / cell.capacityMin!) * 100);
      }
      day.gateStatusDots[gate] = cell.off ? "off" : !cell.configured ? "unset" : loadStatus(cell.pct);
    }
  }
  return grid;
};

/** Load % of a cell, or null when it is off or MC is not configured. */
export const cellPct = (cell: GateCell | undefined, preview = false): number | null => {
  if (!cell || cell.off || !cell.configured) return null;
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
        const next = projectedByDate.get(day.date)?.gates[gate]?.pct ?? cell.pct;
        return [gate, { ...cell, previewPct: next !== cell.pct ? next : undefined }];
      })
    ),
  }));

  // One gate only: the source date(s) lose the load and the target date gains it.
  const gate = movingLots[0]?.gate;
  const dates = [...new Set([...movingLots.map((lot) => lot.plannedDate), targetDate])].sort();
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
  lots: LotItem[]
): LevelingKpiData => {
  const overloaded = (data: DayGateLoad[]) =>
    data.flatMap((day) =>
      Object.entries(day.gates)
        .filter(([, cell]) => !cell.off && cell.configured && cell.pct > 100)
        .map(([gate]) => `${gate} · ${day.displayDate}`)
    );
  const red = overloaded(grid);
  const planned = plannedDateIndex(lots);
  const warnings = lots.map((lot) => moveWarning(lot, lot.plannedDate, planned));
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
    missingUphCards: lots.filter((lot) => lot.loadMin === null).length,
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
