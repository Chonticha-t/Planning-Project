import type { InGateLot, LotBaseStatus, OrderBy, OrderDiff } from "./types";

export const ORDER_BY_OPTIONS: { value: OrderBy; label: string }[] = [
  { value: "plan", label: "Plan order (planning)" },
  { value: "mustOut", label: "Must out date" },
  { value: "lot", label: "Lot no" },
  { value: "qty", label: "Qty (high → low)" },
];

/** Lots in order; any lot whose cumulative minutes exceed capacity does not fit today. */
export const splitByCapacity = (lots: InGateLot[], capacityMin: number) => {
  const fit: InGateLot[] = [];
  const over: InGateLot[] = [];
  let cum = 0;
  lots.forEach((l) => {
    cum += l.minutes;
    (cum <= capacityMin ? fit : over).push(l);
  });
  return { fit, over };
};

export const sumMinutes = (lots: InGateLot[]) =>
  lots.reduce((s, l) => s + l.minutes, 0);

export const moveItem = <T,>(arr: T[], from: number, to: number): T[] => {
  if (from === to || from < 0) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
};

/** Apply a saved id order to a fresh list (new lots go to the end, removed lots drop out). */
export const applySavedOrder = (lots: InGateLot[], ids: string[] | undefined) => {
  if (!ids) return lots;
  const byId = new Map(lots.map((l) => [l.id, l]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as InGateLot[];
  const seen = new Set(ids);
  return [...ordered, ...lots.filter((l) => !seen.has(l.id))];
};

export const statusLabel = (status: LotBaseStatus, lot: InGateLot, isOver: boolean) => {
  if (isOver) return "Next day / OT";
  switch (status) {
    case "top":
      return "Due moved earlier";
    case "carried":
      return "Carried over";
    case "running":
      return "Running";
    case "waiting":
      return "Waiting";
    case "hold":
      return "HOLD";
    case "arriving":
      return `Arriving ~${lot.arrivingAt ?? "-"}`;
  }
};

/** Lot ids the planner moved on purpose, from the draft change log ("moved XXXXX-016 to #1") */
export const movedLotIds = (changes: string[] | undefined) =>
  (changes ?? [])
    .map((c) => /^moved (\S+) to/.exec(c)?.[1])
    .filter((id): id is string => Boolean(id));

/** Compare the saved order with a new order for the given deliberately-moved lots */
export const diffOrder = (
  before: InGateLot[],
  after: InGateLot[],
  movedIds: string[],
  capacityMin: number
): OrderDiff => {
  const beforePos = new Map(before.map((l, i) => [l.id, i + 1]));
  const afterPos = new Map(after.map((l, i) => [l.id, i + 1]));
  const byId = new Map(after.map((l) => [l.id, l]));
  const moves = movedIds
    .map((id) => ({
      lotId: id,
      product: byId.get(id)?.product ?? "",
      from: beforePos.get(id) ?? 0,
      to: afterPos.get(id) ?? 0,
    }))
    .filter((m) => m.from && m.to && m.from !== m.to);
  const overBefore = new Set(splitByCapacity(before, capacityMin).over.map((l) => l.id));
  const overAfter = new Set(splitByCapacity(after, capacityMin).over.map((l) => l.id));
  return {
    moves,
    pushedOut: after.filter((l) => !overBefore.has(l.id) && overAfter.has(l.id)).map((l) => l.id),
    nowFit: after.filter((l) => overBefore.has(l.id) && !overAfter.has(l.id)).map((l) => l.id),
  };
};
