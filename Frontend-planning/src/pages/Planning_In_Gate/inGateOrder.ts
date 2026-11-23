import type { LevelingData, LotItem } from "../Capacity_Leveling/types";
import { applyBoardCardOrder, type BoardCardOrder } from "../Capacity_Leveling/utils/boardCardOrder.ts";
import { allocateBoardShifts } from "../Capacity_Leveling/utils/boardShiftAllocation.ts";
import type { InGateQueueOrder, OrderDiff, OrderMove } from "./types";

export interface DirtyOrderScope {
  key: string;
  gate: string;
  date: string;
  beforeIds: string[];
  afterIds: string[];
  beforeLots: LotItem[];
  afterLots: LotItem[];
}

export interface SaveOrderItemInput {
  cardId: string;
  lotNo: string | null;
  prdName: string | null;
  itemKind: "lot" | "need" | "unidentified";
}

export const orderScopeKey = (gate: string, date: string): string => JSON.stringify([gate, date]);

/**
 * Option A overlay: apply saved Planning In Gate queue orders on top of the
 * Capacity Leveling plan's boardCardOrder per (gate, planned_date).
 */
export function mergeInGateOrders(
  planOrder: BoardCardOrder,
  inGateOrders: readonly InGateQueueOrder[],
): BoardCardOrder {
  if (!inGateOrders.length) return planOrder;
  const merged = new Map<string, readonly string[]>(planOrder);
  for (const order of inGateOrders) {
    if (order.gate && order.date && Array.isArray(order.cardIds) && order.cardIds.length > 0) {
      merged.set(orderScopeKey(order.gate, order.date), order.cardIds);
    }
  }
  return merged;
}

/**
 * Identify every (gate, planned_date) scope whose effective queue order differs from
 * the currently saved order. Round-tripping a card back to its original position
 * produces no dirty scope.
 */
export function findDirtyOrderScopes(
  allLots: readonly LotItem[],
  savedOrder: BoardCardOrder,
  effectiveOrder: BoardCardOrder,
): DirtyOrderScope[] {
  const byScope = new Map<string, { gate: string; date: string; lots: LotItem[] }>();
  for (const lot of allLots) {
    const key = orderScopeKey(lot.gate, lot.plannedDate);
    const entry = byScope.get(key);
    if (entry) entry.lots.push(lot);
    else byScope.set(key, { gate: lot.gate, date: lot.plannedDate, lots: [lot] });
  }

  const dirty: DirtyOrderScope[] = [];
  for (const [key, { gate, date, lots }] of byScope) {
    const beforeLots = applyBoardCardOrder(lots, savedOrder);
    const afterLots = applyBoardCardOrder(lots, effectiveOrder);
    const beforeIds = beforeLots.map((lot) => lot.id);
    const afterIds = afterLots.map((lot) => lot.id);
    if (beforeIds.length === afterIds.length && beforeIds.some((id, index) => id !== afterIds[index])) {
      dirty.push({ key, gate, date, beforeIds, afterIds, beforeLots, afterLots });
    }
  }
  return dirty;
}

/**
 * Compute 1-based queue position moves and shift-capacity overflow transitions
 * (pushedOut / nowFit) for active (not-yet-passed, not-yet-finished) lots in a single gate/day.
 */
export function computeOrderDiff(
  snapshot: Pick<LevelingData, "capacity">,
  beforeLots: readonly LotItem[],
  afterLots: readonly LotItem[],
  excludeIds?: ReadonlySet<string>,
): OrderDiff | null {
  const isActive = (lot: LotItem) => !lot.passedGate && !excludeIds?.has(lot.id);
  const activeBefore = beforeLots.filter(isActive);
  const activeAfter = afterLots.filter(isActive);
  const beforePos = new Map(activeBefore.map((lot, index) => [lot.id, index + 1]));
  const moves: OrderMove[] = [];

  activeAfter.forEach((lot, index) => {
    const from = beforePos.get(lot.id);
    const to = index + 1;
    if (!from || from === to) return;
    moves.push({
      cardId: lot.id,
      lotId: lot.kind === "unidentified" ? "No lot ID" : lot.label,
      product: lot.product,
      itemKind: lot.kind,
      from,
      to,
    });
  });

  if (!moves.length) return null;

  const beforeShifts = allocateBoardShifts(snapshot, [...beforeLots], { excludePassed: true });
  const afterShifts = allocateBoardShifts(snapshot, [...afterLots], { excludePassed: true });
  const pushedOut: string[] = [];
  const nowFit: string[] = [];

  for (const lot of activeAfter) {
    if (lot.kind !== "lot") continue;
    const beforeStatus = beforeShifts.get(lot.id)?.status;
    const afterStatus = afterShifts.get(lot.id)?.status;
    if (!beforeStatus || !afterStatus) continue;
    if (beforeStatus !== "over" && afterStatus === "over") pushedOut.push(lot.label);
    else if (beforeStatus === "over" && afterStatus !== "over") nowFit.push(lot.label);
  }

  return { moves, pushedOut, nowFit };
}

export function buildSaveOrderItems(lots: readonly LotItem[]): SaveOrderItemInput[] {
  return lots.map((lot) => ({
    cardId: lot.id,
    lotNo: lot.kind === "lot" && lot.label.trim() ? lot.label.trim() : null,
    prdName: lot.product.trim() || null,
    itemKind: lot.kind,
  }));
}
