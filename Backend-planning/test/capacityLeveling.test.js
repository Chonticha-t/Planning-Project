const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  LEVELING_GATES, DEFAULT_SHIFT, ValidationError, shiftMinutesPerMachine, effectiveShift, dayCapacity,
  loadStatus, buildCapacityConfig, parseSettingsPayload, buildCards, occupancyCalendarRange, parsePlanPayload, isDate, arrivalWorkKey, buildArrivalCards, arrivalEndDate,
} = require("../utils/capacityLeveling");
const { createCapacityLevelingRouter, PLAN_METHOD } = require("../utils/capacityLevelingRouter");

const shift = (overrides = {}) => ({ ...DEFAULT_SHIFT, mcLines: 1, specialDays: {}, ...overrides });
const gate = (day = {}, night = {}) => ({ gate: "FVAC", group: "FPC", shifts: { day: shift(day), night: shift(night) } });

test("a 720-minute shift gives 475 minutes with OT closed and 655 with OT open", () => {
  assert.equal(shiftMinutesPerMachine(shift()), 475);
  assert.equal(shiftMinutesPerMachine(shift({ otEnabled: true })), 655);
  assert.equal(shiftMinutesPerMachine(shift({ lunch: false })), 520);
});

test("daily capacity sums both shifts and multiplies by MC and efficiency", () => {
  assert.equal(dayCapacity(gate({ mcLines: 2 }, { mcLines: 2 }), "2026-11-16", true).capacityMin, 1900);
  assert.equal(dayCapacity(gate({ mcLines: 2, otEnabled: true }, { mcLines: 1 }), "2026-11-16", true).capacityMin, 1785);
  assert.equal(dayCapacity(gate({ efficiency: 0.85 }, { enabled: false }), "2026-11-16", true).capacityMin, 403.75);
});

test("missing MC is reported as not configured instead of zero capacity", () => {
  const result = dayCapacity(gate({ mcLines: null }), "2026-11-16", true);
  assert.equal(result.capacityMin, null);
  assert.equal(result.off, false);
});

test("holidays and closed shifts are OFF; special days override one shift only", () => {
  assert.deepEqual(effectiveShift(shift(), { isWorkingDay: false }), { open: false, otOn: false, capacityMin: 0 });
  assert.equal(dayCapacity(gate(), "2026-11-15", false).off, true);
  const special = gate({ specialDays: { "2026-11-15": "ot", "2026-11-16": "off", "2026-11-17": "work" } }, { otEnabled: true });
  // OT day opens the day shift on a holiday; the night shift keeps following the calendar.
  assert.deepEqual([dayCapacity(special, "2026-11-15", false).capacityMin, dayCapacity(special, "2026-11-15", false).hasOt], [655, true]);
  // Day off closes the day shift only.
  assert.equal(dayCapacity(special, "2026-11-16", true).capacityMin, 655);
  // Normal day runs without OT even though it would otherwise follow the shift default.
  assert.equal(dayCapacity(gate({ otEnabled: true, specialDays: { "2026-11-17": "work" } }, { enabled: false }), "2026-11-17", true).capacityMin, 475);
});

test("load colors switch at 85 and 100 percent", () => {
  assert.deepEqual([85, 85.1, 100, 100.1].map(loadStatus), ["green", "yellow", "yellow", "red"]);
});

const row = (overrides = {}) => ({
  setting_id: "s1", gate_name: "FADL", shift_code: "day", setting_kind: "normal", valid_from: "1900-01-01",
  is_working_day: true, resource_count: null, manpower: 4, regular_minutes_per_shift: 540, ot_enabled: false,
  ot_minutes_per_shift: 180, break1_enabled: true, break1_minutes: 10, break2_enabled: true, break2_minutes: 10,
  lunch_enabled: true, lunch_minutes: 45, efficiency: 1, ...overrides,
});

test("settings cover only leveled gates and special days carry just the day type", () => {
  const config = buildCapacityConfig([
    row({ resource_count: 3 }),
    row({ setting_id: "x1", setting_kind: "exception", valid_from: "2026-11-21", ot_enabled: true, resource_count: 9 }),
    row({ setting_id: "x2", setting_kind: "exception", valid_from: "2026-11-22", is_working_day: false }),
  ]);
  assert.deepEqual(config.map((item) => item.gate), LEVELING_GATES);
  assert.ok(!config.some((item) => ["FFPC", "MFPC", "W/H", "MW/H"].includes(item.gate)));
  const fadl = config.find((item) => item.gate === "FADL");
  assert.deepEqual(fadl.shifts.day.specialDays, { "2026-11-21": "ot", "2026-11-22": "off" });
  // The exception row's stale MC is ignored; the current normal setting applies.
  assert.equal(dayCapacity(fadl, "2026-11-21", false).shifts.day.capacityMin, 3 * 655);
  // Gates without a saved row fall back to the default with OT closed and no MC.
  assert.deepEqual([fadl.shifts.night.otEnabled, fadl.shifts.night.mcLines, fadl.shifts.night.settingId], [false, null, null]);
});

test("settings payload accepts empty MC and rejects impossible shifts", () => {
  const input = { enabled: true, mcLines: "", manpower: null, minPerShift: 540, otEnabled: false, otMinutes: 180,
    break1: true, break1Min: 10, break2: true, break2Min: 10, lunch: true, lunchMin: 45 };
  const [parsed] = parseSettingsPayload({ gates: [{ gate: "FIN", shifts: { day: input, night: { ...input, mcLines: 2 } } }] });
  assert.deepEqual([parsed.shifts.day.mcLines, parsed.shifts.night.mcLines, parsed.shifts.day.efficiency], [null, 2, 1]);
  const bad = (patch, gateName = "FIN") => () => parseSettingsPayload({ gates: [{ gate: gateName, shifts: { day: { ...input, ...patch }, night: input } }] });
  assert.throws(bad({ lunchMin: 600 }), ValidationError);
  assert.throws(bad({ minPerShift: 1300 }), ValidationError);
  assert.throws(bad({ mcLines: -1 }), ValidationError);
  assert.throws(bad({}, "FFPC"), ValidationError);
});

const work = (overrides = {}) => ({
  prd_name: "PRD-A", item: "94-1", lot_no: "L001", due_date: "2026-11-25", status: "production plan", qty: 1000,
  sheets: 84, gate_name: "FADL", gate_state: "in_gate", process_group: "EFPC_GEN", prd_category: "FPC",
  current_gate: "FADL", proc_disp: "A", is_hold: false, arrive_by: "2026-11-16", must_out: "2026-11-17",
  prev_gate: "FVAC", prev_must_out: "2026-11-16", next_gate: "FIN", next_must_out: "2026-11-19",
  lead_days: 2, ...overrides,
});

test("cards sit on must_out, a saved move changes that gate only, overdue work loads today", () => {
  const moves = [{ work_key: "LOT|L001|2026-11-25", gate_name: "FADL", original_date: "2026-11-17", planned_date: "2026-11-18" }];
  const { cards, orphanMoves } = buildCards([
    work(),
    work({ gate_name: "FIN", must_out: "2026-11-19" }),
    work({ lot_no: "L002", must_out: "2026-11-10" }),
  ], moves, "2026-11-12");
  assert.deepEqual(cards.map((card) => [card.gate, card.plannedDate, card.moved, card.overdue]), [
    ["FADL", "2026-11-18", true, false], ["FIN", "2026-11-19", false, false], ["FADL", "2026-11-12", false, true],
  ]);
  assert.equal(cards[0].loadMin, 950);
  assert.deepEqual(cards[0].standardShiftMin, { day: 475, night: 475 });
  assert.equal(orphanMoves.length, 0);
});

test("work without a lot keeps a stable key; missing or invalid lead time is explicit", () => {
  const { cards } = buildCards([
    work({ lot_no: null, status: "need wip" }),
    work({ lot_no: "L003", lead_days: null }),
    work({ lot_no: "L004", lead_days: 0 }),
    work({ lot_no: "L005", lead_days: 367 }),
  ], [], "2026-11-12");
  assert.equal(cards[0].workKey, "NEED|PRD-A|2026-11-25");
  assert.deepEqual(cards.map((card) => [card.leadDays, card.loadMin]), [[2, 950], [null, null], [null, null], [null, null]]);
});

test("moves whose work left the gate are returned as orphans; changed sources are flagged", () => {
  const moves = [
    { work_key: "LOT|L001|2026-11-25", gate_name: "FADL", original_date: "2026-11-16", planned_date: "2026-11-18" },
    { work_key: "LOT|GONE|2026-11-25", gate_name: "FADL", prd_name: "PRD-A", lot_no: "GONE", due_date: "2026-11-25",
      original_date: "2026-11-17", planned_date: "2026-11-18" },
  ];
  const { cards, orphanMoves, undated } = buildCards([work(), work({ lot_no: "L009", must_out: null })], moves, "2026-11-12");
  assert.equal(cards[0].sourceChanged, true);
  assert.deepEqual(orphanMoves.map((move) => move.lotNo), ["GONE"]);
  assert.equal(undated, 1);
});

test("plan payload rejects past dates, unknown gates and repeated cards", () => {
  const move = { workKey: "LOT|L001|2026-11-25", gate: "FADL", plannedDate: "2026-11-18" };
  assert.equal(parsePlanPayload({ baseVersion: 2, moves: [move] }, "2026-11-12").moves.length, 1);
  assert.throws(() => parsePlanPayload({ moves: [{ ...move, plannedDate: "2026-11-11" }] }, "2026-11-12"), ValidationError);
  assert.throws(() => parsePlanPayload({ moves: [{ ...move, gate: "FFPC" }] }, "2026-11-12"), ValidationError);
  assert.throws(() => parsePlanPayload({ moves: [move, move] }, "2026-11-12"), ValidationError);
});

// A scripted pool: each query is answered by the first matching rule and recorded.
function fakePool(rules) {
  const log = [];
  const query = async (sql, params) => {
    log.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    const rule = rules.find(([pattern]) => pattern.test(sql));
    if (!rule) return { rows: [] };
    if (rule[1] instanceof Error) throw rule[1];
    return { rows: typeof rule[1] === "function" ? rule[1](params) : rule[1] };
  };
  return { log, query, connect: async () => ({ query, release() {} }) };
}

async function withApi(pool, callback, { admin = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use(createCapacityLevelingRouter({
    pool,
    verifyAdmin: (req, res, next) => (admin ? (req.user = { username: "planner" }, next()) : res.status(401).json({ status: "ERROR" })),
    loadCalendar: async () => ({ calendar: { isWorking: (date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0 } }),
  }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    await callback((url, options = {}) => fetch(base + url, {
      ...options, headers: { "Content-Type": "application/json" }, body: options.body && JSON.stringify({ ...(url === "/plan" ? { calculationMethod: PLAN_METHOD } : {}), ...options.body }),
    }));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("load endpoint returns capacity per gate and day with cards from the latest plan", async () => {
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.capacity_setting/, [row({ gate_name: "FADL", resource_count: 2 }), row({ setting_id: "s2", gate_name: "FADL", shift_code: "night", resource_count: 2 })]],
    [/FROM planning\.work_plan\b/, [{ plan_id: "p3", plan_group_id: "p1", version_no: 3, note: null, created_by: "planner", saved_at: "2026-11-11 15:00" }]],
    [/FROM planning\.work_plan_gate_item/, [{ work_key: arrivalWorkKey(work()), gate_name: "FADL", original_date: "2026-11-17", planned_date: "2026-11-18" }]],
    [/planning_summary_gate/, [work({ rem_proc_in_gate: 8 })]],
  ]);
  await withApi(pool, async (api) => {
    const response = await api("/load?startdate=2026-11-14&stopdate=2026-11-16");
    const { data } = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(data.days, [
      { date: "2026-11-14", isWorking: true }, { date: "2026-11-15", isWorking: false }, { date: "2026-11-16", isWorking: true },
    ]);
    assert.equal(data.capacity.FADL["2026-11-14"].capacityMin, 1900);
    assert.equal(data.capacity.FADL["2026-11-15"].off, true);
    assert.equal(data.capacity.FVAC["2026-11-14"].capacityMin, null);
    assert.equal(data.cards[0].plannedDate, "2026-11-18");
    assert.equal(data.loadBasis, "summary_gate_arrivals_v1");
    assert.equal(data.arrivalRows[0].arrive_by, work().arrive_by);
    assert.equal(data.arrivalRows[0].workKey, data.cards[0].workKey);
    assert.equal(data.arrivalRows[0].rem_proc_in_gate, 8);
    assert.equal(data.cards[0].allocations[0].rem_proc_in_gate, 8);
    assert.deepEqual(data.gates.find((gate) => gate.gate === "FADL").standardShiftMin, { day: 475, night: 475 });
    assert.equal(data.plan.version, 3);
    assert.equal((await api("/load?startdate=2026-11-14&stopdate=2027-11-16")).status, 400);
  });
  const works = pool.log.find((entry) => /planning_summary_gate/.test(entry.sql));
  assert.deepEqual(works.params, [LEVELING_GATES]);
  assert.match(works.sql, /gate_state <> 'passed'/);
  assert.match(works.sql, /w\.lead_days/);
  assert.match(works.sql, /w\.pcs_per_sheet::float8 AS pcs_per_sheet/);
  assert.match(works.sql, /w\.pri/);
  assert.match(works.sql, /w\.rem_proc_in_gate/);
  assert.doesNotMatch(works.sql, /smart_pcap_std_time|SUM\(60|uph/i);
});

test("arrival rows retain all allocations and valid arrivals without release dates", async () => {
  const rows = [work(), work({ pri: 2 }), work({ lot_no: "L002", must_out: null }), work({ lot_no: "L003", arrive_by: null })];
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/planning_summary_gate/, rows],
  ]);
  await withApi(pool, async (api) => {
    const response = await api("/load?startdate=2026-11-12&stopdate=2026-11-20");
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.arrivalRows.length, 4);
    assert.equal(data.cards.length, 2);
    assert.equal(data.undatedCount, 1);
    assert.equal(data.undatedArrivalCount, 1);
    assert.equal(data.duplicateWorkCount, 1);
    assert.equal(data.arrivalRows[2].must_out, null);
    assert.equal(data.arrivalRows[0].arrive_by, rows[0].arrive_by);
  });
});

test("normal reservation ignores OT, MC, efficiency and closed shifts", () => {
  const config = [{ ...gate({ mcLines: 8, efficiency: 0.8, otEnabled: true },
    { minPerShift: 485, enabled: false }), gate: "FADL" }];
  const { cards } = buildCards([work()], [], "2026-11-12", config);
  assert.equal(cards[0].loadMin, 895);
  assert.deepEqual(cards[0].standardShiftMin, { day: 475, night: 420 });
  const zero = [{ ...gate({ minPerShift: 65 }, { minPerShift: 65 }), gate: "FADL" }];
  assert.equal(buildCards([work()], [], "2026-11-12", zero).cards[0].loadMin, null);
});

test("duplicate source rows reserve only one work item per gate and are reported", () => {
  const { cards, duplicates } = buildCards([work(), work(), work({ gate_name: "FIN" })], [], "2026-11-12");
  assert.equal(cards.length, 2);
  assert.equal(duplicates, 1);
});

test("planning calendar covers future releases and rejects unsupported ranges safely", () => {
  const { cards } = buildCards([work({ must_out: "2027-01-15", lead_days: 10 })], [], "2026-11-12");
  const range = occupancyCalendarRange(cards, "2026-11-12", "2026-12-01");
  assert.ok(range.start < "2026-11-12");
  assert.equal(range.end, "2027-01-15");
  assert.throws(() => occupancyCalendarRange([{ ...cards[0], plannedDate: "2099-01-01" }], "2026-11-12", "2026-12-01"), ValidationError);
  assert.equal(isDate("2026-99-99"), false);
  assert.equal(isDate("2026-02-30"), false);
});

test("a legacy UPH plan stays separate and its moved dates are not silently imported", async () => {
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan\b/, (params) => params[0] === "gate_segment_target_uph_v1" ? [{ plan_id: "old", version_no: 7 }] : []],
    [/planning_summary_gate/, [work()]],
  ]);
  await withApi(pool, async (api) => {
    const response = await api("/load?startdate=2026-11-12&stopdate=2026-11-20");
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.plan, null);
    assert.equal(data.legacyPlanAvailable, true);
    assert.equal(data.calculationMethod, PLAN_METHOD);
    assert.equal(data.cards[0].plannedDate, "2026-11-16");
    assert.ok(data.calendarDays[0].date < data.days[0].date);
  });
  assert.ok(!pool.log.some((entry) => /FROM planning\.work_plan_gate_item/.test(entry.sql)));
});

test("moving an arrival with missing master lead time fails without writing a plan", async () => {
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.planning_summary_gate/, [work({ lead_days: null })]],
  ]);
  await withApi(pool, async (api) => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [{ workKey: arrivalWorkKey(work()), gate: "FADL", plannedDate: "2026-11-18" }] } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "INVALID_REQUEST");
  });
  assert.ok(!pool.log.some((entry) => entry.sql.startsWith("INSERT")));
  assert.equal(pool.log.at(-1).sql, "ROLLBACK");
});

test("the API rejects a direct save onto a closed day before writing", async () => {
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.planning_summary_gate/, [work()]],
  ]);
  await withApi(pool, async (api) => {
    const response = await api("/plan", { method: "POST", body: {
      baseVersion: 0, moves: [{ workKey: arrivalWorkKey(work()), gate: "FADL", plannedDate: "2026-11-15" }],
    } });
    assert.equal(response.status, 400);
  });
  assert.ok(!pool.log.some((entry) => entry.sql.startsWith("INSERT")));
  assert.equal(pool.log.at(-1).sql, "ROLLBACK");
});

test("the API rejects moving an actual lot with zero normal minutes", async () => {
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.planning_summary_gate/, [work()]],
    [/FROM planning\.capacity_setting/, [row({ regular_minutes_per_shift: 65 }), row({ shift_code: "night", regular_minutes_per_shift: 65 })]],
  ]);
  await withApi(pool, async (api) => {
    assert.equal((await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [{ workKey: arrivalWorkKey(work()), gate: "FADL", plannedDate: "2026-11-18" }] } })).status, 400);
  });
  assert.ok(!pool.log.some((entry) => entry.sql.startsWith("INSERT")));
});

test("missing tables are reported as setup required, not as zero capacity", async () => {
  const pool = fakePool([[/capacity_setting/, Object.assign(new Error("relation missing"), { code: "42P01" })]]);
  await withApi(pool, async (api) => {
    const response = await api("/capacity");
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "SCHEMA_NOT_READY");
  });
});

const shiftInput = { enabled: true, mcLines: 2, manpower: 4, minPerShift: 540, otEnabled: false, otMinutes: 180,
  break1: true, break1Min: 10, break2: true, break2Min: 10, lunch: true, lunchMin: 45, efficiency: 1 };

test("saving capacity retires only the changed shift and keeps the old row", async () => {
  const pool = fakePool([[/FROM planning\.capacity_setting/, [
    row({ gate_name: "FADL", resource_count: 2 }), row({ setting_id: "s2", gate_name: "FADL", shift_code: "night", resource_count: 2 }),
  ]]]);
  await withApi(pool, async (api) => {
    const response = await api("/capacity", { method: "PUT", body: { gates: [{ gate: "FADL", shifts: {
      day: shiftInput, night: { ...shiftInput, mcLines: 3, otEnabled: true } } }] } });
    assert.equal(response.status, 200);
  });
  const sql = pool.log.map((entry) => entry.sql);
  assert.equal(sql.filter((text) => text.startsWith("UPDATE planning.capacity_setting SET is_active = false")).length, 1);
  assert.deepEqual(pool.log.find((entry) => entry.sql.startsWith("UPDATE")).params, ["s2"]);
  const inserts = pool.log.filter((entry) => entry.sql.startsWith("INSERT INTO planning.capacity_setting"));
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0].params.slice(1, 9), ["FADL", "normal", "1900-01-01", "9999-12-31", "night", true, 3, 4]);
  assert.ok(!sql.some((text) => text.startsWith("DELETE")));
  assert.deepEqual([sql[0], sql.at(-1)], ["BEGIN", "COMMIT"]);
});

test("special days are saved with the settings for that gate and shift only; writes need a login", async () => {
  const pool = fakePool([[/FROM planning\.capacity_setting/, [
    row({ gate_name: "FADL", resource_count: 2 }), row({ setting_id: "s2", gate_name: "FADL", shift_code: "night", resource_count: 2 }),
    row({ setting_id: "x1", gate_name: "FADL", shift_code: "night", setting_kind: "exception", valid_from: "2026-11-21", ot_enabled: true }),
    row({ setting_id: "x2", gate_name: "FADL", shift_code: "night", setting_kind: "exception", valid_from: "2026-11-22", is_working_day: false }),
  ]]]);
  await withApi(pool, async (api) => {
    const body = { gates: [{ gate: "FADL", shifts: {
      day: shiftInput,
      // 21st stays OT, 22nd is cleared, 23rd becomes a day off.
      night: { ...shiftInput, specialDays: { "2026-11-21": "ot", "2026-11-23": "off" } } } }] };
    assert.equal((await api("/capacity", { method: "PUT", body })).status, 200);
    const invalid = { gates: [{ gate: "FADL", shifts: { day: { ...shiftInput, specialDays: { "2026-11-21": "holiday" } }, night: shiftInput } }] };
    assert.equal((await api("/capacity", { method: "PUT", body: invalid })).status, 400);
  });
  const retire = pool.log.filter((entry) => entry.sql.startsWith("UPDATE"));
  assert.equal(retire.length, 1);
  assert.deepEqual(retire[0].params, ["FADL", "night", ["2026-11-22", "2026-11-23"]]);
  const inserts = pool.log.filter((entry) => entry.sql.startsWith("INSERT INTO planning.capacity_setting"));
  assert.equal(inserts.length, 1);
  // exception row, night shift, closed for the day.
  assert.deepEqual(inserts[0].params.slice(1, 7), ["FADL", "exception", "2026-11-23", "2026-11-23", "night", false]);
  const blocked = fakePool([]);
  await withApi(blocked, async (api) => {
    assert.equal((await api("/capacity", { method: "PUT", body: {} })).status, 401);
    assert.equal((await api("/plan", { method: "POST", body: {} })).status, 401);
  }, { admin: false });
  assert.equal(blocked.log.length, 0);
});

test("saving a plan creates the next version with only the moved cards", async () => {
  const source = [work()];
  const rules = [
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan\b/, [{ plan_id: "p3", plan_group_id: "p1", version_no: 3, note: null, created_by: "planner", saved_at: "x" }]],
    [/FROM planning\.planning_summary_gate/, source],
  ];
  const move = { workKey: arrivalWorkKey(work()), gate: "FADL", plannedDate: "2026-11-18" };
  const pool = fakePool(rules);
  await withApi(pool, async (api) => {
    assert.equal((await api("/plan", { method: "POST", body: { baseVersion: 3, moves: [move] } })).status, 200);
  });
  const header = pool.log.find((entry) => entry.sql.startsWith("INSERT INTO planning.work_plan ("));
  assert.deepEqual(header.params.slice(1, 6), ["p1", 4, "p3", "2026-11-12", "2026-11-18"]);
  assert.equal(header.params[8], "planner");
  const item = pool.log.find((entry) => entry.sql.startsWith("INSERT INTO planning.work_plan_gate_item"));
  assert.deepEqual(item.params.slice(2, 5).concat(item.params.slice(10)), [move.workKey, "FADL", "PRD-A", "2026-11-16", "2026-11-18"]);
  assert.ok(!pool.log.some((entry) => /^(UPDATE|DELETE)/.test(entry.sql)));

  // A stale version or a card that left Summary Gate rolls back without writing.
  for (const body of [{ baseVersion: 2, moves: [move] }, { baseVersion: 3, moves: [{ ...move, workKey: "LOT|GONE|2026-11-25" }] }]) {
    const stale = fakePool(rules);
    await withApi(stale, async (api) => {
      assert.equal((await api("/plan", { method: "POST", body })).status, 409);
    });
    assert.ok(!stale.log.some((entry) => entry.sql.startsWith("INSERT")));
  }
});


test("arrival cards group physical lots across due dates, retain allocations and do not clamp history", () => {
  const rows = [work(), work({ due_date: "2026-12-01", pri: 2 }), work({ lot_no: "OLD", arrive_by: "2026-11-01" }), work({ lot_no: "NEED WIP", gate_state: "need_wip", pri: 3 })];
  const result = buildArrivalCards(rows, [], "2026-11-12");
  assert.equal(result.cards.length, 3);
  assert.equal(result.cards[0].allocations.length, 2);
  assert.equal(result.cards[0].baseDate, "2026-11-16");
  assert.equal(result.cards[1].plannedDate, "2026-11-01");
  assert.equal(result.cards[2].loadMin, 0);
  assert.equal(arrivalWorkKey(rows[0]), arrivalWorkKey(rows[1]));
  assert.notEqual(arrivalWorkKey(rows[0]), arrivalWorkKey({ ...rows[0], arrive_by: "2026-11-17" }));
});

test("changed source arrival does not silently inherit an old arrival move", () => {
  const original = work();
  const moves = [{ work_key: arrivalWorkKey(original), gate_name: "FADL", original_date: original.arrive_by, planned_date: "2026-11-18" }];
  const changed = buildArrivalCards([work({ arrive_by: "2026-11-17" })], moves, "2026-11-12");
  assert.equal(changed.cards[0].plannedDate, "2026-11-17");
  assert.equal(changed.orphanMoves.length, 1);
});

test("server projects completion forward and honors working days", () => {
  const calendar = { isWorking: date => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0 };
  assert.equal(arrivalEndDate("2026-11-21", 2, calendar), "2026-11-24");
  assert.equal(arrivalEndDate("2026-11-21", 1, calendar), "2026-11-23");
  assert.equal(arrivalEndDate("2026-11-21", null, calendar), null);
});

test("release-date clients cannot save dates as arrival plans", async () => {
  const pool = fakePool([[/CURRENT_DATE::text/, [{ today: "2026-11-12" }]]]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { calculationMethod: "gate_max_target_occupancy_v1", baseVersion: 0, moves: [] } });
    assert.equal(response.status, 400);
  });
  assert.ok(!pool.log.some(entry => entry.sql.startsWith("INSERT")));
});

test("an existing occupancy plan is retained but never loaded into the arrival board", async () => {
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan\b/, params => params[0] === "gate_max_target_occupancy_v1" ? [{ plan_id: "old-release", version_no: 4 }] : []],
    [/planning_summary_gate/, [work()]],
  ]);
  await withApi(pool, async api => {
    const response = await api("/load?startdate=2026-11-12&stopdate=2026-11-20");
    const { data } = await response.json();
    assert.equal(data.legacyPlanAvailable, true);
    assert.equal(data.plan, null);
    assert.equal(data.cards[0].plannedDate, "2026-11-16");
  });
  assert.ok(!pool.log.some(entry => /work_plan_gate_item/.test(entry.sql)));
});

test("saving an arrival that overlaps the next gate rolls back before any insert", async () => {
  const rows = [work({ next_arrive_by: "2026-11-19" })];
  const pool = fakePool([[/CURRENT_DATE::text/, [{ today: "2026-11-12" }]], [/planning_summary_gate/, rows]]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [{ workKey: arrivalWorkKey(rows[0]), gate: "FADL", plannedDate: "2026-11-18" }] } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).message, /overlaps/);
  });
  assert.ok(!pool.log.some(entry => entry.sql.startsWith("INSERT")));
  assert.equal(pool.log.at(-1).sql, "ROLLBACK");
});

test("arrival save and reload preserve source and planned arrival dates with the new plan method", async () => {
  const rows = [work({ prev_must_out: "2026-11-14", next_arrive_by: "2026-11-21" })];
  let header = null;
  let stored = [];
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan\b/, params => params[0] === PLAN_METHOD && header ? [header] : []],
    [/FROM planning\.work_plan_gate_item/, () => stored],
    [/planning_summary_gate/, rows],
    [/INSERT INTO planning\.work_plan \(/, params => { header = { plan_id: params[0], plan_group_id: params[1], version_no: params[2], created_by: params[8], saved_at: "2026-11-12 12:00" }; assert.equal(params[6], PLAN_METHOD); return []; }],
    [/INSERT INTO planning\.work_plan_gate_item/, params => { stored.push({ work_key: params[2], gate_name: params[3], original_date: params[10], planned_date: params[11] }); return []; }],
  ]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [{ workKey: arrivalWorkKey(rows[0]), gate: "FADL", plannedDate: "2026-11-18" }] } });
    assert.equal(response.status, 200);
    const load = await api("/load?startdate=2026-11-12&stopdate=2026-11-20");
    const { data } = await load.json();
    assert.equal(data.plan.version, 1);
    assert.equal(data.cards[0].baseDate, "2026-11-16");
    assert.equal(data.cards[0].plannedDate, "2026-11-18");
    assert.equal(data.arrivalRows[0].arrive_by, "2026-11-16");
    assert.deepEqual(stored.map(move => [move.original_date, move.planned_date]), [["2026-11-16", "2026-11-18"]]);
  });
});


test("same-day handoff is valid when completion equals the next gate arrival", async () => {
  const rows = [work({ prev_must_out: "2026-11-17", next_arrive_by: "2026-11-19" })];
  const pool = fakePool([[/CURRENT_DATE::text/, [{ today: "2026-11-12" }]], [/planning_summary_gate/, rows]]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [{ workKey: arrivalWorkKey(rows[0]), gate: "FADL", plannedDate: "2026-11-17" }] } });
    assert.equal(response.status, 200);
  });
  assert.ok(pool.log.some(entry => entry.sql.startsWith("INSERT")));
});

test("arriving before the previous gate finishes is rejected atomically", async () => {
  const rows = [work({ prev_must_out: "2026-11-18", next_arrive_by: "2026-11-25" })];
  const pool = fakePool([[/CURRENT_DATE::text/, [{ today: "2026-11-12" }]], [/planning_summary_gate/, rows]]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [{ workKey: arrivalWorkKey(rows[0]), gate: "FADL", plannedDate: "2026-11-17" }] } });
    assert.equal(response.status, 400);
  });
  assert.ok(!pool.log.some(entry => entry.sql.startsWith("INSERT")));
});
