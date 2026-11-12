const HISTORY_LIMIT = 50;

// Match the board's source priority so the first saved reorder has a real previous position.
const priorityOf = (row) => {
  const process = row.proc_disp?.trim().toUpperCase();
  const gate = row.current_gate?.trim().toUpperCase();
  const state = row.gate_state === "in_gate" ? 0 : row.gate_state === "coming" ? 1 : row.gate_state === "need_wip" ? 2 : 3;
  const remaining = row.rem_proc_in_gate;
  return [process && gate && process === gate ? 0 : 1, state,
    typeof remaining === "number" && Number.isInteger(remaining) && remaining >= 0 ? -remaining : null,
    Number.isInteger(row.pri) && row.pri >= 0 ? row.pri : null];
};
const compareNullable = (a, b) => a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b;
const comparePriority = (a, b) => a[0] - b[0] || a[1] - b[1] || compareNullable(a[2], b[2]) || compareNullable(a[3], b[3]);

const boardPositions = (cards, order = []) => {
  const groups = new Map();
  for (const card of cards) {
    const groupKey = JSON.stringify([card.gate, card.plannedDate]);
    const group = groups.get(groupKey) ?? new Map();
    const label = card.lotNo?.trim() || "Need WIP";
    const id = JSON.stringify([card.gate, card.plannedDate, card.kind, card.kind === "lot" ? label : card.workKey]);
    const priority = card.allocations.map(priorityOf).reduce((best, next) => comparePriority(next, best) < 0 ? next : best);
    const item = group.get(id) ?? { id, label, kind: card.kind, priority, sourceIds: [] };
    if (comparePriority(priority, item.priority) < 0) item.priority = priority;
    item.sourceIds.push(card.id);
    group.set(id, item);
    groups.set(groupKey, group);
  }
  const overrides = new Map(order.map((group) => [JSON.stringify([group.gate, group.date]), group.cardIds]));
  const result = new Map();
  for (const [key, group] of groups) {
    const ids = overrides.get(key) ?? [];
    const ranks = new Map(ids.map((id, index) => [id, index]));
    const sorted = [...group.values()].sort((a, b) =>
      (ranks.get(a.id) ?? ids.length) - (ranks.get(b.id) ?? ids.length)
      || comparePriority(a.priority, b.priority)
      || Number(a.kind !== "lot") - Number(b.kind !== "lot")
      || a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
    sorted.forEach((item, index) => {
      for (const id of item.sourceIds) result.set(id, { boardId: item.id, position: index + 1 });
    });
  }
  return result;
};

/** The server derives saved changes; client-supplied names, timestamps and audit events are never trusted. */
const buildSavedMoveHistory = (before, after, beforeOrder, afterOrder, previousHistory, metadata) => {
  const previous = new Map(before.map((card) => [card.id, card]));
  const oldPositions = boardPositions(before, beforeOrder);
  const newPositions = boardPositions(after, afterOrder);
  const history = Object.create(null);
  for (const card of after) {
    const older = Array.isArray(previousHistory?.[card.id]) ? previousHistory[card.id] : [];
    const old = previous.get(card.id);
    const from = oldPositions.get(card.id);
    const to = newPositions.get(card.id);
    const kind = old && old.plannedDate !== card.plannedDate ? "date"
      : from && to && from.position !== to.position ? "reorder" : null;
    const entries = kind ? [{
      id: `${metadata.planId}:${kind}:${from.boardId}:${to.boardId}`,
      kind, fromDate: old.plannedDate, toDate: card.plannedDate,
      ...(kind === "reorder" ? { fromPosition: from.position, toPosition: to.position } : {}),
      changedBy: metadata.changedBy, changedAt: metadata.changedAt, planVersion: metadata.planVersion,
      note: metadata.note || (kind === "reorder" ? "Reordered within the same day" : "Arrival date changed"),
    }, ...older] : older;
    if (entries.length) history[card.id] = entries.slice(0, HISTORY_LIMIT);
  }
  return history;
};

module.exports = { buildSavedMoveHistory, HISTORY_LIMIT };
