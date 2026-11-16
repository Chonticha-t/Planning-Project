import type { BoardShiftAllocation, LevelingData, LotItem } from "../types";
import { lotKind } from "./levelingCalculations.ts";

// Use hundredths of a minute so exact capacity boundaries do not leave rounding overflow.
const minuteUnits = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const units = Math.round(value * 100);
  return Number.isSafeInteger(units) ? units : null;
};

type Budget = {
  day: number;
  night: number;
  fullDay: number;
  fullNight: number;
  dayClosed: boolean;
  nightClosed: boolean;
  blocked?: string;
};

const overCapacityReason = (demand: number, budget: Budget): string => {
  if (budget.fullDay === 0 && budget.fullNight === 0) {
    return "No shift capacity is open on this date. Open a shift or move the date.";
  }
  if (demand > budget.fullDay && demand > budget.fullNight) {
    return `Lot requires ${demand / 100} min, which exceeds one full shift (Day ${budget.fullDay / 100} min, Night ${budget.fullNight / 100} min). Open OT, add MC, or move the date.`;
  }
  if (demand > budget.fullNight) {
    return `Day has ${budget.day / 100} min left and Night shift capacity (${budget.fullNight / 100} min) cannot hold ${demand / 100} min. Open OT or move the date.`;
  }
  return `Day has ${budget.day / 100} min and Night has ${budget.night / 100} min left; neither fits the whole lot. Open OT or move the date.`;
};

/**
 * Allocate already-prioritized board cards within a single shift (Day -> Night -> Over), without
 * splitting a lot across Day and Night. Once normal-sized work skips Day to Night or overflows Night,
 * earlier shifts close so lower-priority lots never jump backward in the queue. Lots larger than any
 * single full shift overflow on their own without locking remaining shift capacity for normal lots.
 */
export const allocateBoardShifts = (
  data: Pick<LevelingData, "capacity">,
  orderedLots: LotItem[],
  options: { excludePassed?: boolean } = {}
) => {
  const result = new Map<string, BoardShiftAllocation>();
  const budgets = new Map<string, Budget>();
  const physicalLots = new Map<string, BoardShiftAllocation>();
  const record = (lot: LotItem, allocation: BoardShiftAllocation) => {
    result.set(lot.id, allocation);
    for (const id of lot.sourceIds ?? []) result.set(id, allocation);
  };

  for (const lot of orderedLots) {
    if (lotKind(lot) !== "lot" || (options.excludePassed && lot.passedGate)) {
      record(lot, { status: "none", dayMin: 0, nightMin: 0, overflowMin: 0 });
      continue;
    }
    const physicalKey = JSON.stringify([lot.gate, lot.plannedDate, lot.label.trim()]);
    const existing = physicalLots.get(physicalKey);
    if (existing) { record(lot, existing); continue; }

    const key = JSON.stringify([lot.gate, lot.plannedDate]);
    let budget = budgets.get(key);
    if (!budget) {
      const capacity = data.capacity[lot.gate]?.[lot.plannedDate];
      const day = capacity?.shifts?.day;
      const night = capacity?.shifts?.night;
      const dayUnits = capacity?.off ? 0 : day ? minuteUnits(day.open ? day.capacityMin : 0) : null;
      const nightUnits = capacity?.off ? 0 : night ? minuteUnits(night.open ? night.capacityMin : 0) : null;
      budget = {
        day: dayUnits ?? 0,
        night: nightUnits ?? 0,
        fullDay: dayUnits ?? 0,
        fullNight: nightUnits ?? 0,
        dayClosed: false,
        nightClosed: false,
        blocked: dayUnits === null || nightUnits === null ? "Shift capacity is unavailable; check MC settings." : undefined,
      };
      budgets.set(key, budget);
    }

    const demand = minuteUnits(lot.loadMin);
    let allocation: BoardShiftAllocation;
    if (budget.blocked || demand === null || demand === 0) {
      const reason = budget.blocked ?? "Lot workload is unavailable; check normal shift minutes.";
      allocation = { status: "unassigned", dayMin: 0, nightMin: 0, overflowMin: 0, reason };
      // An unknown workload must not leave apparently free capacity for lower-priority work.
      budget.blocked = budget.blocked ?? "A higher-priority lot has no valid workload; shift allocation is pending.";
    } else if (!budget.dayClosed && demand <= budget.day) {
      budget.day -= demand;
      allocation = { status: "day", dayMin: demand / 100, nightMin: 0, overflowMin: 0 };
    } else if (!budget.nightClosed && demand <= budget.night) {
      // Once a lot moves to Night, close Day so smaller lower-priority lots never jump back into Day.
      budget.dayClosed = true;
      budget.night -= demand;
      allocation = { status: "night", dayMin: 0, nightMin: demand / 100, overflowMin: 0 };
    } else {
      // Only lots that could fit a full shift lock that shift; oversized single lots overflow on their own.
      if (demand <= budget.fullDay) budget.dayClosed = true;
      if (demand <= budget.fullNight) budget.nightClosed = true;
      allocation = {
        status: "over",
        dayMin: 0,
        nightMin: 0,
        overflowMin: demand / 100,
        reason: overCapacityReason(demand, budget),
      };
    }
    physicalLots.set(physicalKey, allocation);
    record(lot, allocation);
  }
  return result;
};
