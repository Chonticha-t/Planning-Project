/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import { gateTransitions } from "./routingWindow.ts";
import type { RoutingStep } from "./hooks/useLotRouting";
const step = (seq: number, gate: string | null): RoutingStep => ({ seq, gate, process: `PROCESS-${seq}`,
  processId: null, stepInGate: null, totalInGate: null, updatedAt: null });

test("only selected gate processes are included; next gate is a boundary", () => {
  const source = [step(1, "GATE-A"), step(2, "GATE-B"), step(3, "GATE-B"), step(4, "GATE-C"), step(5, "GATE-D")];
  assert.deepEqual(gateTransitions(source, "GATE-B"), [{ from: "GATE-B", to: "GATE-C", steps: source.slice(1, 3) }]);
});
test("repeated visits remain separate transitions instead of merging across another gate", () => {
  const source = [step(1, "GATE-A"), step(2, "GATE-B"), step(3, "GATE-A"), step(4, "GATE-C")];
  assert.deepEqual(gateTransitions(source, "GATE-A").map(value => ({ to: value.to, seqs: value.steps.map(step => step.seq) })), [
    { to: "GATE-B", seqs: [1] }, { to: "GATE-C", seqs: [3] },
  ]);
});
test("missing, terminal and unmapped gates never invent a destination", () => {
  assert.deepEqual(gateTransitions([step(1, "GATE-A")], "GATE-B"), []);
  assert.equal(gateTransitions([step(1, "GATE-A")], "GATE-A")[0].to, null);
  assert.equal(gateTransitions([step(1, "GATE-A"), step(2, null), step(3, "GATE-C")], "GATE-A")[0].to, null);
});
test("master sequence defines the boundaries without mutating the API response", () => {
  const source = [step(3, "GATE-C"), step(1, "GATE-A"), step(2, "GATE-A")];
  const before = JSON.stringify(source);
  assert.deepEqual(gateTransitions(source, "GATE-A")[0].steps.map(step => step.seq), [1, 2]);
  assert.equal(JSON.stringify(source), before);
});
