import type { InGateLot, LotBaseStatus, OrderBy, OrderDiff } from "./types";

export const ORDER_BY_OPTIONS: { value: OrderBy; label: string }[] = [
  { value: "plan", label: "Plan order (planning)" },
  { value: "mustOut", label: "Must out date" },
  { value: "lot", label: "Lot no" },
  { value: "qty", label: "Qty (high → low)" },
];

/** Format minutes after 00:00 into HH:mm (24h clock) */
export const formatEtaClock = (cumMinutes: number): string => {
  const total = ((Math.round(cumMinutes) % 1440) + 1440) % 1440;
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

export const SHIFT_CAPACITY_MIN = 655;
export const DS_BASE_USED_MIN = 608;
export const NS_BASE_USED_MIN = 216;

/** Effective remaining machine minutes a lot consumes in the active Night Shift queue window */
export const effectiveLotMinutes = (lot: InGateLot): number => {
  if (lot.status === "hold" || lot.status === "done") return 0;
  return lot.minutes;
};

/** Lots in order; any active Night Shift lot whose cumulative minutes exceed capacity does not fit before 08:00. */
export const splitByCapacity = (lots: InGateLot[], capacityMin: number) => {
  const fit: InGateLot[] = [];
  const over: InGateLot[] = [];
  let cum = 0;
  lots.forEach((l) => {
    cum += effectiveLotMinutes(l);
    if (l.status === "done" || l.status === "hold") {
      fit.push(l);
    } else {
      (cum <= capacityMin ? fit : over).push(l);
    }
  });
  return { fit, over };
};

/** Compute ETA clock string and cumulative shift capacity usage for each lot in the given order */
export const computeQueueEtas = (lots: InGateLot[], capacityMin: number) => {
  const map = new Map<
    string,
    {
      eta: string;
      sub: string;
      cumMin: number;
      shiftUsedMin: number;
      shiftPct: number;
      isOver: boolean;
    }
  >();

  const hasDoneDs = lots.some(
    (l) => l.shiftSection === "day" && l.status === "done"
  );
  const hasDoneNs = lots.some(
    (l) => l.shiftSection === "night" && l.status === "done"
  );

  let cum = 0; // active remaining N/S minutes after now
  let dsCum = hasDoneDs ? 0 : DS_BASE_USED_MIN;
  let nsCum = hasDoneNs ? 0 : NS_BASE_USED_MIN;

  lots.forEach((lot) => {
    if (lot.shiftSection === "day") {
      dsCum += lot.minutes;
      const shiftPct = Math.round((dsCum / SHIFT_CAPACITY_MIN) * 100);
      if (lot.status === "done") {
        map.set(lot.id, {
          eta: lot.outAt ?? "Done",
          sub: "out · D/S",
          cumMin: 0,
          shiftUsedMin: dsCum,
          shiftPct,
          isOver: false,
        });
      } else {
        map.set(lot.id, {
          eta: "—",
          sub: lot.note ?? "waiting QA",
          cumMin: cum,
          shiftUsedMin: dsCum,
          shiftPct,
          isOver: dsCum > SHIFT_CAPACITY_MIN,
        });
      }
      return;
    }

    if (lot.status === "done") {
      nsCum += lot.minutes;
      const shiftPct = Math.round((nsCum / SHIFT_CAPACITY_MIN) * 100);
      map.set(lot.id, {
        eta: lot.outAt ?? "Done",
        sub: "out · N/S",
        cumMin: 0,
        shiftUsedMin: nsCum,
        shiftPct,
        isOver: false,
      });
      return;
    }

    cum += lot.minutes;
    const shiftUsedMin = nsCum + cum;
    const shiftPct = Math.round((shiftUsedMin / SHIFT_CAPACITY_MIN) * 100);
    const isOver = cum > capacityMin;
    const eta = formatEtaClock(cum);
    const overMin = Math.max(0, cum - capacityMin);
    const overH = Math.ceil(overMin / 60);
    map.set(lot.id, {
      eta,
      sub: isOver ? `after 08:00 (+${overH}h)` : "before 08:00",
      cumMin: cum,
      shiftUsedMin,
      shiftPct,
      isOver,
    });
  });

  return {
    byLotId: map,
    totalActiveMin: cum,
    dsTotalUsedMin: dsCum,
    nsFitUsedMin: Math.min(SHIFT_CAPACITY_MIN, nsCum + Math.min(capacityMin, cum)),
  };
};

export const sumMinutes = (lots: InGateLot[]) =>
  lots.reduce((s, l) => s + effectiveLotMinutes(l), 0);

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
    case "done":
      return "Done";
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

/**
 * Smart auto-arrange:
 * 1. Keep completed (done) lots and currently running lot in place
 * 2. Sort remaining runnable lots by mustOut date, then group same product models back-to-back to save setup
 * 3. Keep D/S hold lots in D/S section
 */
export const autoArrangeLots = (lots: InGateLot[]): { ids: string[]; changes: string[] } => {
  const dayLots = lots.filter((l) => l.shiftSection === "day");
  const nightDone = lots.filter((l) => l.shiftSection !== "day" && l.status === "done");
  const running = lots.filter((l) => l.shiftSection !== "day" && l.status === "running");
  const holds = lots.filter((l) => l.shiftSection !== "day" && l.status === "hold");
  const others = lots.filter(
    (l) =>
      l.shiftSection !== "day" &&
      l.status !== "done" &&
      l.status !== "running" &&
      l.status !== "hold"
  );

  const sortedOthers = others.slice().sort((a, b) => {
    const byDue = a.mustOut.localeCompare(b.mustOut);
    if (byDue !== 0) return byDue;
    const byModel = a.product.localeCompare(b.product);
    if (byModel !== 0) return byModel;
    return a.minutes - b.minutes;
  });

  const insertHoldAt = Math.min(sortedOthers.length, 3);
  const arranged = [
    ...dayLots,
    ...nightDone,
    ...running,
    ...sortedOthers.slice(0, insertHoldAt),
    ...holds,
    ...sortedOthers.slice(insertHoldAt),
  ];

  const oldPos = new Map(lots.map((l, i) => [l.id, i + 1]));
  const changes: string[] = [];
  arranged.forEach((l, idx) => {
    const prev = oldPos.get(l.id) ?? idx + 1;
    if (prev !== idx + 1) {
      changes.push(`moved ${l.id} to #${idx + 1}`);
    }
  });

  return {
    ids: arranged.map((l) => l.id),
    changes,
  };
};
