import type { DayGateLoad, GateInfo } from "../types";

const validNumber = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const add = (total: number | null, value: number | null | undefined): number | null => {
  if (total === null || !validNumber(value)) return null;
  const next = total + value;
  return Number.isFinite(next) ? next : null;
};

/** Sum gate workloads, not unique factory output. Keep unknown values unknown. */
export const dailyGateTotals = (day: DayGateLoad, gates: Pick<GateInfo, "gate">[]) => {
  let loadMin: number | null = 0;
  let capacityMin: number | null = 0;
  let totalPcs: number | null = 0;
  let totalSheets: number | null = 0;
  let lotCount: number | null = 0;
  let needCount: number | null = 0;
  let unidentifiedCount: number | null = 0;
  let overloadGates = 0;
  let incompleteGates = 0;
  const visibleGates = [...new Set(gates.map(({ gate }) => gate))];
  let off = visibleGates.length > 0;

  for (const gate of visibleGates) {
    const cell = day.gates[gate];
    if (!cell) {
      loadMin = capacityMin = totalPcs = totalSheets = lotCount = needCount = unidentifiedCount = null;
      incompleteGates++;
      off = false;
      continue;
    }
    off = off && cell.off;
    const loadKnown = validNumber(cell.loadMin) && cell.missingPlanning === 0;
    const capacityKnown = cell.off || (cell.configured && validNumber(cell.capacityMin));
    if (!loadKnown || !capacityKnown) incompleteGates++;
    loadMin = add(loadMin, loadKnown ? cell.loadMin : null);
    capacityMin = add(capacityMin, cell.off ? 0 : capacityKnown ? cell.capacityMin : null);
    totalPcs = add(totalPcs, cell.totalPcs);
    totalSheets = add(totalSheets, cell.totalSheets);
    lotCount = add(lotCount, cell.lotCount);
    needCount = add(needCount, cell.needCount);
    unidentifiedCount = add(unidentifiedCount, cell.unidentifiedCount);
    if (loadKnown && cell.loadMin > 0 && capacityKnown && (cell.off || cell.loadMin > cell.capacityMin!)) overloadGates++;
  }

  const ratio = loadMin !== null && capacityMin !== null && capacityMin > 0 ? loadMin / capacityMin * 100 : null;
  return {
    loadMin, capacityMin, totalPcs, totalSheets, lotCount, needCount, unidentifiedCount,
    pct: ratio !== null && Number.isFinite(ratio) ? Math.round(ratio) : null,
    overloadGates, incompleteGates, off,
  };
};
