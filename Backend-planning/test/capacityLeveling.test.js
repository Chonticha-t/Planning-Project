const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const {
  LEVELING_GATES, DEFAULT_SHIFT, ValidationError, shiftMinutesPerMachine, effectiveShift, dayCapacity,
  loadStatus, buildCapacityConfig, parseSettingsPayload, buildCards, occupancyCalendarRange, parsePlanPayload, isDate, arrivalWorkKey, buildArrivalCards, arrivalEndDate,
} = require("../routes/10.17.87.244/Planning System/Capacity Leveling/capacityLeveling");
const { createCapacityLevelingRouter, PLAN_METHOD } = require("../routes/10.17.87.244/Planning System/Capacity Leveling/capacityLevelingRouter");
const { buildSavedMoveHistory, HISTORY_LIMIT } = require("../routes/10.17.87.244/Planning System/Capacity Leveling/capacityLevelingHistory");

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

test("board order payload rejects invalid groups, duplicate cards and oversized input", () => {
  const group = { gate: "FADL", date: "2026-11-16", cardIds: ["card-1"] };
  for (const boardCardOrder of [null, {}, [null], [group, group],
    [{ ...group, gate: "UNKNOWN" }], [{ ...group, date: "2026-11-11" }],
    [{ ...group, date: "2026-02-30" }], [{ ...group, cardIds: [] }],
    [{ ...group, cardIds: ["card-1", "card-1"] }], [{ ...group, cardIds: [null] }],
    [{ ...group, cardIds: ["x".repeat(2049)] }], Array(5001).fill(group),
  ]) {
    assert.throws(() => parsePlanPayload({ moves: [], boardCardOrder }, "2026-11-12"), ValidationError);
  }
  assert.deepEqual(parsePlanPayload({ moves: [], boardCardOrder: [group] }, "2026-11-12").boardCardOrder, [group]);
});

// A scripted pool: each query is answered by the first matching rule and recorded.
function fakePool(rules) {
  const log = [];
  const query = async (sql, params) => {
    log.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    const rule = rules.find(([pattern]) => pattern.test(sql));
    if (!rule) return { rows: [] };
    if (rule[1] instanceof Error) throw rule[1];
    return { rows: typeof rule[1] === "function" ? rule[1](params, sql) : rule[1] };
  };
  return { log, query, connect: async () => ({ query, release() {} }) };
}

async function withApi(pool, callback, { admin = true, loadCalendar } = {}) {
  const app = express();
  app.use(express.json());
  app.use(createCapacityLevelingRouter({
    pool,
    verifyAdmin: (req, res, next) => (admin ? (req.user = { username: "planner" }, next()) : res.status(401).json({ status: "ERROR" })),
    loadCalendar: loadCalendar ?? (async () => ({ calendar: { isWorking: (date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0 } })),
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

const orderId = (row, date = row.arrive_by) => JSON.stringify([
  row.gate_name, date, "lot", row.lot_no.trim(),
]);

test("saved history distinguishes date moves from same-day reorder and keeps server identity and version", () => {
  const rows = [work({ lot_no: "L001" }), work({ lot_no: "L002" }), work({ lot_no: "L003" })];
  const cards = buildArrivalCards(rows, [], "2026-11-12").cards;
  const order = [{ gate: "FADL", date: rows[0].arrive_by, cardIds: [orderId(rows[2]), orderId(rows[0]), orderId(rows[1])] }];
  const meta = { planId: "plan-1", planVersion: 1, changedBy: "planner", changedAt: "2026-11-12T03:00:00Z", note: "" };
  const history = buildSavedMoveHistory(cards, cards, [], order, {}, meta);
  assert.deepEqual([history[cards[2].id][0].kind, history[cards[2].id][0].fromPosition, history[cards[2].id][0].toPosition], ["reorder", 3, 1]);
  assert.equal(history[cards[2].id][0].changedBy, "planner");
  assert.equal(history[cards[2].id][0].planVersion, 1);
  const unchanged = buildSavedMoveHistory(cards, cards, order, order, history, { ...meta, planVersion: 2 });
  assert.equal(unchanged[cards[2].id].length, 1);
  const moved = cards.map((card, index) => index === 2 ? { ...card, plannedDate: "2026-11-18" } : card);
  const movedHistory = buildSavedMoveHistory(cards, moved, order, [], history, { ...meta, planId: "plan-2", planVersion: 2 });
  assert.deepEqual(movedHistory[cards[2].id].map(entry => entry.kind), ["date", "reorder"]);
  const returned = buildSavedMoveHistory(moved, cards, [], order, movedHistory, { ...meta, planId: "plan-3", planVersion: 3 });
  assert.deepEqual([returned[cards[2].id][0].fromDate, returned[cards[2].id][0].toDate], ["2026-11-18", "2026-11-16"]);
});

test("history respects source priority and merged physical cards, bounds saved entries and removes departed sources", () => {
  const rows = [work({ lot_no: "L001", pri: 1 }), work({ lot_no: "L002", pri: 2, proc_disp: "FADL" })];
  const cards = buildArrivalCards(rows, [], "2026-11-12").cards;
  const original = [{ gate: "FADL", date: "2026-11-16", cardIds: [orderId(rows[1]), orderId(rows[0])] }];
  const meta = { planId: "plan-1", planVersion: 1, changedBy: "planner", changedAt: "2026-11-12T03:00:00Z" };
  assert.equal(Object.keys(buildSavedMoveHistory(cards, cards, [], original, {}, meta)).length, 0);
  const saved = Array.from({ length: HISTORY_LIMIT + 1 }, (_, i) => ({ id: `entry-${i}` }));
  const history = buildSavedMoveHistory(cards, cards, [], [], { [cards[0].id]: saved, removed: saved }, meta);
  assert.equal(history[cards[0].id].length, HISTORY_LIMIT);
  assert.equal(history.removed, undefined);
  const duplicate = { ...cards[0], id: "allocation-2", workKey: "allocation-2" };
  const merged = [cards[0], duplicate, cards[1]];
  const reordered = [{ ...original[0], cardIds: [orderId(rows[0]), orderId(rows[1])] }];
  const mergedHistory = buildSavedMoveHistory(merged, merged, [], reordered, {}, meta);
  assert.equal(mergedHistory[cards[0].id][0].id, mergedHistory[duplicate.id][0].id);
  assert.deepEqual([mergedHistory[cards[0].id][0].fromPosition, mergedHistory[cards[0].id][0].toPosition], [2, 1]);
});

test("same-day order saves as an immutable version and reloads in another session without date moves", async () => {
  const rows = [work(), work({ lot_no: "L002" })];
  const group = { gate: "FADL", date: "2026-11-16", cardIds: rows.map(row => orderId(row)).reverse() };
  let header;
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan\b/, params => params[0] === PLAN_METHOD && header ? [header] : []],
    [/planning_summary_gate/, rows],
    [/INSERT INTO planning\.work_plan \(/, params => {
      header = { plan_id: params[0], plan_group_id: params[1], version_no: params[2],
        created_by: params[8], saved_at: "2026-11-12 12:00", board_card_order: JSON.parse(params[9]).boardCardOrder,
        move_history: JSON.parse(params[9]).moveHistory };
      return [];
    }],
  ]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [], boardCardOrder: [group] } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.orderedGroupCount, 1);
  });
  await withApi(pool, async api => {
    const { data } = await (await api("/load?startdate=2026-11-12&stopdate=2026-11-20")).json();
    assert.deepEqual(data.boardCardOrder, [group]);
    assert.deepEqual([data.cards[1].moveHistory[0].kind, data.cards[1].moveHistory[0].fromPosition,
      data.cards[1].moveHistory[0].toPosition], ["reorder", 2, 1]);
    assert.equal(data.cards[1].moveHistory[0].changedBy, "planner");
    assert.ok(data.cards.every(card => card.plannedDate === card.baseDate && !card.moved));
    // A stale planner cannot overwrite another user's saved order.
    assert.equal((await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [], boardCardOrder: [] } })).status, 409);
    // Clients predating card order preserve the latest sequence.
    assert.equal((await api("/plan", { method: "POST", body: { baseVersion: 1, moves: [] } })).status, 200);
    assert.deepEqual(header.board_card_order, [group]);
    assert.equal(header.version_no, 2);
    assert.equal(header.move_history[data.cards[1].id].length, 1);
  });
  assert.ok(!pool.log.some(entry => /INSERT INTO planning\.work_plan_gate_item|^(UPDATE|DELETE)/.test(entry.sql)));
  await withApi(pool, async api => {
    assert.equal((await api("/plan", { method: "POST", body: { baseVersion: 2, moves: [], boardCardOrder: [] } })).status, 401);
  }, { admin: false });
});

test("forged or stale board identities and mismatched gate/day groups roll back before inserts", async () => {
  const row = work();
  for (const group of [
    { gate: "FADL", date: row.arrive_by, cardIds: ["forged"] },
    { gate: "FIN", date: row.arrive_by, cardIds: [orderId(row)] },
    { gate: "FADL", date: "2026-11-17", cardIds: [orderId(row)] },
  ]) {
    const pool = fakePool([[/CURRENT_DATE::text/, [{ today: "2026-11-12" }]], [/planning_summary_gate/, [row]]]);
    await withApi(pool, async api => {
      assert.equal((await api("/plan", { method: "POST", body: { moves: [], boardCardOrder: [group] } })).status, 400);
    });
    assert.ok(!pool.log.some(entry => entry.sql.startsWith("INSERT")));
    assert.equal(pool.log.at(-1).sql, "ROLLBACK");
  }
});

test("source changes prune stale saved order and moving a card saves its order at the destination", async () => {
  const row = work({ next_arrive_by: "2026-11-25" });
  const group = { gate: "FADL", date: row.arrive_by, cardIds: [orderId(row), "removed"] };
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan\b/, [{ plan_id: "p1", plan_group_id: "p1", version_no: 1, board_card_order: [group] }]],
    [/planning_summary_gate/, [row]],
  ]);
  await withApi(pool, async api => {
    const { data } = await (await api("/load?startdate=2026-11-12&stopdate=2026-11-20")).json();
    assert.deepEqual(data.boardCardOrder[0].cardIds, [orderId(row)]);
    const target = "2026-11-18";
    const response = await api("/plan", { method: "POST", body: { baseVersion: 1,
      moves: [{ workKey: arrivalWorkKey(row), gate: row.gate_name, plannedDate: target }],
      boardCardOrder: [{ gate: row.gate_name, date: target, cardIds: [orderId(row, target)] }],
    } });
    assert.equal(response.status, 200);
  });
  const header = pool.log.find(entry => entry.sql.startsWith("INSERT INTO planning.work_plan ("));
  assert.deepEqual(JSON.parse(header.params[9]).boardCardOrder[0].cardIds, [orderId(row, "2026-11-18")]);
});

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

const historyId = (version) => `00000000-0000-4000-8000-${String(version).padStart(12, "0")}`;
const historyRow = (version, activeVersion = 3) => ({
  plan_id: historyId(version), version_no: version, plan_group_id: historyId(1),
  note: `Note ${version}`, created_by: "planner", saved_at: "2026-11-12 10:00",
  current_plan_id: historyId(activeVersion),
});

test("history is paginated newest first, excludes deleted plans and is readable without Admin", async () => {
  const pool = fakePool([[/FROM planning\.work_plan p/, (params, sql) => {
    assert.match(sql, /p\.deleted_at IS NULL/);
    assert.match(sql, /p\.calculation_method = \$1/);
    assert.match(sql, /ORDER BY p\.version_no DESC LIMIT 51/);
    assert.equal(params[0], PLAN_METHOD);
    return Array.from({ length: 55 }, (_, index) => historyRow(55 - index, 55))
      .filter(row => params[1] === null || row.version_no < params[1]).slice(0, 51);
  }]]);
  await withApi(pool, async api => {
    const response = await api("/plans");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const { data } = await response.json();
    assert.equal(data.plans.length, 50);
    assert.equal(data.plans[0].version, 55);
    assert.equal(data.plans[0].isActive, true);
    assert.ok(data.plans.slice(1).every(plan => !plan.isActive));
    assert.equal(data.nextBefore, 6);
    const next = (await (await api(`/plans?before=${data.nextBefore}`)).json()).data;
    assert.deepEqual(next.plans.map(plan => plan.version), [5, 4, 3, 2, 1]);
    assert.equal(next.nextBefore, null);
  }, { admin: false });
});

test("history rejects malformed cursors and plan IDs before reading the database", async () => {
  const pool = fakePool([]);
  await withApi(pool, async api => {
    for (const cursor of ["0", "-1", "1.5", "abc", "2147483648", "1&before=2"]) {
      assert.equal((await api(`/plans?before=${cursor}`)).status, 400);
    }
    assert.equal((await api("/plans/invalid")).status, 400);
    assert.equal((await api("/plans/invalid", { method: "DELETE" })).status, 400);
  });
  assert.equal(pool.log.length, 0);
});

test("version details use stored overrides and order without reading current source or capacity", async () => {
  const group = { gate: "FADL", date: "2026-11-16", cardIds: [orderId(work())] };
  const pool = fakePool([
    [/FROM planning\.work_plan p/, (params, sql) => {
      assert.deepEqual(params, [PLAN_METHOD, historyId(2)]);
      assert.match(sql, /p\.deleted_at IS NULL/);
      return [{ ...historyRow(2), board_card_order: [group] }];
    }],
    [/FROM planning\.work_plan_gate_item/, [{ work_key: "saved-work", gate_name: "FADL", prd_name: "OLD-PRODUCT",
      lot_no: "OLD-LOT", due_date: "2026-11-25", original_date: "2026-11-16", planned_date: "2026-11-18" }]],
  ]);
  await withApi(pool, async api => {
    const response = await api(`/plans/${historyId(2)}`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.plan.version, 2);
    assert.equal(data.plan.isActive, false);
    assert.deepEqual(data.boardCardOrder, [group]);
    assert.deepEqual(data.moves[0], { workKey: "saved-work", gate: "FADL", prdName: "OLD-PRODUCT", lotNo: "OLD-LOT",
      dueDate: "2026-11-25", originalDate: "2026-11-16", plannedDate: "2026-11-18" });
  }, { admin: false });
  assert.ok(!pool.log.some(entry => /planning_summary_gate|capacity_setting|^(INSERT|UPDATE|DELETE)/.test(entry.sql)));
});

test("deleted or unrelated versions cannot be viewed and cannot expose their stored items", async () => {
  const pool = fakePool([]);
  await withApi(pool, async api => {
    const response = await api(`/plans/${historyId(2)}`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).code, "PLAN_NOT_FOUND");
  });
  assert.ok(!pool.log.some(entry => /work_plan_gate_item/.test(entry.sql)));
});

test("deleting needs Admin even for direct API calls and active versions are protected", async () => {
  const pool = fakePool([[/FROM planning\.work_plan\b/, [historyRow(3)]]]);
  await withApi(pool, async api => {
    assert.equal((await api(`/plans/${historyId(2)}`, { method: "DELETE" })).status, 401);
  }, { admin: false });
  assert.equal(pool.log.length, 0);
  await withApi(pool, async api => {
    const response = await api(`/plans/${historyId(3)}`, { method: "DELETE" });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "ACTIVE_PLAN");
  });
  assert.ok(pool.log.some(entry => /pg_advisory_xact_lock/.test(entry.sql)));
  assert.ok(!pool.log.some(entry => /^(UPDATE|DELETE)/.test(entry.sql)));
});

test("soft delete records the server actor, is not repeated and never removes plan items", async () => {
  let deleted = false;
  const pool = fakePool([
    [/FROM planning\.work_plan\b/, [historyRow(3)]],
    [/UPDATE planning\.work_plan/, (params, sql) => {
      assert.deepEqual(params, [PLAN_METHOD, historyId(2), "planner"]);
      assert.match(sql, /deleted_at = CURRENT_TIMESTAMP, deleted_by = \$3/);
      assert.match(sql, /deleted_at IS NULL/);
      if (deleted) return [];
      deleted = true;
      return [{ plan_id: historyId(2) }];
    }],
  ]);
  await withApi(pool, async api => {
    assert.equal((await api(`/plans/${historyId(2)}`, { method: "DELETE", body: { deletedBy: "forged" } })).status, 200);
    assert.equal((await api(`/plans/${historyId(2)}`, { method: "DELETE" })).status, 404);
  });
  const lockIndex = pool.log.findIndex(entry => /pg_advisory_xact_lock/.test(entry.sql));
  assert.ok(lockIndex < pool.log.findIndex(entry => /UPDATE/.test(entry.sql)));
  assert.ok(!pool.log.some(entry => /^DELETE|work_plan_gate_item/.test(entry.sql)));
});

test("a soft-deleted version stays hidden and the next save keeps increasing the version", async () => {
  let latest = historyRow(3);
  let deleted = false;
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan p/, () => [latest, ...(!deleted ? [historyRow(2)] : []), historyRow(1)]],
    [/FROM planning\.work_plan\b/, (params, sql) => {
      assert.ok(!/deleted_at/.test(sql), "the head includes all versions so numbers are never reused");
      return [latest];
    }],
    [/UPDATE planning\.work_plan/, () => { deleted = true; return [{ plan_id: historyId(2) }]; }],
    [/INSERT INTO planning\.work_plan \(/, params => {
      latest = { ...historyRow(params[2], params[2]), plan_id: params[0] };
      assert.equal(params[2], 4);
      assert.equal(params[3], historyId(3));
      return [];
    }],
  ]);
  await withApi(pool, async api => {
    assert.equal((await api(`/plans/${historyId(2)}`, { method: "DELETE" })).status, 200);
    const { data: history } = await (await api("/plans")).json();
    assert.deepEqual(history.plans.map(plan => plan.version), [3, 1]);
    const response = await api("/plan", { method: "POST", body: { baseVersion: 3, moves: [] } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.plan.version, 4);
    assert.equal((await api(`/plans/${latest.plan_id}`, { method: "DELETE" })).status, 409);
  });
  const lockKeys = pool.log.filter(entry => /pg_advisory_xact_lock/.test(entry.sql)).map(entry => entry.params[0]);
  assert.equal(new Set(lockKeys).size, 1, "save and delete use the same database lock");
});

test("history schema errors explain setup and failed deletions roll back", async () => {
  const error = Object.assign(new Error("column missing"), { code: "42703" });
  const pool = fakePool([
    [/FROM planning\.work_plan p/, error],
    [/FROM planning\.work_plan\b/, [historyRow(3)]],
    [/UPDATE planning\.work_plan/, error],
  ]);
  await withApi(pool, async api => {
    for (const [path, options] of [["/plans", {}], [`/plans/${historyId(2)}`, { method: "DELETE" }]]) {
      const response = await api(path, options);
      assert.equal(response.status, 503);
      const body = await response.json();
      assert.equal(body.code, "HISTORY_SCHEMA_NOT_READY");
      assert.match(body.message, /planning_in_gate_test/);
    }
  });
  assert.equal(pool.log.at(-1).sql, "ROLLBACK");
});


test("saved view survives changed source, capacity and calendar without reading live inputs", async () => {
  let header;
  let stored;
  let sourceRows = [work()];
  let settings = [row({ resource_count: 2 }), row({ setting_id: "night", shift_code: "night", is_working_day: false })];
  const group = { gate: "FADL", date: "2026-11-16", cardIds: [orderId(sourceRows[0])] };
  const pool = fakePool([
    [/CURRENT_DATE::text/, [{ today: "2026-11-12" }]],
    [/FROM planning\.work_plan p/, () => [{ ...header, view_snapshot: stored.viewSnapshot }]],
    [/FROM planning\.work_plan\b/, () => header ? [header] : []],
    [/planning_summary_gate/, () => sourceRows],
    [/FROM planning\.capacity_setting/, () => settings],
    [/INSERT INTO planning\.work_plan \(/, params => {
      stored = JSON.parse(params[9]);
      header = { ...historyRow(params[2]), plan_id: params[0], has_snapshot: true };
      return [];
    }],
  ]);
  await withApi(pool, async api => {
    const saved = await api("/plan", { method: "POST", body: {
      baseVersion: 0, moves: [], boardCardOrder: [group], viewSnapshot: { version: 1, data: { forged: true } },
    } });
    assert.equal(saved.status, 200);
    assert.equal(stored.viewSnapshot.version, 1);
    assert.ok(stored.viewSnapshot.capturedAt);
    const view = stored.viewSnapshot.data;
    assert.equal(view.days.length, 28);
    assert.equal(view.today, "2026-11-12");
    assert.equal(view.days[27].date, "2026-12-09");
    assert.equal(view.capacity.FADL["2026-11-16"].capacityMin, 950);
    assert.equal(view.arrivalRows[0].lot_no, "L001");
    assert.deepEqual(view.boardCardOrder, [group]);
    assert.equal(view.forged, undefined);
    const historyResponse = await api("/plans");
    const history = (await historyResponse.json()).data;
    assert.equal(history.plans[0].hasSnapshot, true);
  });
  sourceRows = [work({ lot_no: "NEW-LOT", qty: 9999 })];
  settings = [row({ resource_count: 9 })];
  const readStart = pool.log.length;
  await withApi(pool, async api => {
    const response = await api(`/plans/${header.plan_id}`);
    assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.equal(data.snapshot.arrivalRows[0].lot_no, "L001");
    assert.equal(data.snapshot.arrivalRows[0].qty, 1000);
    assert.equal(data.snapshot.capacity.FADL["2026-11-16"].capacityMin, 950);
    assert.equal(data.snapshot.plan.planId, header.plan_id);
    assert.equal(data.snapshot.plan.version, 1);
    assert.deepEqual(data.snapshot.boardCardOrder, [group]);
  }, { loadCalendar: async () => { throw new Error("Live calendar must not be read"); } });
  assert.ok(!pool.log.slice(readStart).some(entry => /planning_summary_gate|capacity_setting/.test(entry.sql)));
});

test("a version predating snapshots returns details with no invented historical board", async () => {
  const pool = fakePool([[/FROM planning\.work_plan p/, [historyRow(1)]]]);
  await withApi(pool, async api => {
    const response = await api(`/plans/${historyId(1)}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.snapshot, null);
  });
});

test("snapshot capture failure rolls back the save before any version or item is inserted", async () => {
  const pool = fakePool([[/CURRENT_DATE::text/, [{ today: "2026-11-12" }]], [/planning_summary_gate/, [work()]]]);
  await withApi(pool, async api => {
    const response = await api("/plan", { method: "POST", body: { baseVersion: 0, moves: [] } });
    assert.equal(response.status, 503);
  }, { loadCalendar: async () => { throw new Error("Calendar unavailable"); } });
  assert.equal(pool.log.at(-1).sql, "ROLLBACK");
  assert.ok(!pool.log.some(entry => /^INSERT/.test(entry.sql)));
});
