import type { LotItem } from "../Capacity_Leveling/types";
import type { FinishedEvidence } from "./hooks/useFinishedToday";

const identity = (product: string, lot: string, gate: string) => JSON.stringify([product, lot.trim(), gate]);
export type FinishedPlanMatch = { status: "matched"; lot: LotItem } | { status: "unplanned" | "ambiguous"; lot: null };
export interface WorkRow {
  key: string;
  lot: LotItem | null;
  evidence?: FinishedEvidence;
  sequence: number;
  matchStatus: "matched" | "unplanned" | "ambiguous";
}

/** Index every planned date; the scan date must not hide early or late completions. */
export function indexFinishedPlans(lots: readonly LotItem[]) {
  const index = new Map<string, LotItem[]>();
  for (const lot of lots) {
    if (lot.kind !== "lot") continue;
    const products = new Set((lot.allocations ?? []).map(row => row.prd_name));
    if (!products.size) products.add(lot.product);
    for (const product of products) {
      const key = identity(product, lot.label, lot.gate);
      const matches = index.get(key) ?? [];
      if (!matches.some(existing => existing.id === lot.id)) matches.push(lot);
      index.set(key, matches);
    }
  }
  return index;
}

/** Never select the first of several planned dates or reuse aggregate quantities from mixed products. */
export function matchFinishedPlan(record: FinishedEvidence, index: ReadonlyMap<string, readonly LotItem[]>): FinishedPlanMatch {
  const matches = index.get(identity(record.product, record.lotNo, record.gate)) ?? [];
  if (!matches.length) return { status: "unplanned", lot: null };
  const lot = matches[0];
  if (matches.length !== 1 || new Set((lot.allocations ?? []).map(row => row.prd_name)).size > 1) {
    return { status: "ambiguous", lot: null };
  }
  return { status: "matched", lot };
}

/** A planned lot keeps the same row object data when scan evidence changes its status. */
export function buildWorkRows(planOrder: readonly LotItem[], savedPlanLots: readonly LotItem[], evidence: readonly FinishedEvidence[]) {
  const index = indexFinishedPlans(savedPlanLots);
  const planned = new Map(planOrder.map((lot, i) => [lot.id, { lot, sequence: i + 1 }]));
  const completed = new Set(evidence.map(row => JSON.stringify([row.gate, row.lotNo.trim()])));
  const finished: WorkRow[] = evidence.map((record, i) => {
    const match = matchFinishedPlan(record, index);
    const existing = match.lot ? planned.get(match.lot.id) : undefined;
    return { key: `finished:${record.id}`, lot: existing?.lot ?? match.lot, evidence: record,
      sequence: existing?.sequence ?? i + 1, matchStatus: match.status };
  });
  const finishedByPlan = new Map(finished.filter(row => row.lot).map(row => [row.lot!.id, row]));
  const queue: WorkRow[] = [];
  const all: WorkRow[] = [];
  const included = new Set<string>();
  planOrder.forEach((lot, i) => {
    const done = finishedByPlan.get(lot.id);
    if (done) { all.push(done); included.add(done.key); return; }
    if (lot.kind === "lot" && completed.has(JSON.stringify([lot.gate, lot.label.trim()]))) return;
    const row: WorkRow = { key: `plan:${lot.id}`, lot, sequence: i + 1, matchStatus: "matched" };
    queue.push(row);
    all.push(row);
  });
  all.push(...finished.filter(row => !included.has(row.key)));
  return { queue, finished, all };
}
