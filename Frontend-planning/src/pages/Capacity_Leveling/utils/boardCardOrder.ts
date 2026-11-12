import type { BoardCardOrderGroup, LotItem } from "../types";

export type BoardCardOrder = ReadonlyMap<string, readonly string[]>;

const groupKey = (lot: LotItem): string => JSON.stringify([lot.gate, lot.plannedDate]);

export const readBoardCardOrder = (groups: BoardCardOrderGroup[] = []): BoardCardOrder =>
  new Map(groups.map((group) => [JSON.stringify([group.gate, group.date]), group.cardIds]));

/** Save current identities only, including cards hidden by the process filter. */
export const serializeBoardCardOrder = (lots: LotItem[], order: BoardCardOrder, today: string): BoardCardOrderGroup[] => {
  const groups = new Map<string, BoardCardOrderGroup>();
  for (const lot of applyBoardCardOrder(lots, order)) {
    const key = groupKey(lot);
    if (!order.has(key) || lot.plannedDate < today) continue;
    const group = groups.get(key) ?? { gate: lot.gate, date: lot.plannedDate, cardIds: [] };
    group.cardIds.push(lot.id);
    groups.set(key, group);
  }
  return [...groups.values()];
};

/** Preserve source priority until a planner explicitly reorders a gate/day. */
export const applyBoardCardOrder = (lots: LotItem[], order: BoardCardOrder): LotItem[] => {
  const groups = new Map<string, LotItem[]>();
  for (const lot of lots) {
    const key = groupKey(lot);
    const group = groups.get(key) ?? [];
    group.push(lot);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    const ids = order.get(key);
    if (!ids) continue;
    const ranks = new Map(ids.map((id, index) => [id, index]));
    group.sort((a, b) => (ranks.get(a.id) ?? ids.length) - (ranks.get(b.id) ?? ids.length));
  }
  const offsets = new Map<string, number>();
  return lots.map((lot) => {
    const key = groupKey(lot);
    const index = offsets.get(key) ?? 0;
    offsets.set(key, index + 1);
    return groups.get(key)![index];
  });
};

/** Move a selection as a stable block, strictly inside its existing gate/day. */
export const reorderBoardCards = (
  lots: LotItem[],
  order: BoardCardOrder,
  movingIds: readonly string[],
  targetId: string,
  position: "before" | "after",
): BoardCardOrder => {
  const target = lots.find((lot) => lot.id === targetId);
  const ids = new Set(movingIds);
  if (!target || ids.size === 0 || ids.has(targetId)) return order;
  const ordered = applyBoardCardOrder(lots, order);
  const moving = ordered.filter((lot) => ids.has(lot.id));
  const key = groupKey(target);
  if (moving.length !== ids.size || moving.some((lot) => groupKey(lot) !== key)) return order;
  const group = ordered.filter((lot) => groupKey(lot) === key);
  const remaining = group.filter((lot) => !ids.has(lot.id));
  const index = remaining.findIndex((lot) => lot.id === targetId) + (position === "after" ? 1 : 0);
  remaining.splice(index, 0, ...moving);
  if (remaining.every((lot, i) => lot.id === group[i].id)) return order;
  const next = new Map(order);
  next.set(key, remaining.map((lot) => lot.id));
  return next;
};
