const express = require("express");
const { randomUUID, createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { createGateTableCache } = require("../Planning Summary Gate/gateTableCache");
const { createCapacityLoadProfiler } = require("./capacityLoadPerformance");
const { createPresenceRouter } = require("./capacityLevelingPresence");
const { buildLevelingView } = require("./capacityLevelingView");
const { buildSavedMoveHistory } = require("./capacityLevelingHistory");
const {
  LEVELING_GATES, SHIFTS, NORMAL_VALID_FROM, NORMAL_VALID_TO, ValidationError,
  isDate, dayCapacity, buildCapacityConfig, parseSettingsPayload, sameShift,
  arrivalWorkKey, buildArrivalCards, arrivalEndDate, parsePlanPayload, resolveBoardCardOrder,
} = require("./capacityLeveling");

// Arrival dates must never reuse plans saved as release dates.
const PLAN_METHOD = "gate_arrival_max_target_v1";
const LEGACY_PLAN_METHODS = ["gate_max_target_occupancy_v1", "gate_segment_target_uph_v1"];
const PLAN_LOCK_KEY = 0x504c4e4c564c; // Serializes capacity and plan writers.
const MAX_RANGE_DAYS = 62;
// Special days older than this are kept on record but no longer read or edited.
const SPECIAL_WINDOW_DAYS = 62;

const SETTINGS_SQL = `
  SELECT setting_id, gate_name, shift_code, setting_kind, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
         is_working_day, resource_count, manpower, regular_minutes_per_shift::float8, ot_enabled,
         ot_minutes_per_shift::float8, break1_enabled, break1_minutes::float8, break2_enabled,
         break2_minutes::float8, lunch_enabled, lunch_minutes::float8, efficiency::float8
  FROM planning.capacity_setting
  WHERE is_active AND resource_group = 'ALL' AND gate_name = ANY($1)
    AND (setting_kind = 'normal' OR valid_from >= CURRENT_DATE - ${SPECIAL_WINDOW_DAYS})`;

const INSERT_SETTING_SQL = `
  INSERT INTO planning.capacity_setting (
    setting_id, gate_name, resource_group, resource_unit, setting_kind, valid_from, valid_to,
    shift_code, is_working_day, resource_count, manpower, regular_minutes_per_shift, ot_enabled,
    ot_minutes_per_shift, break1_enabled, break1_minutes, break2_enabled, break2_minutes,
    lunch_enabled, lunch_minutes, efficiency, created_by
  ) VALUES ($1, $2, 'ALL', 'machine', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`;

const settingParams = (gate, code, kind, from, to, shift, actor) => [
  randomUUID(), gate, kind, from, to, code, shift.enabled, shift.mcLines, shift.manpower, shift.minPerShift,
  shift.otEnabled, shift.otMinutes, shift.break1, shift.break1Min, shift.break2, shift.break2Min,
  shift.lunch, shift.lunchMin, shift.efficiency, actor,
];

// Summary Gate already resolves the routing-specific lead time from the gate master.
// Keep every allocation for the arrival grid; board cards group the same physical lot and source arrival date.
const WORKS_SQL = `
  WITH base AS (
    SELECT g.*,
           LAG(g.gate_name) OVER w AS prev_gate,
           LAG(g.must_out) OVER w AS prev_must_out,
           LAG(g.arrive_by) OVER w AS prev_arrive_by,
           LEAD(g.arrive_by) OVER w AS next_arrive_by,
           LEAD(g.must_out) OVER w AS next_must_out
    FROM planning.planning_summary_gate g
    WINDOW w AS (PARTITION BY g.prd_name, g.lot_no, g.due_date, g.status, g.pri ORDER BY g.gate_order)
  ), works AS (
    SELECT ROW_NUMBER() OVER (ORDER BY gate_order, pri) AS rn, *
    FROM base
    WHERE gate_name = ANY($1) AND gate_state <> 'passed'
  )
  SELECT w.pri, w.gate_order, to_jsonb(w)->>'po_no' AS po_no,
         w.prd_name, w.item, w.lot_no, to_char(w.due_date, 'YYYY-MM-DD') AS due_date, w.status,
         w.pcs_per_sheet::float8 AS pcs_per_sheet,
         w.qty::float8 AS qty, CEIL(w.qty / NULLIF(w.pcs_per_sheet, 0))::float8 AS sheets,
         w.gate_name, w.gate_state, w.process_group, w.prd_category, w.current_gate, w.proc_disp, w.is_hold,
         w.rem_proc_in_gate,
         to_char(w.arrive_by, 'YYYY-MM-DD') AS arrive_by, to_char(w.must_out, 'YYYY-MM-DD') AS must_out,
         to_char(w.prev_arrive_by, 'YYYY-MM-DD') AS prev_arrive_by,
         to_char(w.next_arrive_by, 'YYYY-MM-DD') AS next_arrive_by,
         w.prev_gate, to_char(w.prev_must_out, 'YYYY-MM-DD') AS prev_must_out,
         w.next_gate, to_char(w.next_must_out, 'YYYY-MM-DD') AS next_must_out,
         w.lead_days
  FROM works w
  ORDER BY w.rn`;

const LATEST_PLAN_SQL = `
  SELECT plan_id, plan_group_id, version_no, note, created_by,
         baseline_snapshot->'boardCardOrder' AS board_card_order,
         baseline_snapshot->'moveHistory' AS move_history,
         to_char(created_at, 'YYYY-MM-DD HH24:MI') AS saved_at
  FROM planning.work_plan
  WHERE calculation_method = $1
  ORDER BY version_no DESC
  LIMIT 1`;

const MOVES_SQL = `
  SELECT work_key, gate_name, prd_name, lot_no, to_char(due_date, 'YYYY-MM-DD') AS due_date,
         to_char(original_date, 'YYYY-MM-DD') AS original_date, to_char(planned_date, 'YYYY-MM-DD') AS planned_date
  FROM planning.work_plan_gate_item
  WHERE plan_id = $1`;

const planInfo = (row) => (row ? {
  planId: row.plan_id, version: row.version_no, note: row.note, savedBy: row.created_by, savedAt: row.saved_at,
} : null);

// The highest version stays active: only older versions may be soft-deleted.
// Include deleted versions when determining the head so version numbers are never reused.
const HISTORY_COLUMNS = `p.plan_id, p.version_no, p.note, p.created_by,
  (p.baseline_snapshot->'viewSnapshot'->>'version' = '1') AS has_snapshot,
  to_char(p.created_at, 'YYYY-MM-DD HH24:MI') AS saved_at,
  (SELECT head.plan_id FROM planning.work_plan head
   WHERE head.calculation_method = $1 ORDER BY head.version_no DESC LIMIT 1) AS current_plan_id`;
const historyInfo = (row) => ({ ...planInfo(row), isActive: row.plan_id === row.current_plan_id, hasSnapshot: Boolean(row.has_snapshot) });
const isPlanId = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const createCapacityLevelingRouter = ({ pool, verifyPlanner, loadCalendar, cacheOptions = {}, logLoadPerformance }) => {
  const router = express.Router();
  const configuredTtl = Number(process.env.PLANNING_CAPACITY_CACHE_TTL_MS ?? 60000);
  const configuredMb = Number(process.env.PLANNING_CAPACITY_CACHE_MAX_MB ?? 128);
  const loadCache = createGateTableCache({
    ttlMs: Number.isFinite(configuredTtl) && configuredTtl >= 0 ? configuredTtl : 60000,
    maxBytes: (Number.isFinite(configuredMb) && configuredMb >= 0 ? configuredMb : 128) * 1024 * 1024,
    ...cacheOptions,
  });
  router.use(createPresenceRouter({ pool, verifyPlanner }));
  const capacityRevision = (gates) => createHash("sha256").update(JSON.stringify(gates, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value)).digest("hex");

  const fail = (res, error, message) => {
    res.set("Cache-Control", "no-store");
    if (error instanceof ValidationError) {
      return res.status(400).json({ status: "ERROR", code: "INVALID_REQUEST", message: error.message });
    }
    // 42P01 / 42703: the capacity tables have not been created or upgraded yet.
    if (error?.code === "42P01" || error?.code === "42703") {
      return res.status(503).json({ status: "ERROR", code: "SCHEMA_NOT_READY",
        message: "Capacity tables are not set up yet. Run the planning_in_gate_test setup command first." });
    }
    return res.status(503).json({ status: "ERROR", code: "UNAVAILABLE", message });
  };

  const inTransaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [PLAN_LOCK_KEY]);
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  const readConfig = async (db) => buildCapacityConfig((await db.query(SETTINGS_SQL, [LEVELING_GATES])).rows);
  const actorOf = (req) => String(req.user?.username || "admin").slice(0, 150);

  const historyFail = (res, error) => {
    if (error?.code === "42703") {
      return res.status(503).json({ status: "ERROR", code: "HISTORY_SCHEMA_NOT_READY",
        message: "Plan history is not set up yet. Run the updated planning_in_gate_test setup command." });
    }
    return fail(res, error, "Unable to access plan history. Please try again.");
  };

  router.get("/plans", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const before = req.query.before;
      if (before !== undefined && (typeof before !== "string" || !/^[1-9]\d*$/.test(before) ||
        !Number.isSafeInteger(Number(before)) || Number(before) > 2147483647)) {
        throw new ValidationError("The history cursor is invalid.");
      }
      const { rows } = await pool.query(`SELECT ${HISTORY_COLUMNS}
        FROM planning.work_plan p
        WHERE p.calculation_method = $1 AND p.deleted_at IS NULL
          AND ($2::integer IS NULL OR p.version_no < $2)
        ORDER BY p.version_no DESC LIMIT 51`, [PLAN_METHOD, before === undefined ? null : Number(before)]);
      return res.json({ status: "OK", data: {
        plans: rows.slice(0, 50).map(historyInfo),
        nextBefore: rows.length > 50 ? rows[49].version_no : null,
      } });
    } catch (error) {
      return historyFail(res, error);
    }
  });

  router.get("/plans/:planId", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!isPlanId(req.params.planId)) throw new ValidationError("The plan ID is invalid.");
      const { rows } = await pool.query(`SELECT ${HISTORY_COLUMNS},
          p.baseline_snapshot->'boardCardOrder' AS board_card_order,
          p.baseline_snapshot->'viewSnapshot' AS view_snapshot
        FROM planning.work_plan p
        WHERE p.calculation_method = $1 AND p.plan_id = $2 AND p.deleted_at IS NULL`,
      [PLAN_METHOD, req.params.planId]);
      if (!rows.length) return res.status(404).json({ status: "ERROR", code: "PLAN_NOT_FOUND",
        message: "This plan was deleted or is no longer available." });
      const moves = (await pool.query(MOVES_SQL, [req.params.planId])).rows;
      return res.json({ status: "OK", data: {
        plan: historyInfo(rows[0]),
        moves: moves.map((move) => ({ workKey: move.work_key, gate: move.gate_name,
          prdName: move.prd_name, lotNo: move.lot_no, dueDate: move.due_date,
          originalDate: move.original_date, plannedDate: move.planned_date })),
        boardCardOrder: rows[0].board_card_order ?? [],
        snapshot: rows[0].view_snapshot?.version === 1 && rows[0].view_snapshot?.data
          ? { ...rows[0].view_snapshot.data, plan: planInfo(rows[0]) } : null,
      } });
    } catch (error) {
      return historyFail(res, error);
    }
  });

  router.delete("/plans/:planId", verifyPlanner, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      if (!isPlanId(req.params.planId)) throw new ValidationError("The plan ID is invalid.");
      const outcome = await inTransaction(async (client) => {
        const latest = (await client.query(LATEST_PLAN_SQL, [PLAN_METHOD])).rows[0];
        if (latest?.plan_id === req.params.planId) return "ACTIVE_PLAN";
        const { rows } = await client.query(`UPDATE planning.work_plan
          SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $3
          WHERE calculation_method = $1 AND plan_id = $2 AND deleted_at IS NULL
          RETURNING plan_id`, [PLAN_METHOD, req.params.planId, actorOf(req)]);
        return rows.length ? "DELETED" : "PLAN_NOT_FOUND";
      });
      if (outcome === "ACTIVE_PLAN") return res.status(409).json({ status: "ERROR", code: outcome,
        message: "The active plan cannot be deleted. Only older versions can be deleted." });
      if (outcome === "PLAN_NOT_FOUND") return res.status(404).json({ status: "ERROR", code: outcome,
        message: "This plan was deleted or is no longer available." });
      loadCache.invalidate();
      return res.json({ status: "OK", message: "Plan removed from history. The active plan is unchanged." });
    } catch (error) {
      return historyFail(res, error);
    }
  });

  router.get("/capacity", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const gates = await readConfig(pool);
      return res.json({ status: "OK", data: { gates, revision: capacityRevision(gates) } });
    } catch (error) {
      return fail(res, error, "Unable to load capacity settings. Please try again.");
    }
  });

  // Changed shifts are retired and re-inserted so earlier settings stay on record. Special days
  // are saved in the same transaction: a day type per date, for that gate and shift only.
  router.put("/capacity", verifyPlanner, async (req, res) => {
    try {
      const gates = parseSettingsPayload(req.body);
      const config = await inTransaction(async (client) => {
        const current = await readConfig(client);
        if (req.body.baseRevision !== undefined && req.body.baseRevision !== capacityRevision(current)) {
          const error = new Error("Someone updated capacity settings. Reopen Capacity Configuration to load the latest settings before saving again.");
          error.code = "CAPACITY_VERSION_CONFLICT";
          throw error;
        }
        for (const gate of gates) {
          const existing = current.find((item) => item.gate === gate.gate);
          for (const code of SHIFTS) {
            const before = existing.shifts[code];
            const { specialDays, ...after } = gate.shifts[code];
            if (!before.settingId || !sameShift(before, after)) {
              if (before.settingId) {
                await client.query(`UPDATE planning.capacity_setting SET is_active = false, updated_at = CURRENT_TIMESTAMP
                  WHERE setting_id = $1`, [before.settingId]);
              }
              await client.query(INSERT_SETTING_SQL, settingParams(
                gate.gate, code, "normal", NORMAL_VALID_FROM, NORMAL_VALID_TO, after, actorOf(req)));
            }
            if (!specialDays) continue;
            const changed = [...new Set([...Object.keys(before.specialDays), ...Object.keys(specialDays)])]
              .filter((date) => before.specialDays[date] !== specialDays[date]);
            if (changed.length) {
              await client.query(`UPDATE planning.capacity_setting SET is_active = false, updated_at = CURRENT_TIMESTAMP
                WHERE is_active AND setting_kind = 'exception' AND resource_group = 'ALL'
                  AND gate_name = $1 AND shift_code = $2 AND valid_from = ANY($3::date[])`, [gate.gate, code, changed]);
            }
            for (const date of changed.filter((day) => specialDays[day])) {
              // The table needs a complete row; only the day type is read back from it.
              const row = { ...after, enabled: specialDays[date] !== "off", otEnabled: specialDays[date] === "ot" };
              await client.query(INSERT_SETTING_SQL, settingParams(gate.gate, code, "exception", date, date, row, actorOf(req)));
            }
          }
        }
        return readConfig(client);
      });
      loadCache.invalidate();
      return res.json({ status: "OK", data: { gates: config, revision: capacityRevision(config) }, message: "Capacity settings saved." });
    } catch (error) {
      if (error.code === "CAPACITY_VERSION_CONFLICT") return res.status(409).json({ status: "ERROR", code: error.code, message: error.message });
      return fail(res, error, "Unable to save capacity settings. Nothing was changed.");
    }
  });

  // Capacity per gate and day plus one card per work item and gate, with the latest saved plan applied.
  router.get("/load", async (req, res) => {
    res.set("Cache-Control", "no-store");
    const profile = createCapacityLoadProfiler(res, pool, { log: logLoadPerformance });
    const db = profile.db;
    try {
      const today = (await db.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
      const start = typeof req.query.startdate === "string" && req.query.startdate ? req.query.startdate : today;
      if (!isDate(start)) throw new ValidationError("The start date is invalid.");
      // Two weeks by default.
      const end = typeof req.query.stopdate === "string" && req.query.stopdate
        ? req.query.stopdate
        : new Date(Date.parse(`${start}T00:00:00Z`) + 13 * 86400000).toISOString().slice(0, 10);
      if (!isDate(end) || end < start ||
        Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`) > (MAX_RANGE_DAYS - 1) * 86400000) {
        throw new ValidationError(`A valid date range of up to ${MAX_RANGE_DAYS} days is required.`);
      }
      // Small dependency reads stay fresh, including changes made by another backend process.
      const [config, plan] = await Promise.all([
        readConfig(db),
        db.query(LATEST_PLAN_SQL, [PLAN_METHOD]),
      ]);
      const latest = plan.rows[0];
      const force = req.query.refresh === "true";
      const key = JSON.stringify([today, start, end, capacityRevision(config), latest?.plan_id ?? null, latest?.version_no ?? 0]);
      const reading = performance.now();
      const cached = await loadCache.read(key, async () => {
        const [works, moves, legacy] = await Promise.all([
          db.query(WORKS_SQL, [LEVELING_GATES]),
          latest ? db.query(MOVES_SQL, [latest.plan_id]).then(result => result.rows) : [],
          latest ? false : Promise.all(LEGACY_PLAN_METHODS.map(method => db.query(LATEST_PLAN_SQL, [method])))
            .then(results => results.some(result => result.rows.length > 0)),
        ]);
        return buildLevelingView({ sourceRows: works.rows, moves, config, today, start, end,
          loadCalendar: force ? (from, to) => loadCalendar(from, to, { force: true }) : loadCalendar,
          history: latest?.move_history, order: latest?.board_card_order,
          plan: planInfo(latest), legacy, calculationMethod: PLAN_METHOD });
      }, { force });
      profile.cache(cached, performance.now() - reading);
      res.set("X-Capacity-Cache", cached.status);
      res.set("X-Capacity-Cache-Reason", cached.reason);
      res.set("X-Capacity-Cache-Age-Ms", String(cached.ageMs));
      return profile.json({ status: "OK", data: cached.value });
    } catch (error) {
      return fail(res, error, "Unable to load gate capacity data. Please try again.");
    }
  });

  // Every immutable version stores date overrides and the shared gate/day card order.
  router.post("/plan", verifyPlanner, async (req, res) => {
    try {
      const today = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
      if (req.body?.calculationMethod !== PLAN_METHOD) throw new ValidationError("Reload the page before saving an arrival plan. Release-date clients are not supported.");
      const { baseVersion, note, moves, boardCardOrder } = parsePlanPayload(req.body, today);
      const outcome = await inTransaction(async (client) => {
        const latest = (await client.query(LATEST_PLAN_SQL, [PLAN_METHOD])).rows[0];
        if ((latest?.version_no ?? 0) !== baseVersion) return { conflict: "PLAN_VERSION_CONFLICT" };
        const sourceRows = (await client.query(WORKS_SQL, [LEVELING_GATES])).rows;
        const config = await readConfig(client);
        const { cards } = buildArrivalCards(sourceRows, [], today, config);
        const source = new Map(cards.map((card) => [`${card.workKey}|${card.gate}`, card]));
        const missing = moves.filter((move) => !source.has(`${move.workKey}|${move.gate}`));
        if (missing.length) return { conflict: "WORK_NOT_FOUND", missing: missing.length };
        const gateConfig = new Map(config.map((gate) => [gate.gate, gate]));
        if (moves.length) {
          const moving = moves.map((move) => source.get(`${move.workKey}|${move.gate}`));
          if (moving.some((card) => !card.leadDays || card.loadMin === null || card.kind === "unidentified")) {
            throw new ValidationError("Moved arrivals require valid lead times, normal minutes and a lot or Need WIP identity.");
          }
          const allDates = [today, ...cards.map((card) => card.baseDate), ...moves.map((move) => move.plannedDate)].sort();
          const maxLead = cards.reduce((max, card) => Math.max(max, card.leadDays || 1), 1);
          const calendarEnd = new Date(Date.parse(`${allDates.at(-1)}T00:00:00Z`) + (maxLead * 7 + 14) * 86400000).toISOString().slice(0, 10);
          if (Date.parse(`${calendarEnd}T00:00:00Z`) - Date.parse(`${allDates[0]}T00:00:00Z`) > 3660 * 86400000) {
            throw new ValidationError("The planned arrival exceeds the supported calendar range.");
          }
          const { calendar } = await loadCalendar(allDates[0], calendarEnd);
          const proposed = new Map(moves.map((move) => [`${move.workKey}|${move.gate}`, move.plannedDate]));
          const arrivalOf = (card) => proposed.get(`${card.workKey}|${card.gate}`) || card.baseDate;
          for (const move of moves) {
            const card = source.get(`${move.workKey}|${move.gate}`);
            if (dayCapacity(gateConfig.get(move.gate), move.plannedDate, calendar.isWorking(move.plannedDate)).off) {
              throw new ValidationError("Choose an open gate day for every planned arrival.");
            }
            const end = arrivalEndDate(move.plannedDate, card.leadDays, calendar);
            if (!end) throw new ValidationError("The arrival has no complete planning window.");
            for (const row of card.allocations) {
              const sibling = (gate, arrival) => source.get(`${arrivalWorkKey({ ...row, gate_name: gate, arrive_by: arrival })}|${gate}`);
              const previous = row.prev_gate && row.prev_arrive_by ? sibling(row.prev_gate, row.prev_arrive_by) : null;
              const previousEnd = previous ? arrivalEndDate(arrivalOf(previous), previous.leadDays, calendar) || row.prev_must_out : row.prev_must_out;
              const next = row.next_gate && row.next_arrive_by ? sibling(row.next_gate, row.next_arrive_by) : null;
              const nextArrival = next ? arrivalOf(next) : row.next_arrive_by;
              if ((previousEnd && move.plannedDate < previousEnd) || (nextArrival && end > nextArrival)) {
                throw new ValidationError("The arrival overlaps the previous or next gate. Adjust the affected gate dates before saving.");
              }
            }
          }
        }

        const proposedDates = new Map(moves.map((move) => [`${move.workKey}|${move.gate}`, move.plannedDate]));
        const proposedCards = cards.map((card) => ({ ...card,
          plannedDate: proposedDates.get(`${card.workKey}|${card.gate}`) ?? card.baseDate,
        }));
        // Older clients omit order: retain valid saved groups instead of erasing a planner's sequence.
        const order = resolveBoardCardOrder(boardCardOrder ?? latest?.board_card_order, proposedCards, today, boardCardOrder !== undefined);
        const planId = randomUUID();
        const previousMoves = latest ? (await client.query(MOVES_SQL, [latest.plan_id])).rows : [];
        const previousCards = buildArrivalCards(sourceRows, previousMoves, today, config).cards;
        const history = buildSavedMoveHistory(previousCards, proposedCards, latest?.board_card_order ?? [], order,
          latest?.move_history, { planId, planVersion: baseVersion + 1, changedBy: actorOf(req),
            changedAt: new Date().toISOString(), note });
        const dates = [today, ...moves.map((move) => move.plannedDate), ...order.map((group) => group.date)].sort();
        const end = new Date(Date.parse(`${today}T00:00:00Z`) + 27 * 86400000).toISOString().slice(0, 10);
        const view = await buildLevelingView({ sourceRows, config, today, start: today, end, loadCalendar,
          moves: moves.map((move) => ({ work_key: move.workKey, gate_name: move.gate,
            original_date: source.get(`${move.workKey}|${move.gate}`).baseDate, planned_date: move.plannedDate })),
          history, order, calculationMethod: PLAN_METHOD });
        await client.query(`INSERT INTO planning.work_plan (
            plan_id, plan_group_id, version_no, previous_plan_id, plan_name, product_group, status,
            horizon_start, horizon_end, source_as_of, calculation_method, note, created_by, baseline_snapshot
          ) VALUES ($1, $2, $3, $4, 'Capacity Leveling', 'ALL', 'draft', $5, $6, CURRENT_TIMESTAMP, $7, $8, $9, $10::jsonb)`,
        [planId, latest?.plan_group_id ?? planId, baseVersion + 1, latest?.plan_id ?? null,
          dates[0], dates[dates.length - 1], PLAN_METHOD, note || null, actorOf(req),
          JSON.stringify({ boardCardOrderVersion: 1, boardCardOrder: order, moveHistory: history,
            viewSnapshot: { version: 1, capturedAt: new Date().toISOString(), data: view } })]);
        for (const move of moves) {
          const row = source.get(`${move.workKey}|${move.gate}`);
          await client.query(`INSERT INTO planning.work_plan_gate_item (
              item_id, plan_id, work_key, gate_name, prd_name, item, lot_no, due_date, source_status,
              source_qty, original_date, planned_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [randomUUID(), planId, move.workKey, move.gate, row.prdName, row.item, row.lotNo, row.dueDate || null,
            row.status, row.qty, row.baseDate, move.plannedDate]);
        }
        return { plan: planInfo((await client.query(LATEST_PLAN_SQL, [PLAN_METHOD])).rows[0]), orderedGroupCount: order.length };
      });
      if (outcome.conflict === "PLAN_VERSION_CONFLICT") {
        return res.status(409).json({ status: "ERROR", code: outcome.conflict,
          message: "Someone saved a newer plan. Reload the page before saving again." });
      }
      if (outcome.conflict) {
        return res.status(409).json({ status: "ERROR", code: outcome.conflict,
          message: `${outcome.missing} moved card(s) are no longer in Summary Gate. Reload the page before saving again.` });
      }
      loadCache.invalidate();
      return res.json({ status: "OK", data: { plan: outcome.plan, movedCount: moves.length,
        orderedGroupCount: outcome.orderedGroupCount }, message: "Plan saved." });
    } catch (error) {
      return fail(res, error, "Unable to save the plan. Nothing was changed.");
    }
  });

  return router;
};

module.exports = { createCapacityLevelingRouter, PLAN_METHOD };
