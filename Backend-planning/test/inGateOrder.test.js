const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  createInGateOrderRouter,
  parseSaveOrderPayload,
  reconcileBeforeOrder,
  computePositionMoves,
  inferItemMeta,
} = require("../routes/10.17.87.244/Planning System/Planning In Gate/inGateOrderRouter");

const PLAN_V10_ID = "11111111-1111-4111-8111-111111111110";
const PLAN_V11_ID = "11111111-1111-4111-8111-111111111111";
const CARD_A = JSON.stringify(["FVAC", "2026-11-23", "lot", "LOT-A"]);
const CARD_B = JSON.stringify(["FVAC", "2026-11-23", "lot", "LOT-B"]);
const CARD_C = JSON.stringify(["FVAC", "2026-11-23", "need", "NEED|PROD-C|2026-11-30"]);
const CARD_D = JSON.stringify(["FVAC", "2026-11-23", "lot", "LOT-D"]);

test("parseSaveOrderPayload rejects malformed gates, dates, UUIDs, duplicates and control characters", () => {
  const valid = {
    gate: "FVAC",
    date: "2026-11-23",
    planId: PLAN_V10_ID,
    baseRevision: 0,
    cardIdsBefore: [CARD_A, CARD_B],
    cardIds: [CARD_B, CARD_A],
    reason: "Priority customer",
  };
  assert.equal(parseSaveOrderPayload(valid).gate, "FVAC");

  for (const bad of [
    { ...valid, gate: "FFPC" },
    { ...valid, date: "2026-02-30" },
    { ...valid, planId: "not-a-uuid" },
    { ...valid, baseRevision: -1 },
    { ...valid, cardIds: [] },
    { ...valid, cardIds: [CARD_A, CARD_A] },
    { ...valid, cardIds: ["\n"] },
    { ...valid, items: [{ cardId: CARD_A, itemKind: "unknown" }] },
    { ...valid, reason: "x".repeat(501) },
  ]) {
    assert.throws(() => parseSaveOrderPayload(bad));
  }
});

test("Option A reconciliation preserves prior saved order across plan versions and computes exact moves", () => {
  // Plan v10 saved order: [A, B, C]. Plan v11 removed B and added D at the end: before=[A, C, D].
  // Planner moves D to #1: after=[D, A, C].
  const before = reconcileBeforeOrder([CARD_A, CARD_B, CARD_C], [CARD_A, CARD_C, CARD_D], [CARD_D, CARD_A, CARD_C]);
  assert.deepEqual(before, [CARD_A, CARD_C, CARD_D]);

  const items = new Map([
    [CARD_A, { cardId: CARD_A, lotNo: "LOT-A", prdName: "PROD-A", itemKind: "lot" }],
    [CARD_C, { cardId: CARD_C, lotNo: null, prdName: "PROD-C", itemKind: "need" }],
    [CARD_D, { cardId: CARD_D, lotNo: "LOT-D", prdName: "PROD-D", itemKind: "lot" }],
  ]);
  const moves = computePositionMoves(before, [CARD_D, CARD_A, CARD_C], items);
  assert.deepEqual(
    moves.map((m) => [m.lotNo, m.itemKind, m.fromPosition, m.toPosition, m.direction]),
    [
      ["LOT-D", "lot", 3, 1, "up"],
      ["LOT-A", "lot", 1, 2, "down"],
      [null, "need", 2, 3, "down"],
    ]
  );

  // Identical order produces no moves.
  assert.deepEqual(computePositionMoves([CARD_A, CARD_B], [CARD_A, CARD_B], items), []);

  // Inactive (passedGate / finished) cards are kept in saved card_ids but excluded from 1-based active queue positions.
  const activeMoves = computePositionMoves(
    [CARD_A, CARD_B, CARD_C, CARD_D],
    [CARD_A, CARD_B, CARD_D, CARD_C],
    items,
    [CARD_A, CARD_B],
  );
  assert.deepEqual(
    activeMoves.map((m) => [m.cardId, m.fromPosition, m.toPosition]),
    [
      [CARD_D, 2, 1],
      [CARD_C, 1, 2],
    ]
  );
});

test("inferItemMeta extracts lot and need metadata from board card IDs safely", () => {
  assert.deepEqual(inferItemMeta(CARD_A), { cardId: CARD_A, lotNo: "LOT-A", prdName: null, itemKind: "lot" });
  assert.deepEqual(inferItemMeta(CARD_C), { cardId: CARD_C, lotNo: null, prdName: null, itemKind: "need" });
  assert.deepEqual(inferItemMeta("plain-id"), { cardId: "plain-id", lotNo: null, prdName: null, itemKind: "lot" });
});

function createFakeDb({ schemaMissing = false, failOnQuery = false } = {}) {
  const plans = new Map([
    [PLAN_V10_ID, { plan_id: PLAN_V10_ID, version_no: 10 }],
    [PLAN_V11_ID, { plan_id: PLAN_V11_ID, version_no: 11 }],
  ]);
  const orders = new Map(); // key: `${gate}|${date}`
  const histories = [];
  const moves = [];
  const log = [];
  let seqMoveId = 1;

  const pool = {
    connect: async () => {
      let txOrders = null;
      let txHistories = null;
      let txMoves = null;
      return {
        release() {
          log.push("RELEASE");
        },
        async query(sql, params = []) {
          log.push(sql.trim().split("\n")[0]);
          if (sql.startsWith("BEGIN")) {
            txOrders = new Map([...orders.entries()].map(([k, v]) => [k, { ...v }]));
            txHistories = histories.map((h) => ({ ...h }));
            txMoves = moves.map((m) => ({ ...m }));
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            if (txOrders) {
              orders.clear();
              for (const [k, v] of txOrders) orders.set(k, v);
              histories.splice(0, histories.length, ...txHistories);
              moves.splice(0, moves.length, ...txMoves);
            }
            txOrders = txHistories = txMoves = null;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            txOrders = txHistories = txMoves = null;
            return { rows: [] };
          }
          if (sql.startsWith("SET LOCAL") || sql.includes("pg_advisory_xact_lock")) {
            return { rows: [] };
          }
          if (failOnQuery) {
            throw new Error("Sensitive host=10.17.87.244 password=secret");
          }
          if (schemaMissing && sql.includes("in_gate_queue_order")) {
            const err = new Error('relation "planning.in_gate_queue_order" does not exist');
            err.code = "42P01";
            throw err;
          }
          if (sql.includes("FROM planning.work_plan")) {
            const plan = plans.get(params[0]);
            return { rows: plan ? [plan] : [] };
          }
          if (sql.includes("FROM planning.in_gate_queue_order_history")) {
            const [gate, date, limit] = params;
            const rows = histories
              .filter((h) => h.gate_name === gate && h.planned_date === date)
              .sort((a, b) => b.saved_at - a.saved_at || b.revision - a.revision)
              .slice(0, limit);
            return { rows };
          }
          if (sql.includes("FROM planning.in_gate_queue_order_move")) {
            const idSet = new Set(params[0]);
            const rows = moves
              .filter((m) => idSet.has(m.history_id))
              .sort((a, b) => a.to_position - b.to_position || a.move_id - b.move_id);
            return { rows };
          }
          if (sql.includes("FROM planning.in_gate_queue_order") && sql.includes("FOR UPDATE")) {
            const row = (txOrders ?? orders).get(`${params[0]}|${params[1]}`);
            return { rows: row ? [row] : [] };
          }
          if (sql.includes("FROM planning.in_gate_queue_order")) {
            const [gate, date, from, to] = params;
            const rows = [...orders.values()]
              .filter((r) => (!gate || r.gate_name === gate)
                && (!date || r.planned_date === date)
                && (!from || r.planned_date >= from)
                && (!to || r.planned_date <= to))
              .sort((a, b) => a.planned_date.localeCompare(b.planned_date) || a.gate_name.localeCompare(b.gate_name));
            return { rows };
          }
          if (sql.includes("INSERT INTO planning.in_gate_queue_order ")) {
            const [orderId, gate, date, planId, planVersion, revision, cardIdsJson, note, actor] = params;
            const row = {
              order_id: orderId,
              gate_name: gate,
              planned_date: date,
              plan_id: planId,
              plan_version: planVersion,
              revision,
              card_ids: JSON.parse(cardIdsJson),
              note,
              updated_by: actor,
              updated_at: new Date("2026-11-23T09:00:00.000Z"),
            };
            txOrders.set(`${gate}|${date}`, row);
            return { rows: [row] };
          }
          if (sql.includes("UPDATE planning.in_gate_queue_order")) {
            const [orderId, planId, planVersion, revision, cardIdsJson, note, actor] = params;
            const entry = [...txOrders.values()].find((r) => r.order_id === orderId);
            const updated = {
              ...entry,
              plan_id: planId,
              plan_version: planVersion,
              revision,
              card_ids: JSON.parse(cardIdsJson),
              note,
              updated_by: actor,
              updated_at: new Date("2026-11-23T09:10:00.000Z"),
            };
            txOrders.set(`${updated.gate_name}|${updated.planned_date}`, updated);
            return { rows: [updated] };
          }
          if (sql.includes("INSERT INTO planning.in_gate_queue_order_history")) {
            const [
              historyId, orderId, gate, date, planId, planVersion, revision,
              beforeJson, afterJson, pushedJson, nowFitJson, reason, actor,
            ] = params;
            const row = {
              history_id: historyId,
              order_id: orderId,
              gate_name: gate,
              planned_date: date,
              plan_id: planId,
              plan_version: planVersion,
              revision,
              card_ids_before: JSON.parse(beforeJson),
              card_ids_after: JSON.parse(afterJson),
              pushed_out_lots: JSON.parse(pushedJson),
              now_fit_lots: JSON.parse(nowFitJson),
              reason,
              saved_by: actor,
              saved_at: new Date(Date.parse("2026-11-23T09:00:00.000Z") + revision * 60000),
            };
            txHistories.push(row);
            return { rows: [row] };
          }
          if (sql.includes("INSERT INTO planning.in_gate_queue_order_move")) {
            const [historyId, cardIds, lotNos, prdNames, itemKinds, froms, tos] = params;
            for (let i = 0; i < cardIds.length; i++) {
              txMoves.push({
                move_id: seqMoveId++,
                history_id: historyId,
                card_id: cardIds[i],
                lot_no: lotNos[i],
                prd_name: prdNames[i],
                item_kind: itemKinds[i],
                from_position: froms[i],
                to_position: tos[i],
              });
            }
            return { rows: [] };
          }
          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
      };
    },
  };

  return { pool, orders, histories, moves, log };
}

async function withServer(options, callback) {
  const db = createFakeDb(options);
  const app = express();
  app.use(express.json());
  const verifyPlanner = (req, res, next) => {
    if (options.allowed === false) return res.status(401).json({ status: "ERROR", code: "UNAUTHORIZED" });
    req.user = { username: options.actor ?? "planner_a", role: "planner" };
    return next();
  };
  app.use("/in_gate", createInGateOrderRouter({ pool: db.pool, verifyPlanner }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}/in_gate`;
  try {
    await callback(base, db);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("saving In Gate order stores revisioned order + history + moves without modifying work_plan", async () => {
  await withServer({ actor: "chonticha" }, async (base, db) => {
    // Save rev 1 against Plan v10
    const res1 = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V10_ID,
        baseRevision: 0,
        cardIdsBefore: [CARD_A, CARD_B, CARD_C],
        cardIds: [CARD_B, CARD_A, CARD_C],
        items: [
          { cardId: CARD_A, lotNo: "LOT-A", prdName: "PROD-A", itemKind: "lot" },
          { cardId: CARD_B, lotNo: "LOT-B", prdName: "PROD-B", itemKind: "lot" },
          { cardId: CARD_C, lotNo: null, prdName: "PROD-C", itemKind: "need" },
        ],
        pushedOutLots: ["LOT-A"],
        nowFitLots: ["LOT-B"],
        reason: "Expedite LOT-B",
      }),
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get("cache-control"), "no-store");
    const body1 = await res1.json();
    assert.equal(body1.data.order.revision, 1);
    assert.equal(body1.data.order.planVersion, 10);
    assert.equal(body1.data.order.updatedBy, "chonticha");
    assert.deepEqual(body1.data.order.cardIds, [CARD_B, CARD_A, CARD_C]);
    assert.equal(body1.data.historyEntry.moves.length, 2);
    assert.deepEqual(body1.data.historyEntry.pushedOut, ["LOT-A"]);
    assert.deepEqual(body1.data.historyEntry.nowFit, ["LOT-B"]);
    // Ensure work_plan was never INSERTed or UPDATEd
    assert.ok(db.log.every((line) => !/^(INSERT|UPDATE|DELETE).*work_plan/i.test(line)));

    // Option A: Save rev 2 against a newer Capacity Plan v11 (which added CARD_D)
    const res2 = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V11_ID,
        baseRevision: 1,
        cardIdsBefore: [CARD_B, CARD_A, CARD_C, CARD_D],
        cardIds: [CARD_D, CARD_B, CARD_A, CARD_C],
        items: [
          { cardId: CARD_D, lotNo: "LOT-D", prdName: "PROD-D", itemKind: "lot" },
          { cardId: CARD_B, lotNo: "LOT-B", prdName: "PROD-B", itemKind: "lot" },
          { cardId: CARD_A, lotNo: "LOT-A", prdName: "PROD-A", itemKind: "lot" },
          { cardId: CARD_C, lotNo: null, prdName: "PROD-C", itemKind: "need" },
        ],
      }),
    });
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.data.order.revision, 2);
    assert.equal(body2.data.order.planVersion, 11);
    assert.equal(body2.data.order.orderId, body1.data.order.orderId); // Same Option A row updated

    // Read active orders & history
    const listRes = await fetch(`${base}/order`);
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.data.orders.length, 1);
    assert.equal(listBody.data.orders[0].revision, 2);

    const histRes = await fetch(`${base}/order/history?gate=FVAC&date=2026-11-23`);
    assert.equal(histRes.status, 200);
    const histBody = await histRes.json();
    assert.equal(histBody.data.entries.length, 2);
    assert.equal(histBody.data.entries[0].revision, 2);
    assert.equal(histBody.data.entries[0].moves[0].lotId, "LOT-D");
    assert.equal(histBody.data.entries[0].moves[0].from, 4);
    assert.equal(histBody.data.entries[0].moves[0].to, 1);
    assert.equal(histBody.data.entries[1].revision, 1);
    assert.equal(histBody.data.entries[1].reason, "Expedite LOT-B");
  });
});

test("stale baseRevision returns 409 ORDER_VERSION_CONFLICT without overwriting", async () => {
  await withServer({}, async (base, db) => {
    const first = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V10_ID,
        baseRevision: 0,
        cardIdsBefore: [CARD_A, CARD_B],
        cardIds: [CARD_B, CARD_A],
      }),
    });
    assert.equal(first.status, 200);

    const conflict = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V10_ID,
        baseRevision: 0,
        cardIdsBefore: [CARD_A, CARD_B],
        cardIds: [CARD_A, CARD_B],
      }),
    });
    assert.equal(conflict.status, 409);
    const body = await conflict.json();
    assert.equal(body.code, "ORDER_VERSION_CONFLICT");
    assert.equal(body.currentRevision, 1);
    assert.equal(db.histories.length, 1);
  });
});

test("writes require planner auth while reads remain accessible to Viewers", async () => {
  await withServer({ allowed: false }, async (base, db) => {
    assert.equal((await fetch(`${base}/order`)).status, 200);
    assert.equal((await fetch(`${base}/order/history?gate=FVAC&date=2026-11-23`)).status, 200);
    const write = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V10_ID,
        baseRevision: 0,
        cardIds: [CARD_A, CARD_B],
      }),
    });
    assert.equal(write.status, 401);
    assert.equal(db.histories.length, 0);
  });
});

test("missing tables degrade gracefully on reads and report SCHEMA_NOT_READY on writes", async () => {
  await withServer({ schemaMissing: true }, async (base) => {
    const readOrders = await (await fetch(`${base}/order`)).json();
    assert.deepEqual(readOrders.data.orders, []);
    assert.equal(readOrders.data.schemaReady, false);

    const readHistory = await (await fetch(`${base}/order/history?gate=FVAC&date=2026-11-23`)).json();
    assert.deepEqual(readHistory.data.entries, []);
    assert.equal(readHistory.data.schemaReady, false);

    const writeRes = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V10_ID,
        baseRevision: 0,
        cardIdsBefore: [CARD_A, CARD_B],
        cardIds: [CARD_B, CARD_A],
      }),
    });
    assert.equal(writeRes.status, 503);
    assert.equal((await writeRes.json()).code, "SCHEMA_NOT_READY");
  });
});

test("unknown planId returns 404, no-op returns 400, and DB errors hide sensitive details", async () => {
  await withServer({}, async (base) => {
    const missingPlan = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: "99999999-9999-4999-8999-999999999999",
        baseRevision: 0,
        cardIdsBefore: [CARD_A, CARD_B],
        cardIds: [CARD_B, CARD_A],
      }),
    });
    assert.equal(missingPlan.status, 404);
    assert.equal((await missingPlan.json()).code, "PLAN_NOT_FOUND");

    const noChanges = await fetch(`${base}/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gate: "FVAC",
        date: "2026-11-23",
        planId: PLAN_V10_ID,
        baseRevision: 0,
        cardIdsBefore: [CARD_A, CARD_B],
        cardIds: [CARD_A, CARD_B],
      }),
    });
    assert.equal(noChanges.status, 400);
    assert.equal((await noChanges.json()).code, "NO_CHANGES");
  });

  await withServer({ failOnQuery: true }, async (base, db) => {
    const res = await fetch(`${base}/order`);
    assert.equal(res.status, 503);
    const text = await res.text();
    assert.equal(text.includes("password"), false);
    assert.equal(text.includes("10.17.87.244"), false);
    assert.equal(db.log.at(-1), "RELEASE");
  });
});
