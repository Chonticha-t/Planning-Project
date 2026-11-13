const express = require("express");

const CATEGORIES = new Set(["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"]);
const MAX_GROUPS = 20000;
const PAGE_SIZE = 100;
const SCOPE_SQL = `FROM planning.gate_output_log
  WHERE work_date >= $1::date AND work_date < $1::date + INTERVAL '1 month'
    AND ($2::text = 'ALL' OR process_group = $2)
    AND ($3::text = '' OR STRPOS(LOWER(prd_name), LOWER($3)) > 0 OR STRPOS(LOWER(lot_no), LOWER($3)) > 0)
    AND recorded_at <= $4::timestamptz AND out_at <= $4::timestamptz`;
const SUMMARY_SQL = `SELECT gate_name AS gate, prd_name AS product, work_date::text AS date, shift,
  COUNT(*)::integer AS lots,
  CASE WHEN COUNT(qty_pcs) = COUNT(*) THEN SUM(qty_pcs)::text END AS pcs,
  CASE WHEN COUNT(qty_sheets) = COUNT(*) THEN SUM(qty_sheets)::text END AS sheets
  ${SCOPE_SQL}
  GROUP BY gate_name, prd_name, work_date, shift
  ORDER BY gate_name, prd_name, work_date, shift LIMIT ${MAX_GROUPS + 1}`;
const META_SQL = `SELECT MIN(recorded_at) AS first_recorded_at, MAX(recorded_at) AS last_recorded_at,
  COALESCE(JSONB_AGG(DISTINCT JSONB_BUILD_OBJECT('timeZone', source_timezone,
    'dayStart', day_start::text, 'nightStart', night_start::text)), '[]'::jsonb) AS rules
  ${SCOPE_SQL}`;
const LOTS_SQL = `SELECT output_id::text AS id, prd_name AS product, lot_no AS lot,
  gate_name AS gate, next_gate AS "nextGate", work_date::text AS date, shift,
  out_at AS "outAt", qty_pcs::text AS pcs, qty_sheets::text AS sheets,
  source_timezone AS "timeZone"
  ${SCOPE_SQL}
    AND gate_name = $5 AND work_date = $6::date
    AND ($7::text IS NULL OR prd_name = $7)
    AND ($8::bigint IS NULL OR output_id < $8::bigint)
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
  return { month, category, search: textValue(query.search, 150, true) };
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

function createMonthlyOutputRouter({ pool }) {
  const router = express.Router();
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
        params = [`${scope.month}-01`, scope.category, scope.search, checkedAt, gate, date, product, cursor];
      } else params = [`${scope.month}-01`, scope.category, scope.search, checkedAt];
    } catch {
      return res.status(400).json({ code: "INVALID_QUERY", message: "Choose a valid month, category and output selection." });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      let data;
      if (details) {
        const records = (await client.query(LOTS_SQL, params)).rows;
        const rows = records.slice(0, PAGE_SIZE).map(row => ({ ...row, pcs: quantity(row.pcs), sheets: quantity(row.sheets) }));
        data = { ...scope, checkedAt, rows, nextCursor: records.length > PAGE_SIZE ? rows.at(-1).id : null };
      } else {
        const records = (await client.query(SUMMARY_SQL, params)).rows;
        if (records.length > MAX_GROUPS) throw new Error("OUTPUT_LIMIT");
        const meta = (await client.query(META_SQL, params)).rows[0];
        const dates = new Set(meta.rules.map(rule => workDate(now, rule)));
        const rows = records.map(row => ({ ...row, pcs: quantity(row.pcs), sheets: quantity(row.sheets) }));
        data = { ...scope, checkedAt, coverage: "observed_only", rows,
          workToday: dates.size === 1 ? [...dates][0] : null,
          firstRecordedAt: meta.first_recorded_at, lastRecordedAt: meta.last_recorded_at, shiftRules: meta.rules };
      }
      await client.query("COMMIT");
      return res.json({ status: "OK", data });
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return res.status(503).json({ code: "OUTPUT_UNAVAILABLE", message: "Observed output is unavailable. Please retry or narrow your search." });
    } finally { client?.release(); }
  };
  router.get("/month", handler(false));
  router.get("/lots", handler(true));
  return router;
}

module.exports = { createMonthlyOutputRouter, parseScope, workDate, SUMMARY_SQL, LOTS_SQL };
