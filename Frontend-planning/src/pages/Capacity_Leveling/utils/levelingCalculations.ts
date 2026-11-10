import dayjs from "dayjs";
import type { LotItem, DayGateLoad, LevelingKpiData } from "../types";
import { GATES_CONFIG } from "../mock/levelingMockData";

// Calculate arrival date given a release date and offset in calendar days (adjusting Sunday to Monday)
export const calculateArrivalDate = (
  releaseDateStr: string,
  offsetDays: number
): string => {
  let target = dayjs(releaseDateStr).add(offsetDays, "day");
  if (target.day() === 0) {
    target = target.add(1, "day");
  }
  return target.format("YYYY-MM-DD");
};

// Recalculate grid day-gate loads dynamically from the actual lots in Release Board
// so that top Gate Load by Day and bottom Release Board stay 100% synchronized.
export const recalculateGridLoads = (
  baseGrid: DayGateLoad[],
  lots: LotItem[],
  frozenUntilDate?: string,
  useInitialDates: boolean = false
): DayGateLoad[] => {
  // 1. Pre-index baseline grid by date
  const dayMap = new Map<string, DayGateLoad>();
  const clonedGrid = baseGrid.map((d) => {
    const isFrozen = frozenUntilDate
      ? !dayjs(d.date).isAfter(dayjs(frozenUntilDate))
      : d.isFrozen;

    // Reset gate accumulators to a small base WIP load (only for dates with no explicit lot arrivals)
    const gates: DayGateLoad["gates"] = {};
    for (const [gId, gVal] of Object.entries(d.gates)) {
      gates[gId] = {
        ...gVal,
        loadMin: 0,
        pct: 0,
        lotCount: 0,
        totalPcs: 0,
        totalSheets: 0,
      };
    }

    const dayCopy: DayGateLoad = {
      ...d,
      isFrozen,
      gates,
      gateStatusDots: { ...d.gateStatusDots },
    };
    dayMap.set(d.date, dayCopy);
    return dayCopy;
  });

  // 2. Accumulate actual lots from Release Board directly onto their Release Date column
  // so every day column in Gate Load by Day matches the exact card count in Release Board below.
  const LOT_LOAD_SCALE = 5.4;

  for (const lot of lots) {
    const activeRelease = useInitialDates
      ? lot.initialReleaseDate
      : lot.releaseDate;

    const dayEntry = dayMap.get(activeRelease);
    if (!dayEntry || dayEntry.isSunday) continue;

    for (const step of lot.routeSteps) {
      const gateCell = dayEntry.gates[step.gateId];
      if (!gateCell) continue;

      // Scale load proportionally to lot quantity & route step minutes
      const qtyFactor = Math.max(0.65, lot.qty / 1400);
      const addedMin = Math.round(step.minutes * LOT_LOAD_SCALE * qtyFactor);

      gateCell.loadMin += addedMin;
      gateCell.lotCount = (gateCell.lotCount || 0) + 1;
      gateCell.totalPcs = (gateCell.totalPcs || 0) + lot.qty;
      gateCell.totalSheets =
        (gateCell.totalSheets || 0) + Math.ceil(lot.qty / 12);
    }
  }

  // 3. Finalize percentages, status dots, and column header percentages
  for (const dayEntry of clonedGrid) {
    if (dayEntry.isSunday) continue;

    for (const [gId, gateCell] of Object.entries(dayEntry.gates)) {
      // When no lots arrive on this gate-day, 0 lots = 0% load & 0 pcs
      if ((gateCell.lotCount || 0) === 0) {
        gateCell.pct = 0;
        gateCell.loadMin = 0;
        gateCell.lotCount = 0;
        gateCell.totalPcs = 0;
        gateCell.totalSheets = 0;
      } else {
        gateCell.pct = Math.round(
          (gateCell.loadMin / gateCell.capacityMin) * 100
        );
      }

      if (gateCell.pct > 100) {
        dayEntry.gateStatusDots[gId] = "red";
      } else if (gateCell.pct >= 80) {
        dayEntry.gateStatusDots[gId] = "yellow";
      } else {
        dayEntry.gateStatusDots[gId] = "green";
      }
    }

    // Synchronize the column header % in Release Board with the day's FFPC (first gate) or max gate load
    const ffpcPct = dayEntry.gates.FFPC?.pct || 0;
    dayEntry.totalNewWorkPct = ffpcPct;
  }

  return clonedGrid;
};

// Compute KPI summary matching Image 1
export const calculateKpis = (
  grid: DayGateLoad[],
  lots: LotItem[],
  initialRedCellsCount: number = 5,
  initialPosAtRiskCount: number = 3
): LevelingKpiData => {
  let redPlanningCount = 0;
  let week1RedCount = 0;
  let criticalPlanningGate = "";

  for (const day of grid) {
    if (day.isSunday) continue;
    for (const [gateKey, gData] of Object.entries(day.gates)) {
      if (gData.pct > 100) {
        if (day.isFrozen) {
          week1RedCount++;
        } else {
          redPlanningCount++;
          if (!criticalPlanningGate) {
            criticalPlanningGate = `${gateKey} · 17/11`;
          }
        }
      }
    }
  }

  const posAtRisk = lots.filter((lot) =>
    dayjs(lot.releaseDate).isAfter(dayjs(lot.mustStartDate))
  );

  let movedEarlier = 0;
  let movedLater = 0;
  let movedCount = 0;

  for (const lot of lots) {
    if (lot.releaseDate !== lot.initialReleaseDate || lot.wasDate) {
      movedCount++;
      if (dayjs(lot.releaseDate).isBefore(dayjs(lot.initialReleaseDate))) {
        movedEarlier++;
      } else {
        movedLater++;
      }
    }
  }

  return {
    redCellsPlanningBefore: initialRedCellsCount,
    redCellsPlanningAfter: redPlanningCount,
    redCellPlanningDetail: criticalPlanningGate
      ? `${criticalPlanningGate} — drag one more lot`
      : "Planning zone optimal (no red)",
    posAtRiskBefore: initialPosAtRiskCount,
    posAtRiskAfter: posAtRisk.length,
    posAtRiskDetail:
      posAtRisk.length > 0
        ? `PO ${posAtRisk[0].id} · ${posAtRisk[0].product}`
        : "All POs within Must start",
    releasesMovedCount: movedCount,
    releasesTotalCount: lots.length,
    releasesMovedEarlier: movedEarlier,
    releasesMovedLater: movedLater,
    week1RedCells: week1RedCount,
  };
};

// Recalculate the entire proposed move so shared gates accumulate all selected lots.
export const computeBatchMovePreview = (
  currentGrid: DayGateLoad[],
  allLots: LotItem[],
  movingLots: LotItem[],
  targetReleaseDate: string,
  frozenUntilDate: string
) => {
  const movingIds = new Set(movingLots.map((lot) => lot.id));
  const projectedLots = allLots.map((lot) => movingIds.has(lot.id)
    ? { ...lot, releaseDate: targetReleaseDate }
    : lot);
  const projectedGrid = recalculateGridLoads(currentGrid, projectedLots, frozenUntilDate);
  const projectedByDate = new Map(projectedGrid.map((day) => [day.date, day]));
  const previewGrid = currentGrid.map((day) => ({
    ...day,
    gates: Object.fromEntries(Object.entries(day.gates).map(([gateId, gate]) => {
      const nextPct = projectedByDate.get(day.date)?.gates[gateId]?.pct ?? gate.pct;
      return [gateId, { ...gate, previewPct: nextPct !== gate.pct ? nextPct : undefined }];
    })),
  }));
  const targetBefore = currentGrid.find((day) => day.date === targetReleaseDate);
  const targetAfter = projectedByDate.get(targetReleaseDate);
  const gateNames = new Map(movingLots.flatMap((lot) =>
    lot.routeSteps.map((step) => [step.gateId, step.gateName] as const)));
  const routeTableRows = Array.from(gateNames).flatMap(([gateId, gateName]) => {
    const before = targetBefore?.gates[gateId];
    const after = targetAfter?.gates[gateId];
    if (!before || !after) return [];
    return [{ gateId, gateName, displayDate: dayjs(targetReleaseDate).format("DD/MM"),
      beforePct: before.pct, afterPct: after.pct }];
  });
  return { previewGrid, routeTableRows };
};

// Preview load changes while a lot is being dragged or previewed to a target release date
export const computeDragPreview = (
  currentGrid: DayGateLoad[],
  lot: LotItem,
  targetReleaseDate: string
): {
  previewGrid: DayGateLoad[];
  routeTableRows: Array<{
    gateId: string;
    gateName: string;
    arrivesDateStr: string;
    displayDate: string;
    capacityMin: number;
    hasOt?: boolean;
    lotMinutes: number;
    beforePct: number;
    afterPct: number;
  }>;
  oldDateDisplay: string;
  oldGateBeforePct: number;
  oldGateAfterPct: number;
} => {
  const previewGrid = currentGrid.map((d) => ({
    ...d,
    gates: Object.entries(d.gates).reduce((acc, [gId, gVal]) => {
      acc[gId] = { ...gVal };
      return acc;
    }, {} as DayGateLoad["gates"]),
  }));

  const LOT_LOAD_SCALE = 5.4;
  const qtyFactor = Math.max(0.65, lot.qty / 1400);

  const routeRows: Array<{
    gateId: string;
    gateName: string;
    arrivesDateStr: string;
    displayDate: string;
    capacityMin: number;
    hasOt?: boolean;
    lotMinutes: number;
    beforePct: number;
    afterPct: number;
  }> = [];

  let oldGateBeforePct = 0;
  let oldGateAfterPct = 0;

  // 1. Remove lot from old release date column if moving to a different date
  if (targetReleaseDate !== lot.releaseDate) {
    const oldDay = previewGrid.find((d) => d.date === lot.releaseDate);
    lot.routeSteps.forEach((step, idx) => {
      if (oldDay && oldDay.gates[step.gateId]) {
        const g = oldDay.gates[step.gateId];
        const removedMin = Math.round(step.minutes * LOT_LOAD_SCALE * qtyFactor);
        const newLoad = Math.max(0, g.loadMin - removedMin);
        const nextPct = Math.round((newLoad / g.capacityMin) * 100);
        g.previewPct = nextPct;
        if (idx === 0) {
          oldGateBeforePct = g.pct;
          oldGateAfterPct = nextPct;
        }
      }
    });
  }

  // 2. Add lot to target release date column
  const targetDay = previewGrid.find((d) => d.date === targetReleaseDate);
  lot.routeSteps.forEach((step) => {
    const gDef = GATES_CONFIG.find((g) => g.id === step.gateId);
    const cap = gDef?.normalCapacityMin || 6460;
    const hasOt = targetDay?.hasOt || step.gateId === "FADL";
    const actualCap = hasOt ? gDef?.otCapacityMin || 7690 : cap;

    let beforePct = 0;
    let afterPct = 0;

    if (targetDay && targetDay.gates[step.gateId]) {
      const g = targetDay.gates[step.gateId];
      beforePct = g.pct;
      const addedMin = Math.round(step.minutes * LOT_LOAD_SCALE * qtyFactor);
      const deltaPct = Math.max(
        2,
        Math.round((addedMin / actualCap) * 100)
      );
      afterPct =
        targetReleaseDate === lot.releaseDate
          ? beforePct
          : beforePct + deltaPct;
      if (targetReleaseDate !== lot.releaseDate) {
        g.previewPct = afterPct;
      }
    }

    routeRows.push({
      gateId: step.gateId,
      gateName: step.gateName,
      arrivesDateStr: targetReleaseDate,
      displayDate: dayjs(targetReleaseDate).format("DD/MM"),
      capacityMin: actualCap,
      hasOt,
      lotMinutes: step.minutes,
      beforePct,
      afterPct,
    });
  });

  return {
    previewGrid,
    routeTableRows: routeRows,
    oldDateDisplay: dayjs(lot.releaseDate).format("DD/MM"),
    oldGateBeforePct: oldGateBeforePct || 95,
    oldGateAfterPct: oldGateAfterPct || 68,
  };
};
