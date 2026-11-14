import type { BoardShiftAllocation, LevelingData, LotItem } from "../types";
import { lotKind } from "./levelingCalculations.ts";

// Use hundredths of a minute so exact capacity boundaries do not leave rounding overflow.
const minuteUnits = (value: number | null | undefined): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const units = Math.round(value * 100);
  return Number.isSafeInteger(units) ? units : null;
};

type Budget = { day: number; night: number; fullDay: number; fullNight: number; blocked?: string };

/**
 * Allocate already-prioritized board cards. Results include stable source IDs for move previews.
 * A lot is never split when one shift could hold it: it runs wholly in Day, else wholly in Night,
 * else it is over capacity (open OT or move the date). Only a lot larger than a whole shift
 * (e.g. one machine) spans Day and Night.
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
        day: dayUnits ?? 0, night: nightUnits ?? 0, fullDay: dayUnits ?? 0, fullNight: nightUnits ?? 0,
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
    } else if (demand <= budget.day) {
      budget.day -= demand;
      allocation = { status: "day", dayMin: demand / 100, nightMin: 0, overflowMin: 0 };
    } else if (demand <= budget.night) {
      // Day has too little left for the whole lot: move all of it to Night.
      budget.night -= demand;
      allocation = { status: "night", dayMin: 0, nightMin: demand / 100, overflowMin: 0 };
    } else if (demand <= budget.fullDay || demand <= budget.fullNight) {
      // A shift could hold this lot, but neither has enough left. Leftover minutes stay visible.
      allocation = {
        status: "over", dayMin: 0, nightMin: 0, overflowMin: demand / 100,
        reason: `Day has ${budget.day / 100} min and Night has ${budget.night / 100} min left; neither fits the whole lot. Open OT or move the date.`,
      };
    } else {
      // Larger than any whole shift: it has to span Day and Night.
      const day = Math.min(demand, budget.day);
      budget.day -= day;
      const night = Math.min(demand - day, budget.night);
      budget.night -= night;
      const overflow = demand - day - night;
      allocation = {
        status: overflow > 0 ? "over" : day > 0 && night > 0 ? "split" : day > 0 ? "day" : "night",
        dayMin: day / 100, nightMin: night / 100, overflowMin: overflow / 100,
      };
    }
    physicalLots.set(physicalKey, allocation);
    record(lot, allocation);
  }
  return result;
};
