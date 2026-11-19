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
  let inGatePcs: number | null = 0;
  let inGateSheets: number | null = 0;
  let inGateLots: number | null = 0;
  let comingPcs: number | null = 0;
  let comingSheets: number | null = 0;
  let comingLots: number | null = 0;
  let needWipPcs: number | null = 0;
  let needWipSheets: number | null = 0;
  let overloadGates = 0;
  let incompleteGates = 0;
  const visibleGates = [...new Set(gates.map(({ gate }) => gate))];
  let off = visibleGates.length > 0;

  for (const gate of visibleGates) {
    const cell = day.gates[gate];
    if (!cell) {
      loadMin = capacityMin = totalPcs = totalSheets = lotCount = needCount = unidentifiedCount = null;
      inGatePcs = inGateSheets = inGateLots = comingPcs = comingSheets = comingLots = needWipPcs = needWipSheets = null;
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
    inGatePcs = add(inGatePcs, cell.quantities?.in_gate.piece ?? 0);
    inGateSheets = add(inGateSheets, cell.quantities?.in_gate.sheet ?? 0);
    inGateLots = add(inGateLots, cell.quantities?.in_gate.lot ?? 0);
    comingPcs = add(comingPcs, cell.quantities?.coming.piece ?? 0);
    comingSheets = add(comingSheets, cell.quantities?.coming.sheet ?? 0);
    comingLots = add(comingLots, cell.quantities?.coming.lot ?? 0);
    needWipPcs = add(needWipPcs, cell.quantities?.need_wip.piece ?? 0);
    needWipSheets = add(needWipSheets, cell.quantities?.need_wip.sheet ?? 0);
    if (loadKnown && cell.loadMin > 0 && capacityKnown && (cell.off || cell.loadMin > cell.capacityMin!)) overloadGates++;
  }

  const ratio = loadMin !== null && capacityMin !== null && capacityMin > 0 ? loadMin / capacityMin * 100 : null;
  return {
    loadMin, capacityMin, totalPcs, totalSheets, lotCount, needCount, unidentifiedCount,
    inGatePcs, inGateSheets, inGateLots, comingPcs, comingSheets, comingLots, needWipPcs, needWipSheets,
    pct: ratio !== null && Number.isFinite(ratio) ? Math.round(ratio) : null,
    overloadGates, incompleteGates, off,
  };
};
