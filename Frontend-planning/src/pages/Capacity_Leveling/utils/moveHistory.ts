import type { LotItem, MoveHistoryEntry } from "../types";

export const mergeMoveHistory = (...histories: (readonly MoveHistoryEntry[] | undefined)[]): MoveHistoryEntry[] => {
  const entries = new Map<string, MoveHistoryEntry>();
  for (const history of histories) {
    for (const entry of history ?? []) {
      if (!entries.has(entry.id)) entries.set(entry.id, entry);
    }
  }
  return [...entries.values()].sort((a, b) => {
    const first = Date.parse(a.changedAt);
    const second = Date.parse(b.changedAt);
    return Number.isFinite(first) && Number.isFinite(second) ? second - first : 0;
  });
};

/** Attach one visible card's event to every source; merging cards later deduplicates the shared ID. */
export const appendMoveHistory = (lots: LotItem[], events: ReadonlyMap<string, MoveHistoryEntry>): LotItem[] =>
  lots.map((lot) => {
    const event = events.get(lot.id);
    return event ? { ...lot, moveHistory: mergeMoveHistory([event], lot.moveHistory) } : lot;
  });

export const reorderMoveHistory = (
  before: LotItem[],
  after: LotItem[],
  movingIds: readonly string[],
  metadata: Pick<MoveHistoryEntry, "id" | "changedAt" | "changedBy">,
): Map<string, MoveHistoryEntry> => {
  const ranks = (board: LotItem[]) => {
    const counts = new Map<string, number>();
    return new Map(board.map((lot) => {
      const group = JSON.stringify([lot.gate, lot.plannedDate]);
      const position = (counts.get(group) ?? 0) + 1;
      counts.set(group, position);
      return [lot.id, position] as const;
    }));
  };
  const from = ranks(before);
  const to = ranks(after);
  const moving = new Set(movingIds);
  const events = new Map<string, MoveHistoryEntry>();
  for (const lot of before) {
    const fromPosition = from.get(lot.id);
    const toPosition = to.get(lot.id);
    if (!moving.has(lot.id) || !fromPosition || !toPosition || fromPosition === toPosition) continue;
    const entry: MoveHistoryEntry = { ...metadata, id: `${metadata.id}-${lot.id}`, kind: "reorder",
      fromDate: lot.plannedDate, toDate: lot.plannedDate, fromPosition, toPosition,
      note: "Reordered within the same day" };
    for (const id of lot.sourceIds ?? [lot.id]) events.set(id, entry);
  }
  return events;
};
