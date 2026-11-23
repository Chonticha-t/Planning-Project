/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import type { LevelingData, LotItem } from "../Capacity_Leveling/types";
import { applyBoardCardOrder, readBoardCardOrder, reorderBoardCards } from "../Capacity_Leveling/utils/boardCardOrder.ts";
import {
  buildSaveOrderItems,
  computeOrderDiff,
  findDirtyOrderScopes,
  hasActiveInGateOrder,
  mergeInGateOrders,
  orderScopeKey,
} from "./inGateOrder.ts";
import type { InGateQueueOrder } from "./types";

const DAY = "2026-11-23";

function makeLot(
  name: string,
  overrides: Partial<LotItem> = {},
): LotItem {
  const gate = overrides.gate ?? "FVAC";
  const plannedDate = overrides.plannedDate ?? DAY;
  const kind = overrides.kind ?? "lot";
  const label = overrides.label ?? (kind === "need" ? "Need WIP" : `LOT-${name}`);
  const id = overrides.id ?? JSON.stringify([gate, plannedDate, kind, kind === "lot" ? label : `WORK-${name}`]);
  return {
    id,
    workKey: `WORK-${name}`,
    gate,
    product: `PRODUCT-${name}`,
    label,
    item: null,
    qty: 100,
    sheets: 10,
    kind,
    status: "production plan",
    gateState: "in_gate",
    processGroup: "EFPC_GEN",
    currentGate: gate,
    currentProc: "PROC-1",
    isHold: false,
    dueDate: "2026-11-28",
    arriveBy: plannedDate,
    mustOut: "2026-11-25",
    baseDate: plannedDate,
    plannedDate,
    savedDate: plannedDate,
    overdue: false,
    sourceChanged: false,
    prevGate: null,
    prevDate: null,
    nextGate: null,
    nextDate: null,
    loadMin: 300,
    leadDays: 1,
    standardShiftMin: { day: 450, night: 450 },
    passedGate: false,
    ...overrides,
  };
}

function capacitySnapshot(dayCap = 450, nightCap = 450): Pick<LevelingData, "capacity"> {
  return {
    capacity: {
      FVAC: {
        [DAY]: {
          off: false,
          hasOt: false,
          capacityMin: dayCap + nightCap,
          shifts: {
            day: { open: dayCap > 0, otOn: false, capacityMin: dayCap },
            night: { open: nightCap > 0, otOn: false, capacityMin: nightCap },
          },
        },
      },
    },
  };
}

test("Option A mergeInGateOrders overlays In Gate order on top of Capacity Leveling plan order and appends new lots", () => {
  const lotA = makeLot("A");
  const lotB = makeLot("B");
  const lotC = makeLot("C");
  const lotD = makeLot("D"); // Newly added in a newer Capacity Leveling plan version

  const planOrder = readBoardCardOrder([
    { gate: "FVAC", date: DAY, cardIds: [lotA.id, lotB.id, lotC.id, lotD.id] },
    { gate: "FADL", date: DAY, cardIds: [makeLot("X", { gate: "FADL" }).id] },
  ]);

  const inGateOrders: InGateQueueOrder[] = [
    {
      orderId: "ord-1",
      gate: "FVAC",
      date: DAY,
      planId: "plan-v10",
      planVersion: 10,
      revision: 2,
      // Saved under Plan v10 before lotD existed and before lotB was removed in Plan v11
      cardIds: [lotC.id, lotB.id, lotA.id],
      note: null,
      updatedBy: "planner",
      updatedAt: "2026-11-23T09:00:00.000Z",
    },
  ];

  const merged = mergeInGateOrders(planOrder, inGateOrders);
  // Plan v11 has [lotA, lotC, lotD] (lotB removed, lotD added)
  const ordered = applyBoardCardOrder([lotA, lotC, lotD], merged);
  assert.deepEqual(ordered.map((lot) => lot.label), ["LOT-C", "LOT-A", "LOT-D"]);
  // Unrelated gate keeps Capacity Leveling order untouched
  assert.ok(merged.has(orderScopeKey("FADL", DAY)));

  // Staging a reset for (FVAC, DAY) restores Capacity Leveling's plan order
  const resetMerged = mergeInGateOrders(planOrder, inGateOrders, new Set([orderScopeKey("FVAC", DAY)]));
  const resetOrdered = applyBoardCardOrder([lotA, lotC, lotD], resetMerged);
  assert.deepEqual(resetOrdered.map((lot) => lot.label), ["LOT-A", "LOT-C", "LOT-D"]);

  // Persisted reset (cardIds: []) is treated as inactive so planOrder applies automatically
  assert.equal(hasActiveInGateOrder(inGateOrders[0]), true);
  assert.equal(hasActiveInGateOrder({ ...inGateOrders[0], cardIds: [] }), false);
});

test("findDirtyOrderScopes detects real changes and clears when moved back to original position", () => {
  const lotA = makeLot("A");
  const lotB = makeLot("B");
  const lotC = makeLot("C", { processGroup: "EFPC_AUTO" });
  const allLots = [lotA, lotB, lotC];
  const savedOrder = readBoardCardOrder([]);

  // Move C before A
  const moved = reorderBoardCards(allLots, savedOrder, [lotC.id], lotA.id, "before");
  const dirty = findDirtyOrderScopes(allLots, savedOrder, moved);
  assert.equal(dirty.length, 1);
  assert.deepEqual(dirty[0].beforeIds, [lotA.id, lotB.id, lotC.id]);
  assert.deepEqual(dirty[0].afterIds, [lotC.id, lotA.id, lotB.id]);

  // Move C back after B -> identical to original order -> no dirty scopes
  const reverted = reorderBoardCards(allLots, moved, [lotC.id], lotB.id, "after");
  assert.deepEqual(findDirtyOrderScopes(allLots, savedOrder, reverted), []);
});

test("computeOrderDiff reports 1-based moves and shift overflow transitions (pushedOut / nowFit)", () => {
  // Day = 450m, Night = 450m (total 900m)
  // lotA (400m) fits Day, lotB (400m) fits Night, lotC (400m) overflows -> Over
  const lotA = makeLot("A", { loadMin: 400 });
  const lotB = makeLot("B", { loadMin: 400 });
  const lotC = makeLot("C", { loadMin: 400 });
  const passed = makeLot("P", { loadMin: 400, passedGate: true });

  // Move lotC to top -> lotC fits Day (nowFit), lotA moves to Night, lotB overflows (pushedOut)
  // Also exclude an already-finished lot from 1-based active queue positions while preserving its shift impact.
  const finishedNotPassed = makeLot("F", { loadMin: 50, passedGate: false });
  const diff = computeOrderDiff(
    capacitySnapshot(500, 450),
    [passed, finishedNotPassed, lotA, lotB, lotC],
    [passed, finishedNotPassed, lotC, lotA, lotB],
    new Set([finishedNotPassed.id]),
  );
  assert.ok(diff);
  assert.deepEqual(
    diff.moves.map((m) => [m.lotId, m.from, m.to]),
    [
      ["LOT-C", 3, 1],
      ["LOT-A", 1, 2],
      ["LOT-B", 2, 3],
    ],
  );
  assert.deepEqual(diff.nowFit, ["LOT-C"]);
  assert.deepEqual(diff.pushedOut, ["LOT-B"]);
});

test("buildSaveOrderItems maps lot, need and unidentified cards cleanly", () => {
  const lot = makeLot("A");
  const need = makeLot("N", { kind: "need", label: "Need WIP" });
  const unidentified = makeLot("U", { kind: "unidentified", label: "No lot" });
  assert.deepEqual(buildSaveOrderItems([lot, need, unidentified]), [
    { cardId: lot.id, lotNo: "LOT-A", prdName: "PRODUCT-A", itemKind: "lot" },
    { cardId: need.id, lotNo: null, prdName: "PRODUCT-N", itemKind: "need" },
    { cardId: unidentified.id, lotNo: null, prdName: "PRODUCT-U", itemKind: "unidentified" },
  ]);
});
