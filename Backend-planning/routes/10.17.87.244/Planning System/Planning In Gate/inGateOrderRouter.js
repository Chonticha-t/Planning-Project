const express = require("express");
const { randomUUID } = require("node:crypto");
const {
  LEVELING_GATES,
  ValidationError,
  isDate,
} = require("../Capacity Leveling/capacityLeveling");

// Dedicated advisory lock key for In Gate queue order writes ("INGATEWR"),
// independent of Capacity Leveling's PLAN_LOCK_KEY so the two never block each other.
const IN_GATE_ORDER_LOCK_KEY = 0x494e474154455752;
const MAX_CARDS_PER_ORDER = 2000;
const MAX_CARD_ID_LENGTH = 500;
const MAX_ORDER_LIST_ROWS = 2000;
const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 100;
const ITEM_KINDS = new Set(["lot", "need", "unidentified"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (value) => typeof value === "string" && UUID_RE.test(value);
const hasControlChars = (value) => /[\x00-\x1f\x7f]/.test(value);

const cleanOptionalText = (value, maxLength, fieldName) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${fieldName} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength || hasControlChars(trimmed)) {
    throw new ValidationError(`${fieldName} is invalid or exceeds ${maxLength} characters.`);
  }
  return trimmed;
};

const parseCardIds = (value, fieldName, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value)) throw new ValidationError(`${fieldName} must be an array.`);
  if (!allowEmpty && value.length === 0) throw new ValidationError(`${fieldName} cannot be empty.`);
  if (value.length > MAX_CARDS_PER_ORDER) {
    throw new ValidationError(`${fieldName} exceeds the maximum of ${MAX_CARDS_PER_ORDER} cards.`);
  }
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    if (typeof raw !== "string") throw new ValidationError(`${fieldName} contains a non-string card ID.`);
    const id = raw.trim();
    if (!id || id.length > MAX_CARD_ID_LENGTH || hasControlChars(id)) {
      throw new ValidationError(`${fieldName} contains an invalid card ID.`);
    }
    if (seen.has(id)) throw new ValidationError(`${fieldName} contains duplicate card IDs.`);
    seen.add(id);
    result.push(id);
  }
  return result;
};

const parseLabelList = (value, fieldName) => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_CARDS_PER_ORDER) {
    throw new ValidationError(`${fieldName} must be an array of up to ${MAX_CARDS_PER_ORDER} labels.`);
  }
  const seen = new Set();
  const labels = [];
  for (const entry of value) {
    if (typeof entry !== "string") throw new ValidationError(`${fieldName} must contain text labels.`);
    const text = entry.trim();
    if (!text || text.length > 150 || hasControlChars(text)) {
      throw new ValidationError(`${fieldName} contains an invalid label.`);
    }
    if (!seen.has(text)) {
      seen.add(text);
      labels.push(text);
    }
  }
  return labels;
};

const inferItemMeta = (cardId) => {
  try {
    const parsed = JSON.parse(cardId);
    if (Array.isArray(parsed) && parsed.length >= 4) {
      const rawKind = typeof parsed[2] === "string" ? parsed[2] : "lot";
      const itemKind = ITEM_KINDS.has(rawKind) ? rawKind : "lot";
      const rawLabel = typeof parsed[3] === "string" ? parsed[3].trim() : "";
      const lotNo = itemKind === "lot" && rawLabel ? rawLabel.slice(0, 100) : null;
      return { cardId, lotNo, prdName: null, itemKind };
    }
  } catch {
    // Non-JSON card IDs fall back to generic metadata.
  }
  return { cardId, lotNo: null, prdName: null, itemKind: "lot" };
};

const parseItems = (rawItems) => {
  const map = new Map();
  if (rawItems === undefined || rawItems === null) return map;
  if (!Array.isArray(rawItems) || rawItems.length > MAX_CARDS_PER_ORDER) {
    throw new ValidationError("items must be an array.");
  }
  for (const item of rawItems) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ValidationError("Each item entry must be an object.");
    }
    if (typeof item.cardId !== "string" || !item.cardId.trim() || item.cardId.trim().length > MAX_CARD_ID_LENGTH) {
      throw new ValidationError("Each item must have a valid cardId.");
    }
    const cardId = item.cardId.trim();
    const itemKind = item.itemKind === undefined ? "lot" : item.itemKind;
    if (typeof itemKind !== "string" || !ITEM_KINDS.has(itemKind)) {
      throw new ValidationError("itemKind must be lot, need, or unidentified.");
    }
    const lotNo = cleanOptionalText(item.lotNo, 100, "lotNo");
    const prdName = cleanOptionalText(item.prdName, 150, "prdName");
    map.set(cardId, { cardId, lotNo, prdName, itemKind });
  }
  return map;
};

const parseSaveOrderPayload = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Order save payload is required.");
  }
  if (!LEVELING_GATES.includes(body.gate)) {
    throw new ValidationError("Choose a valid gate.");
  }
  if (!isDate(body.date)) {
    throw new ValidationError("Choose a valid planned date (YYYY-MM-DD).");
  }
  if (!isUuid(body.planId)) {
    throw new ValidationError("A valid planId is required.");
  }
  if (body.planVersion !== undefined && (!Number.isSafeInteger(body.planVersion) || body.planVersion < 1)) {
    throw new ValidationError("planVersion must be a positive integer.");
  }
  const baseRevision = body.baseRevision === undefined ? 0 : body.baseRevision;
  if (!Number.isSafeInteger(baseRevision) || baseRevision < 0 || baseRevision > 2147483647) {
    throw new ValidationError("baseRevision must be a non-negative integer.");
  }
  const cardIds = parseCardIds(body.cardIds, "cardIds", { allowEmpty: false });
  const cardIdsBefore = body.cardIdsBefore === undefined
    ? null
    : parseCardIds(body.cardIdsBefore, "cardIdsBefore", { allowEmpty: true });
  const inactiveCardIds = body.inactiveCardIds === undefined
    ? []
    : parseCardIds(body.inactiveCardIds, "inactiveCardIds", { allowEmpty: true });
  const items = parseItems(body.items);
  const pushedOutLots = parseLabelList(body.pushedOutLots, "pushedOutLots");
  const nowFitLots = parseLabelList(body.nowFitLots, "nowFitLots");
  const reason = cleanOptionalText(body.reason ?? body.note, 500, "reason");
  return {
    gate: body.gate,
    date: body.date,
    planId: body.planId,
    baseRevision,
    cardIds,
    cardIdsBefore,
    inactiveCardIds,
    items,
    pushedOutLots,
    nowFitLots,
    reason,
  };
};

/**
 * Reconcile the effective pre-save ordering against the submitted card set.
 * Option A preserves saved In Gate order across Capacity Leveling plan versions:
 * retained IDs keep their prior saved rank and newly added cards inherit their
 * relative order from cardIdsBefore (or afterCardIds).
 */
const reconcileBeforeOrder = (existingCardIds, submittedBefore, afterCardIds) => {
  const afterSet = new Set(afterCardIds);
  const placed = new Set();
  const result = [];
  const pushValid = (source) => {
    if (!Array.isArray(source)) return;
    for (const id of source) {
      if (typeof id === "string" && afterSet.has(id) && !placed.has(id)) {
        placed.add(id);
        result.push(id);
      }
    }
  };
  if (Array.isArray(existingCardIds) && existingCardIds.length > 0) {
    pushValid(existingCardIds);
    pushValid(submittedBefore);
    pushValid(afterCardIds);
  } else {
    pushValid(submittedBefore);
    pushValid(afterCardIds);
  }
  return result;
};

const computePositionMoves = (beforeOrder, afterOrder, itemMetaMap, inactiveCardIds = []) => {
  const inactive = inactiveCardIds.length ? new Set(inactiveCardIds) : null;
  const activeBefore = inactive ? beforeOrder.filter((id) => !inactive.has(id)) : beforeOrder;
  const activeAfter = inactive ? afterOrder.filter((id) => !inactive.has(id)) : afterOrder;
  const beforeRank = new Map(activeBefore.map((id, index) => [id, index + 1]));
  const moves = [];
  activeAfter.forEach((cardId, index) => {
    const fromPosition = beforeRank.get(cardId);
    const toPosition = index + 1;
    if (!fromPosition || fromPosition === toPosition) return;
    const meta = itemMetaMap.get(cardId) ?? inferItemMeta(cardId);
    moves.push({
      cardId,
      lotNo: meta.lotNo,
      prdName: meta.prdName,
      itemKind: meta.itemKind,
      fromPosition,
      toPosition,
      direction: toPosition < fromPosition ? "up" : "down",
    });
  });
  return moves;
};

const toIso = (value) => (value instanceof Date ? value.toISOString() : String(value));

const formatOrderRow = (row) => ({
  orderId: row.order_id,
  gate: row.gate_name,
  date: row.planned_date,
  planId: row.plan_id,
  planVersion: row.plan_version,
  revision: row.revision,
  cardIds: Array.isArray(row.card_ids) ? row.card_ids : [],
  note: row.note ?? null,
  updatedBy: row.updated_by,
  updatedAt: toIso(row.updated_at),
});

const formatMoveRow = (row) => ({
  cardId: row.card_id,
  lotId: row.lot_no || (row.item_kind === "need" ? "Need WIP" : "No lot ID"),
  product: row.prd_name || "",
  itemKind: row.item_kind,
  from: row.from_position,
  to: row.to_position,
});

const formatHistoryRow = (row, moves) => ({
  id: row.history_id,
  revision: row.revision,
  savedAt: toIso(row.saved_at),
  savedBy: row.saved_by,
  planVersion: row.plan_version,
  ...(row.reason ? { reason: row.reason } : {}),
  pushedOut: Array.isArray(row.pushed_out_lots) ? row.pushed_out_lots : [],
  nowFit: Array.isArray(row.now_fit_lots) ? row.now_fit_lots : [],
  moves,
});

const SELECT_ORDERS_SQL = `
  SELECT order_id, gate_name, to_char(planned_date, 'YYYY-MM-DD') AS planned_date,
         plan_id, plan_version, revision, card_ids, note, updated_by, updated_at
  FROM planning.in_gate_queue_order
  WHERE ($1::varchar IS NULL OR gate_name = $1)
    AND ($2::date IS NULL OR planned_date = $2)
    AND ($3::date IS NULL OR planned_date >= $3)
    AND ($4::date IS NULL OR planned_date <= $4)
  ORDER BY planned_date ASC, gate_name ASC
  LIMIT ${MAX_ORDER_LIST_ROWS}
`;

const SELECT_HISTORY_SQL = `
  SELECT history_id, order_id, gate_name, to_char(planned_date, 'YYYY-MM-DD') AS planned_date,
         plan_id, plan_version, revision, pushed_out_lots, now_fit_lots, reason, saved_by, saved_at
  FROM planning.in_gate_queue_order_history
  WHERE gate_name = $1 AND planned_date = $2::date
  ORDER BY saved_at DESC, revision DESC
  LIMIT $3
`;

const SELECT_HISTORY_MOVES_SQL = `
  SELECT history_id, card_id, lot_no, prd_name, item_kind, from_position, to_position
  FROM planning.in_gate_queue_order_move
  WHERE history_id = ANY($1::uuid[])
  ORDER BY to_position ASC, move_id ASC
`;

const INSERT_MOVES_SQL = `
  INSERT INTO planning.in_gate_queue_order_move (
    history_id, card_id, lot_no, prd_name, item_kind, from_position, to_position
  )
  SELECT $1::uuid, u.card_id, u.lot_no, u.prd_name, u.item_kind, u.from_position, u.to_position
  FROM UNNEST(
    $2::text[], $3::varchar[], $4::varchar[], $5::varchar[], $6::integer[], $7::integer[]
  ) AS u(card_id, lot_no, prd_name, item_kind, from_position, to_position)
`;

const isSchemaMissingError = (error) => error?.code === "42P01" || error?.code === "42703";

function createInGateOrderRouter({ pool, verifyPlanner }) {
  const router = express.Router();
  const actorOf = (req) => {
    const raw = String(req.user?.username || "admin").trim().slice(0, 150);
    return raw || "admin";
  };

  // Read-only: Viewer and TV mode can load active In Gate queue order overlays.
  router.get("/order", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let gate = null;
    let date = null;
    let from = null;
    let to = null;
    try {
      if (req.query.gate !== undefined && req.query.gate !== "") {
        if (typeof req.query.gate !== "string" || !LEVELING_GATES.includes(req.query.gate)) {
          throw new ValidationError("Choose a valid gate.");
        }
        gate = req.query.gate;
      }
      if (req.query.date !== undefined && req.query.date !== "") {
        if (!isDate(req.query.date)) throw new ValidationError("Choose a valid date (YYYY-MM-DD).");
        date = req.query.date;
      }
      if (req.query.from !== undefined && req.query.from !== "") {
        if (!isDate(req.query.from)) throw new ValidationError("Choose a valid from date (YYYY-MM-DD).");
        from = req.query.from;
      }
      if (req.query.to !== undefined && req.query.to !== "") {
        if (!isDate(req.query.to)) throw new ValidationError("Choose a valid to date (YYYY-MM-DD).");
        to = req.query.to;
      }
      if (from && to && to < from) {
        throw new ValidationError("The end date cannot be before the start date.");
      }
    } catch (error) {
      return res.status(400).json({ status: "ERROR", code: "INVALID_REQUEST", message: error.message });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const { rows } = await client.query(SELECT_ORDERS_SQL, [gate, date, from, to]);
      await client.query("COMMIT");
      return res.json({
        status: "OK",
        data: { orders: rows.map(formatOrderRow), schemaReady: true },
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (isSchemaMissingError(error)) {
        return res.json({ status: "OK", data: { orders: [], schemaReady: false } });
      }
      return res.status(503).json({
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "Unable to load Planning In Gate queue orders. Please try again.",
      });
    } finally {
      client?.release();
    }
  });

  // Read-only: fetch saved In Gate queue reorder history for one gate and planned date.
  router.get("/order/history", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let gate;
    let date;
    let limit = DEFAULT_HISTORY_LIMIT;
    try {
      if (typeof req.query.gate !== "string" || !LEVELING_GATES.includes(req.query.gate)) {
        throw new ValidationError("Choose a valid gate.");
      }
      if (!isDate(req.query.date)) {
        throw new ValidationError("Choose a valid date (YYYY-MM-DD).");
      }
      gate = req.query.gate;
      date = req.query.date;
      if (req.query.limit !== undefined && req.query.limit !== "") {
        const parsed = Number(req.query.limit);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_HISTORY_LIMIT) {
          throw new ValidationError(`limit must be between 1 and ${MAX_HISTORY_LIMIT}.`);
        }
        limit = parsed;
      }
    } catch (error) {
      return res.status(400).json({ status: "ERROR", code: "INVALID_REQUEST", message: error.message });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const historyRows = (await client.query(SELECT_HISTORY_SQL, [gate, date, limit])).rows;
      const historyIds = historyRows.map((row) => row.history_id);
      const movesByHistory = new Map();
      if (historyIds.length > 0) {
        const moveRows = (await client.query(SELECT_HISTORY_MOVES_SQL, [historyIds])).rows;
        for (const move of moveRows) {
          const list = movesByHistory.get(move.history_id) ?? [];
          list.push(formatMoveRow(move));
          movesByHistory.set(move.history_id, list);
        }
      }
      await client.query("COMMIT");
      return res.json({
        status: "OK",
        data: {
          gate,
          date,
          entries: historyRows.map((row) => formatHistoryRow(row, movesByHistory.get(row.history_id) ?? [])),
          schemaReady: true,
        },
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (isSchemaMissingError(error)) {
        return res.json({
          status: "OK",
          data: { gate, date, entries: [], schemaReady: false },
        });
      }
      return res.status(503).json({
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "Unable to load Planning In Gate order history. Please try again.",
      });
    } finally {
      client?.release();
    }
  });

  // Planner write: persist Planning In Gate queue order independently of Capacity Leveling work_plan.
  router.put("/order", verifyPlanner, async (req, res) => {
    res.set("Cache-Control", "no-store");
    let payload;
    try {
      payload = parseSaveOrderPayload(req.body);
    } catch (error) {
      return res.status(400).json({ status: "ERROR", code: "INVALID_REQUEST", message: error.message });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '15s'");
      await client.query("SELECT pg_advisory_xact_lock($1)", [IN_GATE_ORDER_LOCK_KEY]);

      // Verify the referenced Capacity Leveling plan exists and read its authoritative version_no.
      const planRes = await client.query(
        `SELECT plan_id, version_no
         FROM planning.work_plan
         WHERE plan_id = $1 AND deleted_at IS NULL`,
        [payload.planId]
      );
      if (!planRes.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          status: "ERROR",
          code: "PLAN_NOT_FOUND",
          message: "The referenced Capacity Leveling plan is no longer available. Reload and try again.",
        });
      }
      const planVersion = planRes.rows[0].version_no;

      // Read current active In Gate order for (gate_name, planned_date) under lock.
      const existingRes = await client.query(
        `SELECT order_id, revision, card_ids
         FROM planning.in_gate_queue_order
         WHERE gate_name = $1 AND planned_date = $2::date
         FOR UPDATE`,
        [payload.gate, payload.date]
      );
      const existing = existingRes.rows[0] ?? null;
      const currentRevision = existing ? existing.revision : 0;

      if (currentRevision !== payload.baseRevision) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          status: "ERROR",
          code: "ORDER_VERSION_CONFLICT",
          currentRevision,
          message: "Someone else updated the queue order for this gate and date. Reloading the latest order before saving again.",
        });
      }

      const beforeOrder = reconcileBeforeOrder(existing?.card_ids, payload.cardIdsBefore, payload.cardIds);
      let moves = computePositionMoves(beforeOrder, payload.cardIds, payload.items, payload.inactiveCardIds);
      if (moves.length === 0 && payload.inactiveCardIds.length > 0) {
        moves = computePositionMoves(beforeOrder, payload.cardIds, payload.items);
      }
      if (moves.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          status: "ERROR",
          code: "NO_CHANGES",
          message: "No order changes to save.",
        });
      }

      const actor = actorOf(req);
      const nextRevision = currentRevision + 1;
      const orderId = existing ? existing.order_id : randomUUID();
      const historyId = randomUUID();
      let savedOrderRow;

      if (existing) {
        savedOrderRow = (
          await client.query(
            `UPDATE planning.in_gate_queue_order
             SET plan_id = $2,
                 plan_version = $3,
                 revision = $4,
                 card_ids = $5::jsonb,
                 note = $6,
                 updated_by = $7,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1
             RETURNING order_id, gate_name, to_char(planned_date, 'YYYY-MM-DD') AS planned_date,
                       plan_id, plan_version, revision, card_ids, note, updated_by, updated_at`,
            [orderId, payload.planId, planVersion, nextRevision, JSON.stringify(payload.cardIds), payload.reason, actor]
          )
        ).rows[0];
      } else {
        savedOrderRow = (
          await client.query(
            `INSERT INTO planning.in_gate_queue_order (
               order_id, gate_name, planned_date, plan_id, plan_version,
               revision, card_ids, note, updated_by
             )
             VALUES ($1, $2, $3::date, $4, $5, $6, $7::jsonb, $8, $9)
             RETURNING order_id, gate_name, to_char(planned_date, 'YYYY-MM-DD') AS planned_date,
                       plan_id, plan_version, revision, card_ids, note, updated_by, updated_at`,
            [
              orderId,
              payload.gate,
              payload.date,
              payload.planId,
              planVersion,
              nextRevision,
              JSON.stringify(payload.cardIds),
              payload.reason,
              actor,
            ]
          )
        ).rows[0];
      }

      const historyRow = (
        await client.query(
          `INSERT INTO planning.in_gate_queue_order_history (
             history_id, order_id, gate_name, planned_date, plan_id, plan_version,
             revision, card_ids_before, card_ids_after, pushed_out_lots, now_fit_lots,
             reason, saved_by
           )
           VALUES ($1, $2, $3, $4::date, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13)
           RETURNING history_id, order_id, gate_name, to_char(planned_date, 'YYYY-MM-DD') AS planned_date,
                     plan_id, plan_version, revision, pushed_out_lots, now_fit_lots, reason, saved_by, saved_at`,
          [
            historyId,
            orderId,
            payload.gate,
            payload.date,
            payload.planId,
            planVersion,
            nextRevision,
            JSON.stringify(beforeOrder),
            JSON.stringify(payload.cardIds),
            JSON.stringify(payload.pushedOutLots),
            JSON.stringify(payload.nowFitLots),
            payload.reason,
            actor,
          ]
        )
      ).rows[0];

      await client.query(INSERT_MOVES_SQL, [
        historyId,
        moves.map((m) => m.cardId),
        moves.map((m) => m.lotNo),
        moves.map((m) => m.prdName),
        moves.map((m) => m.itemKind),
        moves.map((m) => m.fromPosition),
        moves.map((m) => m.toPosition),
      ]);

      await client.query("COMMIT");

      const formattedMoves = moves.map((m) => ({
        cardId: m.cardId,
        lotId: m.lotNo || (m.itemKind === "need" ? "Need WIP" : "No lot ID"),
        product: m.prdName || "",
        itemKind: m.itemKind,
        from: m.fromPosition,
        to: m.toPosition,
      }));

      return res.json({
        status: "OK",
        message: "Queue order saved.",
        data: {
          order: formatOrderRow(savedOrderRow),
          historyEntry: formatHistoryRow(historyRow, formattedMoves),
        },
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      if (error instanceof ValidationError) {
        return res.status(400).json({ status: "ERROR", code: "INVALID_REQUEST", message: error.message });
      }
      if (isSchemaMissingError(error)) {
        return res.status(503).json({
          status: "ERROR",
          code: "SCHEMA_NOT_READY",
          message: "Planning In Gate queue order tables are not set up yet. Run python manage.py planning_in_gate_order first.",
        });
      }
      return res.status(503).json({
        status: "ERROR",
        code: "UNAVAILABLE",
        message: "Unable to save Planning In Gate queue order. Nothing was changed.",
      });
    } finally {
      client?.release();
    }
  });

  return router;
}

module.exports = {
  createInGateOrderRouter,
  parseSaveOrderPayload,
  reconcileBeforeOrder,
  computePositionMoves,
  inferItemMeta,
  IN_GATE_ORDER_LOCK_KEY,
};
