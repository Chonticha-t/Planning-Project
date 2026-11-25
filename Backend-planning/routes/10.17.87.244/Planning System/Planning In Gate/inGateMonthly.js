const express = require("express");

const CATEGORIES = new Set(["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"]);
const FPC_GATES_SQL = "ARRAY['FFPC','FVAC','FADL','FIN','W/H']";
const SMT_GATES_SQL = "ARRAY['MFPC','MMOT','MBLK','MFIN','MW/H']";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_GROUPS = 20000;
const PAGE_SIZE = 100;
const SCOPE_SQL = `FROM planning.gate_output_log
  WHERE work_date >= $1::date AND work_date < $1::date + INTERVAL '1 month'
    AND (
      $2::text = 'ALL'
      OR ($2::text = 'SMT' AND (gate_name = ANY(${SMT_GATES_SQL}) OR (gate_name <> ALL(${FPC_GATES_SQL}) AND process_group = 'SMT')))
      OR ($2::text IN ('EFPC_GEN', 'EFPC_AUTO') AND gate_name <> ALL(${SMT_GATES_SQL}) AND process_group = $2)
    )
    AND ($3::text = '' OR STRPOS(LOWER(prd_name), LOWER($3)) > 0 OR STRPOS(LOWER(lot_no), LOWER($3)) > 0)
    AND recorded_at <= $4::timestamptz AND out_at <= $4::timestamptz`;
const PLAN_FILTER_SQL = `AND EXISTS (
    SELECT 1 FROM planned_in_month pm
    WHERE pm.lot_no = planning.gate_output_log.lot_no AND pm.gate_name = planning.gate_output_log.gate_name
  )`;
const planCte = (paramRef, legacy = false) => legacy ? `WITH active_plan AS (
    SELECT baseline_snapshot->'viewSnapshot'->'data'->'cards' AS cards
    FROM planning.work_plan
    WHERE plan_id = ${paramRef}::uuid AND deleted_at IS NULL
      AND jsonb_typeof(baseline_snapshot->'viewSnapshot'->'data'->'cards') = 'array'
  ), planned_in_month AS (
    SELECT DISTINCT BTRIM(c->>'lotNo') AS lot_no, BTRIM(c->>'gate') AS gate_name
    FROM active_plan p, jsonb_array_elements(p.cards) AS c
    WHERE c->>'kind' = 'lot'
      AND (c->>'plannedDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND LEFT(c->>'plannedDate', 7) = LEFT($1::text, 7)
      AND NULLIF(BTRIM(c->>'lotNo'), '') IS NOT NULL
      AND NULLIF(BTRIM(c->>'gate'), '') IS NOT NULL
  )` : `WITH active_plan AS (
    SELECT plan_id FROM planning.work_plan WHERE plan_id = ${paramRef}::uuid AND deleted_at IS NULL
  ), indexed_planned AS (
    SELECT DISTINCT c.lot_no, c.gate_name
    FROM active_plan p
    JOIN planning.work_plan_lot_card c ON c.plan_id = p.plan_id
    WHERE c.planned_date >= $1::date AND c.planned_date < $1::date + INTERVAL '1 month'
  ), unindexed_plan AS (
    SELECT w.baseline_snapshot->'viewSnapshot'->'data'->'cards' AS cards
    FROM active_plan p
    JOIN planning.work_plan w ON w.plan_id = p.plan_id
    WHERE NOT EXISTS (SELECT 1 FROM planning.work_plan_lot_card c WHERE c.plan_id = p.plan_id)
      AND jsonb_typeof(w.baseline_snapshot->'viewSnapshot'->'data'->'cards') = 'array'
  ), planned_in_month AS (
    SELECT lot_no, gate_name FROM indexed_planned
    UNION
    SELECT DISTINCT BTRIM(c->>'lotNo') AS lot_no, BTRIM(c->>'gate') AS gate_name
    FROM unindexed_plan p, jsonb_array_elements(p.cards) AS c
    WHERE c->>'kind' = 'lot'
      AND (c->>'plannedDate') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND LEFT(c->>'plannedDate', 7) = LEFT($1::text, 7)
      AND NULLIF(BTRIM(c->>'lotNo'), '') IS NOT NULL
      AND NULLIF(BTRIM(c->>'gate'), '') IS NOT NULL
  )`;
const SUMMARY_SQL = `SELECT gate_name AS gate, prd_name AS product, work_date::text AS date, shift,
  COUNT(*)::integer AS lots,
  CASE WHEN COUNT(qty_pcs) = COUNT(*) THEN SUM(qty_pcs)::text END AS pcs,
  CASE WHEN COUNT(qty_sheets) = COUNT(*) THEN SUM(qty_sheets)::text END AS sheets
  ${SCOPE_SQL}
  GROUP BY gate_name, prd_name, work_date, shift
  ORDER BY gate_name, prd_name, work_date, shift LIMIT ${MAX_GROUPS + 1}`;
const planSummarySql = (legacy = false) => `${planCte("$5", legacy)}
  SELECT gate_name AS gate, prd_name AS product, work_date::text AS date, shift,
  COUNT(*)::integer AS lots,
  CASE WHEN COUNT(qty_pcs) = COUNT(*) THEN SUM(qty_pcs)::text END AS pcs,
  CASE WHEN COUNT(qty_sheets) = COUNT(*) THEN SUM(qty_sheets)::text END AS sheets
  ${SCOPE_SQL}
  ${PLAN_FILTER_SQL}
  GROUP BY gate_name, prd_name, work_date, shift
  ORDER BY gate_name, prd_name, work_date, shift LIMIT ${MAX_GROUPS + 1}`;
const META_SQL = `SELECT MIN(recorded_at) AS first_recorded_at, MAX(recorded_at) AS last_recorded_at,
  COALESCE(JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('timeZone', source_timezone,
    'dayStart', day_start::text, 'nightStart', night_start::text)), '[]'::jsonb) AS rules
  ${SCOPE_SQL}`;
const planMetaSql = (legacy = false) => `${planCte("$5", legacy)}
  SELECT MIN(recorded_at) AS first_recorded_at, MAX(recorded_at) AS last_recorded_at,
  COALESCE(JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('timeZone', source_timezone,
    'dayStart', day_start::text, 'nightStart', night_start::text)), '[]'::jsonb) AS rules
  ${SCOPE_SQL}
  ${PLAN_FILTER_SQL}`;
const LOTS_SQL = `SELECT output_id::text AS id, prd_name AS product, lot_no AS lot,
  gate_name AS gate, next_gate AS "nextGate", work_date::text AS date, shift,
  out_at AS "outAt", qty_pcs::text AS pcs, qty_sheets::text AS sheets,
  source_timezone AS "timeZone"
  ${SCOPE_SQL}
    AND gate_name = $5 AND work_date = $6::date
    AND ($7::text IS NULL OR prd_name = $7)
    AND ($8::bigint IS NULL OR output_id < $8::bigint)
  ORDER BY output_id DESC LIMIT ${PAGE_SIZE + 1}`;
const planLotsSql = (legacy = false) => `${planCte("$9", legacy)}
  SELECT output_id::text AS id, prd_name AS product, lot_no AS lot,
  gate_name AS gate, next_gate AS "nextGate", work_date::text AS date, shift,
  out_at AS "outAt", qty_pcs::text AS pcs, qty_sheets::text AS sheets,
  source_timezone AS "timeZone"
  ${SCOPE_SQL}
    AND gate_name = $5 AND work_date = $6::date
    AND ($7::text IS NULL OR prd_name = $7)
    AND ($8::bigint IS NULL OR output_id < $8::bigint)
    ${PLAN_FILTER_SQL}
  ORDER BY output_id DESC LIMIT ${PAGE_SIZE + 1}`;

function textValue(value, max, optional = false) {
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw new Error("INVALID_QUERY");
  return value.trim();
}

function parseScope(query) {
  const month = textValue(query.month, 7);
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("INVALID_QUERY");
  const category = query.category === undefined ? "ALL" : query.category;
  if (!CATEGORIES.has(category)) throw new Error("INVALID_QUERY");
  const rawPlanId = query.planId === undefined ? "" : textValue(query.planId, 36);
  if (rawPlanId && !UUID_RE.test(rawPlanId)) throw new Error("INVALID_QUERY");
  return {
    month,
    category,
    search: textValue(query.search, 150, true),
    ...(rawPlanId ? { planId: rawPlanId } : {}),
  };
}

function quantity(value) {
  if (value === null) return null;
  const result = Number(value);
  if (value === "" || !Number.isFinite(result) || result < 0 || result > Number.MAX_SAFE_INTEGER) throw new Error("INVALID_QUANTITY");
  return result;
}

function workDate(now, rule) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: rule.timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  if (`${parts.hour}:${parts.minute}:${parts.second}` >= rule.dayStart) return localDate;
  const previous = new Date(`${localDate}T00:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function createMonthlyOutputRouter({ pool, cache }) {
  const router = express.Router();
  const load = async (details, scope, params, checkedAt, now) => {
    let client;
    const beginReadOnly = async () => {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
    };
    const executeBody = async (legacy) => {
      if (details) {
        const sql = scope.planId ? planLotsSql(legacy) : LOTS_SQL;
        const records = (await client.query(sql, params)).rows;
        const rows = records.slice(0, PAGE_SIZE).map(row => ({ ...row, pcs: quantity(row.pcs), sheets: quantity(row.sheets) }));
        return { ...scope, checkedAt, rows, nextCursor: records.length > PAGE_SIZE ? rows.at(-1).id : null };
      }
      const summarySql = scope.planId ? planSummarySql(legacy) : SUMMARY_SQL;
      const metaSql = scope.planId ? planMetaSql(legacy) : META_SQL;
      const records = (await client.query(summarySql, params)).rows;
      if (records.length > MAX_GROUPS) throw new Error("OUTPUT_LIMIT");
      const meta = (await client.query(metaSql, params)).rows[0];
      const dates = new Set(meta.rules.map(rule => workDate(now, rule)));
      const rows = records.map(row => ({ ...row, pcs: quantity(row.pcs), sheets: quantity(row.sheets) }));
      return { ...scope, checkedAt, coverage: "observed_only", rows,
        workToday: dates.size === 1 ? [...dates][0] : null,
        firstRecordedAt: meta.first_recorded_at, lastRecordedAt: meta.last_recorded_at, shiftRules: meta.rules };
    };
    try {
      client = await pool.connect();
      await beginReadOnly();
      let data;
      try {
        data = await executeBody(false);
      } catch (queryError) {
        if (!scope.planId || queryError?.code !== "42P01") throw queryError;
        await client.query("ROLLBACK");
        await beginReadOnly();
        data = await executeBody(true);
      }
      await client.query("COMMIT");
      return data;
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { client?.release(); }
  };
  // Follow the existing read-only Viewer access policy used by routing and saved plans.
  const handler = details => async (req, res) => {
    res.set("Cache-Control", "no-store");
    let scope, params;
    const now = new Date();
    let checkedAt = now.toISOString();
    try {
      scope = parseScope(req.query);
      if (details) {
        const gate = textValue(req.query.gate, 100);
        const date = textValue(req.query.date, 10);
        if (!gate || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !date.startsWith(`${scope.month}-`)
          || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
          || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("INVALID_QUERY");
        const product = req.query.product === undefined ? null : textValue(req.query.product, 150);
        if (product === "") throw new Error("INVALID_QUERY");
        const cursor = req.query.cursor === undefined ? null : textValue(req.query.cursor, 19);
        if (cursor !== null && (!/^[1-9]\d{0,18}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n)) throw new Error("INVALID_QUERY");
        checkedAt = textValue(req.query.asOf, 30);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(checkedAt)
          || !Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString() !== checkedAt
          || Date.parse(checkedAt) > now.getTime()) throw new Error("INVALID_QUERY");
        params = [`${scope.month}-01`, scope.category, scope.search, checkedAt, gate, date, product, cursor,
          ...(scope.planId ? [scope.planId] : [])];
      } else {
        params = [`${scope.month}-01`, scope.category, scope.search, checkedAt,
          ...(scope.planId ? [scope.planId] : [])];
      }
    } catch {
      return res.status(400).json({ code: "INVALID_QUERY", message: "Choose a valid month, category and output selection." });
    }
    try {
      const read = () => load(details, scope, params, checkedAt, now);
      if (details || !cache) return res.json({ status: "OK", data: await read() });
      const key = JSON.stringify([scope.month, scope.category, scope.search, scope.planId ?? null]);
      const result = await cache.read(key, read, { force: req.query.refresh === "true" });
      res.set("X-In-Gate-Cache", result.status);
      return res.json({ status: "OK", data: result.value });
    } catch {
      return res.status(503).json({ code: "OUTPUT_UNAVAILABLE", message: "Observed output is unavailable. Please retry or narrow your search." });
    }
  };
  router.get("/month", handler(false));
  router.get("/lots", handler(true));
  return router;
}

module.exports = { createMonthlyOutputRouter, parseScope, workDate, SUMMARY_SQL, LOTS_SQL };
