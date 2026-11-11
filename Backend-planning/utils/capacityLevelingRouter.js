const express = require("express");
const { randomUUID } = require("node:crypto");
const {
  LEVELING_GATES, SHIFTS, NORMAL_VALID_FROM, NORMAL_VALID_TO, ValidationError,
  isDate, dateRange, capacityGrid, buildCapacityConfig, parseSettingsPayload, sameShift,
  workKey, buildCards, parsePlanPayload,
} = require("./capacityLeveling");

const PLAN_METHOD = "gate_segment_target_uph_v1";
const PLAN_LOCK_KEY = 0x504c4e4c564c; // Serializes capacity and plan writers.
const MAX_RANGE_DAYS = 62;
// Special days older than this are kept on record but no longer read or edited.
const SPECIAL_WINDOW_DAYS = 62;

const NORM_GATE = (column) => `CASE
    WHEN BTRIM(${column}) IN ('FVAC', 'AT-FVAC') THEN 'FVAC'
    WHEN BTRIM(${column}) IN ('FADL', 'AT-FADL') THEN 'FADL'
    WHEN BTRIM(${column}) IN ('FIN', 'AT-FIN') THEN 'FIN'
    WHEN BTRIM(${column}) IN ('MMOT', 'MMOT1') THEN 'MMOT'
    WHEN BTRIM(${column}) IN ('MBLK', 'MBLK1') THEN 'MBLK'
    ELSE BTRIM(${column}) END`;

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

// The load of a work item at a gate is the time of every routing process in that gate
// segment (previous gate -> this gate) at the target UPH; processes already passed are skipped.
const WORKS_SQL = `
  WITH base AS (
    SELECT g.*,
           LAG(g.gate_name) OVER w AS prev_gate,
           LAG(g.must_out) OVER w AS prev_must_out,
           LEAD(g.must_out) OVER w AS next_must_out
    FROM planning.planning_summary_gate g
    WINDOW w AS (PARTITION BY g.prd_name, g.lot_no, g.due_date, g.status ORDER BY g.gate_order)
  ), works AS (
    SELECT ROW_NUMBER() OVER (ORDER BY gate_order, pri) AS rn, *
    FROM base
    WHERE gate_name = ANY($1) AND gate_state <> 'passed'
  ), std AS (
    SELECT REPLACE(prd_name, '-', '') AS prd_key, ro_seq, BTRIM(proc_disp) AS proc_disp, MAX(uph) AS uph
    FROM smart.smart_pcap_std_time_by_product
    WHERE uph > 0
    GROUP BY 1, 2, 3
  ), load AS (
    SELECT w.rn, COUNT(r.seq)::int AS proc_count, COUNT(s.uph)::int AS uph_count,
           COALESCE(SUM(60.0 * w.qty / s.uph), 0)::float8 AS load_min
    FROM works w
    LEFT JOIN planning.prd_routing_master r
           ON r.prd_name = w.prd_name
          AND ${NORM_GATE("r.gate_name")} = w.gate_name
          AND (w.seq IS NULL OR r.seq >= w.seq)
    LEFT JOIN std s
           ON s.prd_key = REPLACE(r.prd_name, '-', '')
          AND s.ro_seq = r.seq
          AND s.proc_disp = BTRIM(r.proc_disp)
    GROUP BY w.rn
  )
  SELECT w.prd_name, w.item, w.lot_no, to_char(w.due_date, 'YYYY-MM-DD') AS due_date, w.status,
         w.qty::float8 AS qty, CEIL(w.qty / NULLIF(w.pcs_per_sheet, 0))::float8 AS sheets,
         w.gate_name, w.gate_state, w.process_group, w.prd_category, w.current_gate, w.proc_disp, w.is_hold,
         to_char(w.arrive_by, 'YYYY-MM-DD') AS arrive_by, to_char(w.must_out, 'YYYY-MM-DD') AS must_out,
         w.prev_gate, to_char(w.prev_must_out, 'YYYY-MM-DD') AS prev_must_out,
         w.next_gate, to_char(w.next_must_out, 'YYYY-MM-DD') AS next_must_out,
         l.proc_count, l.uph_count, l.load_min
  FROM works w
  JOIN load l USING (rn)
  ORDER BY w.rn`;

const SOURCE_SQL = `
  SELECT prd_name, item, lot_no, to_char(due_date, 'YYYY-MM-DD') AS due_date, status, qty::float8 AS qty,
         gate_name, to_char(must_out, 'YYYY-MM-DD') AS must_out
  FROM planning.planning_summary_gate
  WHERE gate_name = ANY($1) AND gate_state <> 'passed' AND must_out IS NOT NULL`;

const LATEST_PLAN_SQL = `
  SELECT plan_id, plan_group_id, version_no, note, created_by,
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

const createCapacityLevelingRouter = ({ pool, verifyAdmin, loadCalendar }) => {
  const router = express.Router();

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

  router.get("/capacity", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      return res.json({ status: "OK", data: { gates: await readConfig(pool) } });
    } catch (error) {
      return fail(res, error, "Unable to load capacity settings. Please try again.");
    }
  });

  // Changed shifts are retired and re-inserted so earlier settings stay on record. Special days
  // are saved in the same transaction: a day type per date, for that gate and shift only.
  router.put("/capacity", verifyAdmin, async (req, res) => {
    try {
      const gates = parseSettingsPayload(req.body);
      const config = await inTransaction(async (client) => {
        const current = await readConfig(client);
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
      return res.json({ status: "OK", data: { gates: config }, message: "Capacity settings saved." });
    } catch (error) {
      return fail(res, error, "Unable to save capacity settings. Nothing was changed.");
    }
  });

  // Capacity per gate and day plus one card per work item and gate, with the latest saved plan applied.
  router.get("/load", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const today = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
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
      const [{ calendar }, config, plan, works] = await Promise.all([
        loadCalendar(start, end),
        readConfig(pool),
        pool.query(LATEST_PLAN_SQL, [PLAN_METHOD]),
        pool.query(WORKS_SQL, [LEVELING_GATES]),
      ]);
      const latest = plan.rows[0];
      const moves = latest ? (await pool.query(MOVES_SQL, [latest.plan_id])).rows : [];
      const days = dateRange(start, end).map((date) => ({ date, isWorking: calendar.isWorking(date) }));
      const { cards, orphanMoves, undated } = buildCards(works.rows, moves, today);
      return res.json({ status: "OK", data: {
        today, days, gates: config.map(({ gate, group }) => ({ gate, group })),
        capacity: capacityGrid(config, days), cards, orphanMoves, undatedCount: undated, plan: planInfo(latest),
      } });
    } catch (error) {
      return fail(res, error, "Unable to load gate capacity data. Please try again.");
    }
  });

  // Every save is a new immutable version holding only the cards that were moved.
  router.post("/plan", verifyAdmin, async (req, res) => {
    try {
      const today = (await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
      const { baseVersion, note, moves } = parsePlanPayload(req.body, today);
      const outcome = await inTransaction(async (client) => {
        const latest = (await client.query(LATEST_PLAN_SQL, [PLAN_METHOD])).rows[0];
        if ((latest?.version_no ?? 0) !== baseVersion) return { conflict: "PLAN_VERSION_CONFLICT" };
        const source = new Map((await client.query(SOURCE_SQL, [LEVELING_GATES])).rows
          .map((row) => [`${workKey(row)}|${row.gate_name}`, row]));
        const missing = moves.filter((move) => !source.has(`${move.workKey}|${move.gate}`));
        if (missing.length) return { conflict: "WORK_NOT_FOUND", missing: missing.length };

        const planId = randomUUID();
        const dates = [today, ...moves.map((move) => move.plannedDate)].sort();
        await client.query(`INSERT INTO planning.work_plan (
            plan_id, plan_group_id, version_no, previous_plan_id, plan_name, product_group, status,
            horizon_start, horizon_end, source_as_of, calculation_method, note, created_by
          ) VALUES ($1, $2, $3, $4, 'Capacity Leveling', 'ALL', 'draft', $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)`,
        [planId, latest?.plan_group_id ?? planId, baseVersion + 1, latest?.plan_id ?? null,
          dates[0], dates[dates.length - 1], PLAN_METHOD, note || null, actorOf(req)]);
        for (const move of moves) {
          const row = source.get(`${move.workKey}|${move.gate}`);
          await client.query(`INSERT INTO planning.work_plan_gate_item (
              item_id, plan_id, work_key, gate_name, prd_name, item, lot_no, due_date, source_status,
              source_qty, original_date, planned_date
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [randomUUID(), planId, move.workKey, move.gate, row.prd_name, row.item, row.lot_no, row.due_date,
            row.status, row.qty, row.must_out, move.plannedDate]);
        }
        return { plan: planInfo((await client.query(LATEST_PLAN_SQL, [PLAN_METHOD])).rows[0]) };
      });
      if (outcome.conflict === "PLAN_VERSION_CONFLICT") {
        return res.status(409).json({ status: "ERROR", code: outcome.conflict,
          message: "Someone saved a newer plan. Reload the page before saving again." });
      }
      if (outcome.conflict) {
        return res.status(409).json({ status: "ERROR", code: outcome.conflict,
          message: `${outcome.missing} moved card(s) are no longer in Summary Gate. Reload the page before saving again.` });
      }
      return res.json({ status: "OK", data: { plan: outcome.plan, movedCount: moves.length }, message: "Plan saved." });
    } catch (error) {
      return fail(res, error, "Unable to save the plan. Nothing was changed.");
    }
  });

  return router;
};

module.exports = { createCapacityLevelingRouter, PLAN_METHOD };
