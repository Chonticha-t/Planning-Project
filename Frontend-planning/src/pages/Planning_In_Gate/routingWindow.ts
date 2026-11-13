import type { RoutingStep } from "./hooks/useLotRouting";

/** Keep each occurrence separate when a route visits the same gate more than once. */
export function gateTransitions(steps: readonly RoutingStep[], gate: string) {
  const ordered = [...steps].sort((a, b) => a.seq - b.seq);
  const transitions: { from: string; to: string | null; steps: RoutingStep[] }[] = [];
  for (let index = 0; index < ordered.length;) {
    if (ordered[index].gate !== gate) { index++; continue; }
    const start = index;
    while (index < ordered.length && ordered[index].gate === gate) index++;
    transitions.push({ from: gate, to: ordered[index]?.gate ?? null, steps: ordered.slice(start, index) });
  }
  return transitions;
}
