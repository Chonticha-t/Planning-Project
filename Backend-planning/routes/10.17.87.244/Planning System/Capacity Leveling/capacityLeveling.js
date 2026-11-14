// Pure capacity and gate-load rules for Capacity Leveling. No database access here.

// FFPC, MFPC, W/H and MW/H are intentionally not leveled.
const LEVELING_GATES = ["FVAC", "FADL", "FIN", "MMOT", "MBLK", "MFIN"];
const GATE_GROUP = { FVAC: "FPC", FADL: "FPC", FIN: "FPC", MMOT: "SMT", MBLK: "SMT", MFIN: "SMT" };
const SHIFTS = ["day", "night"];
const SPECIAL_ACTIONS = ["ot", "work", "off"];
const NORMAL_VALID_FROM = "1900-01-01";
const NORMAL_VALID_TO = "9999-12-31";

// 720-minute shift = 540 regular + 180 OT. OT starts closed; MC is entered later.
const DEFAULT_SHIFT = Object.freeze({
  settingId: null, enabled: true, mcLines: null, manpower: null, minPerShift: 540,
  otEnabled: false, otMinutes: 180, break1: true, break1Min: 10, break2: true, break2Min: 10,
  lunch: true, lunchMin: 45, efficiency: 1,
});

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

const isDate = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const dateRange = (start, end) => {
  const days = [];
  for (let time = Date.parse(`${start}T00:00:00Z`); time <= Date.parse(`${end}T00:00:00Z`); time += 86400000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
};

const round2 = (value) => Math.round(value * 100) / 100;

const positiveInt = (value, max = 10000) => {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 && num <= max ? num : null;
};

const calculateLotLoadMin = (leadDays, totalProcInGate, normalMin) => {
  if (leadDays === null || normalMin <= 0) return null;
  const lotDays = totalProcInGate !== null ? leadDays / totalProcInGate : 1;
  return round2(lotDays * normalMin);
};

// Minutes one machine can run in the shift: regular - enabled breaks (+ OT when open).
const shiftMinutesPerMachine = (shift, otOn = shift.otEnabled) => {
  const breaks = (shift.break1 ? shift.break1Min : 0) + (shift.break2 ? shift.break2Min : 0) +
    (shift.lunch ? shift.lunchMin : 0);
  return Math.max(0, shift.minPerShift - breaks + (otOn ? shift.otMinutes : 0));
};

// A special day replaces the calendar and the shift switch for that date and shift only.
const effectiveShift = (shift, { isWorkingDay, special }) => {
  let open = shift.enabled && isWorkingDay;
  let otOn = shift.otEnabled;
  if (special === "off") open = false;
  if (special === "ot") { open = true; otOn = true; }
  if (special === "work") { open = true; otOn = false; }
  if (!open) return { open: false, otOn: false, capacityMin: 0, isDefaultMc: false };
  // Unconfigured machine count defaults to 1 MC for calculation without persisting 1 to DB.
  const isDefaultMc = shift.mcLines === null;
  const mc = isDefaultMc ? 1 : shift.mcLines;
  const capacityMin = round2(mc * shift.efficiency * shiftMinutesPerMachine(shift, otOn));
  return { open: true, otOn, capacityMin, isDefaultMc };
};

const dayCapacity = (gateConfig, date, isWorkingDay) => {
  const shifts = {};
  for (const code of SHIFTS) {
    const shift = gateConfig.shifts[code];
    shifts[code] = effectiveShift(shift, { isWorkingDay, special: shift.specialDays[date] });
  }
  const open = SHIFTS.map((code) => shifts[code]).filter((shift) => shift.open);
  const configured = open.every((shift) => shift.capacityMin !== null);
  return {
    off: open.length === 0,
    hasOt: open.some((shift) => shift.otOn),
    isDefaultMc: open.some((shift) => shift.isDefaultMc),
    capacityMin: open.length === 0 ? 0 : configured
      ? round2(open.reduce((sum, shift) => sum + shift.capacityMin, 0)) : null,
    shifts,
  };
};

const capacityGrid = (config, days) => Object.fromEntries(config.map((gate) => [
  gate.gate,
  Object.fromEntries(days.map((day) => [day.date, dayCapacity(gate, day.date, day.isWorking)])),
]));

// Green up to 85%, yellow up to 100%, red above.
const loadStatus = (pct) => (pct > 100 ? "red" : pct > 85 ? "yellow" : "green");

const specialFromRow = (row) => (!row.is_working_day ? "off" : row.ot_enabled ? "ot" : "work");

const shiftFromRow = (row) => ({
  settingId: row.setting_id,
  enabled: row.is_working_day,
  mcLines: row.resource_count === null || row.resource_count === undefined ? null : Number(row.resource_count),
  manpower: row.manpower === null || row.manpower === undefined ? null : Number(row.manpower),
  minPerShift: Number(row.regular_minutes_per_shift),
  otEnabled: row.ot_enabled,
  otMinutes: Number(row.ot_minutes_per_shift),
  break1: row.break1_enabled, break1Min: Number(row.break1_minutes),
  break2: row.break2_enabled, break2Min: Number(row.break2_minutes),
  lunch: row.lunch_enabled, lunchMin: Number(row.lunch_minutes),
  efficiency: Number(row.efficiency),
});

// Normal rows give the settings; exception rows only contribute the day type, so a later
// change of MC or breaks also applies to special days.
const buildCapacityConfig = (rows) => LEVELING_GATES.map((gate) => {
  const shifts = {};
  for (const code of SHIFTS) {
    const own = rows.filter((row) => row.gate_name === gate && row.shift_code === code);
    const normal = own.find((row) => row.setting_kind === "normal");
    shifts[code] = {
      ...(normal ? shiftFromRow(normal) : DEFAULT_SHIFT),
      specialDays: Object.fromEntries(own.filter((row) => row.setting_kind === "exception")
        .map((row) => [row.valid_from, specialFromRow(row)])),
    };
  }
  return { gate, group: GATE_GROUP[gate], shifts };
});

const minutes = (value, name) => {
  const number = Number(value);
  if (value === null || value === "" || !Number.isFinite(number) || number < 0 || number > 1440) {
    throw new ValidationError(`${name} must be between 0 and 1440 minutes.`);
  }
  return round2(number);
};

const optionalCount = (value, name) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100000) {
    throw new ValidationError(`${name} must be a whole number of zero or more.`);
  }
  return number;
};

const flag = (value, name) => {
  if (typeof value !== "boolean") throw new ValidationError(`${name} must be true or false.`);
  return value;
};

const parseShift = (input, label) => {
  if (!input || typeof input !== "object") throw new ValidationError(`${label} settings are missing.`);
  const shift = {
    enabled: flag(input.enabled, `${label} shift active`),
    mcLines: optionalCount(input.mcLines, `${label} MC`),
    manpower: optionalCount(input.manpower, `${label} manpower`),
    minPerShift: minutes(input.minPerShift, `${label} minutes per shift`),
    otEnabled: flag(input.otEnabled, `${label} OT`),
    otMinutes: minutes(input.otMinutes, `${label} OT minutes`),
    break1: flag(input.break1, `${label} break 1`), break1Min: minutes(input.break1Min, `${label} break 1`),
    break2: flag(input.break2, `${label} break 2`), break2Min: minutes(input.break2Min, `${label} break 2`),
    lunch: flag(input.lunch, `${label} lunch`), lunchMin: minutes(input.lunchMin, `${label} lunch`),
    efficiency: input.efficiency === undefined ? 1 : Number(input.efficiency),
  };
  if (!Number.isFinite(shift.efficiency) || shift.efficiency <= 0 || shift.efficiency > 1) {
    throw new ValidationError(`${label} efficiency must be above 0 and at most 1.`);
  }
  const breaks = (shift.break1 ? shift.break1Min : 0) + (shift.break2 ? shift.break2Min : 0) +
    (shift.lunch ? shift.lunchMin : 0);
  if (breaks > shift.minPerShift) throw new ValidationError(`${label} breaks exceed the shift minutes.`);
  if (shift.minPerShift + shift.otMinutes > 1440) {
    throw new ValidationError(`${label} shift minutes plus OT exceed one day.`);
  }
  // Optional: the complete set of special days for this shift within the editable window.
  if (input.specialDays !== undefined) {
    const entries = Object.entries(input.specialDays ?? {});
    if (input.specialDays === null || typeof input.specialDays !== "object" || entries.length > 400 ||
      entries.some(([date, action]) => !isDate(date) || !SPECIAL_ACTIONS.includes(action))) {
      throw new ValidationError(`${label} special days must be valid dates set to OT, normal or day off.`);
    }
    shift.specialDays = Object.fromEntries(entries);
  }
  return shift;
};

const parseSettingsPayload = (body) => {
  if (!Array.isArray(body?.gates) || body.gates.length === 0) throw new ValidationError("No gate settings were sent.");
  const seen = new Set();
  return body.gates.map((gate) => {
    if (!LEVELING_GATES.includes(gate?.gate) || seen.has(gate.gate)) {
      throw new ValidationError("Gate settings contain an unknown or repeated gate.");
    }
    seen.add(gate.gate);
    return { gate: gate.gate, shifts: Object.fromEntries(SHIFTS.map((code) => [
      code, parseShift(gate.shifts?.[code], `${gate.gate} ${code}`),
    ])) };
  });
};

const SHIFT_FIELDS = ["enabled", "mcLines", "manpower", "minPerShift", "otEnabled", "otMinutes",
  "break1", "break1Min", "break2", "break2Min", "lunch", "lunchMin", "efficiency"];
const sameShift = (a, b) => SHIFT_FIELDS.every((field) => a[field] === b[field]);

// Stable identity that survives the hourly rebuild; PRI and row order are never used.
const workKey = (row) => {
  const lot = typeof row.lot_no === "string" ? row.lot_no.trim() : "";
  return lot ? `LOT|${lot}|${row.due_date}` : `NEED|${row.prd_name}|${row.due_date}`;
};

// Match Summary Gate's reporting identity, with the source arrival date as the move scope.
// A changed source date becomes an orphan rather than reusing a release-date move.
const arrivalWorkKey = (row, index = 0) => {
  const lot = row.lot_no?.trim() || "";
  const need = row.gate_state === "need_wip" || lot.toUpperCase() === "NEED WIP";
  const identity = lot && !need ? ["lot", row.gate_name, lot, row.arrive_by]
    : [need ? "need" : "unidentified", row.gate_name, row.prd_name, row.item, row.po_no,
      row.due_date, row.pri, row.arrive_by, need ? null : index];
  return `ARR|${require("node:crypto").createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`;
};

const preferLiveRow = (current, candidate) => {
  if (!current) return candidate;
  const currentInGate = current.gate_state === "in_gate";
  const candidateInGate = candidate.gate_state === "in_gate";
  if (currentInGate !== candidateInGate) return candidateInGate ? candidate : current;
  const currentPri = Number.isInteger(current.pri) ? current.pri : Number.MAX_SAFE_INTEGER;
  const candidatePri = Number.isInteger(candidate.pri) ? candidate.pri : Number.MAX_SAFE_INTEGER;
  return candidatePri < currentPri ? candidate : current;
};

const hasPassedGate = (row, passedLive, liveLot) => {
  if (passedLive) return true;
  if (!liveLot) return false;
  if (liveLot.current_gate === "PRE_FFPC" || liveLot.current_gate === "FFPC") return false;
  if (Number.isFinite(row.gate_order) && Number.isFinite(liveLot.gate_order)) {
    return liveLot.gate_order > row.gate_order;
  }
  const rowIndex = LEVELING_GATES.indexOf(row.gate_name);
  const currentIndex = LEVELING_GATES.indexOf(liveLot.current_gate);
  if (rowIndex >= 0 && currentIndex >= 0) {
    return currentIndex > rowIndex;
  }
  const liveGateIndex = LEVELING_GATES.indexOf(liveLot.gate_name);
  return rowIndex >= 0 && liveGateIndex > rowIndex;
};

const mergeLiveStatusIntoLockedRows = (lockedRows, liveRows) => {
  if (!Array.isArray(lockedRows)) return [];
  const byAllocation = new Map();
  const byLotGate = new Map();
  const byLot = new Map();
  const passedByAllocation = new Map();
  const passedByLotGate = new Map();
  for (const row of Array.isArray(liveRows) ? liveRows : []) {
    if (!row) continue;
    const lot = typeof row.lot_no === "string" ? row.lot_no.trim() : "";
    const need = row.gate_state === "need_wip" || lot.toUpperCase() === "NEED WIP";
    if (!lot || need) continue;
    const allocationKey = JSON.stringify([row.gate_name, lot, row.prd_name ?? "", row.due_date ?? "", row.item ?? "", row.po_no ?? ""]);
    const lotGateKey = JSON.stringify([row.gate_name, lot]);
    if (row.gate_state === "passed") {
      passedByAllocation.set(allocationKey, row);
      passedByLotGate.set(lotGateKey, row);
      continue;
    }
    byAllocation.set(allocationKey, preferLiveRow(byAllocation.get(allocationKey), row));
    byLotGate.set(lotGateKey, preferLiveRow(byLotGate.get(lotGateKey), row));
    byLot.set(lot, preferLiveRow(byLot.get(lot), row));
  }
  return lockedRows.map((row) => {
    const savedFields = {
      saved_gate_state: row.saved_gate_state ?? row.gate_state,
      saved_current_gate: row.saved_current_gate !== undefined ? row.saved_current_gate : row.current_gate,
      saved_proc_disp: row.saved_proc_disp !== undefined ? row.saved_proc_disp : row.proc_disp,
      saved_rem_proc_in_gate: row.saved_rem_proc_in_gate !== undefined ? row.saved_rem_proc_in_gate : row.rem_proc_in_gate,
      saved_pri: row.saved_pri !== undefined ? row.saved_pri : row.pri,
    };
    const lot = typeof row.lot_no === "string" ? row.lot_no.trim() : "";
    const need = row.gate_state === "need_wip" || lot.toUpperCase() === "NEED WIP";
    if (!lot || need) return { ...row, ...savedFields, passed_gate: false };
    const allocationKey = JSON.stringify([row.gate_name, lot, row.prd_name ?? "", row.due_date ?? "", row.item ?? "", row.po_no ?? ""]);
    const lotGateKey = JSON.stringify([row.gate_name, lot]);
    const live = byAllocation.get(allocationKey) ?? byLotGate.get(lotGateKey);
    if (!live || !live.gate_state) {
      const passedLive = passedByAllocation.get(allocationKey) ?? passedByLotGate.get(lotGateKey);
      const liveLot = byLot.get(lot);
      if (hasPassedGate(row, passedLive, liveLot)) {
        const source = liveLot ?? passedLive;
        return {
          ...row,
          ...savedFields,
          current_gate: source?.current_gate !== undefined ? source.current_gate : row.current_gate,
          proc_disp: source?.proc_disp !== undefined ? source.proc_disp : row.proc_disp,
          is_hold: Boolean(source?.is_hold),
          passed_gate: true,
        };
      }
      return { ...row, ...savedFields, passed_gate: false };
    }
    return {
      ...row,
      ...savedFields,
      gate_state: live.gate_state,
      current_gate: live.current_gate,
      proc_disp: live.proc_disp,
      rem_proc_in_gate: live.rem_proc_in_gate,
      total_proc_in_gate: live.total_proc_in_gate ?? row.total_proc_in_gate,
      is_hold: Boolean(live.is_hold),
      status: live.status ?? row.status,
      pri: live.pri !== undefined ? live.pri : row.pri,
      passed_gate: false,
    };
  });
};

const buildArrivalCards = (rows, moves, today, config = buildCapacityConfig([])) => {
  const groups = new Map();
  let undated = 0;
  rows.forEach((row, index) => {
    if (row.gate_state === "passed") return;
    if (!isDate(row.arrive_by)) { undated++; return; }
    const key = arrivalWorkKey(row, index);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  const byMove = new Map(moves.map((move) => [`${move.work_key}|${move.gate_name}`, move]));
  const used = new Set();
  const cards = [...groups].map(([key, allocations]) => {
    const row = allocations[0];
    const id = `${key}|${row.gate_name}`;
    const move = byMove.get(id);
    if (move) used.add(id);
    const need = row.gate_state === "need_wip" || row.lot_no?.trim().toUpperCase() === "NEED WIP";
    const kind = need ? "need" : row.lot_no?.trim() ? "lot" : "unidentified";
    const gate = config.find((item) => item.gate === row.gate_name);
    const standardShiftMin = Object.fromEntries(SHIFTS.map((code) => [code, gate ? shiftMinutesPerMachine(gate.shifts[code], false) : 0]));
    const durations = allocations.map((item) => Number(item.lead_days));
    const leadDays = durations.every((value) => Number.isInteger(value) && value > 0 && value <= 366) ? Math.max(...durations) : null;
    const procCounts = allocations.map((item) => positiveInt(item.total_proc_in_gate)).filter((v) => v !== null);
    const totalProcInGate = procCounts.length > 0 ? Math.max(...procCounts) : null;
    const normal = standardShiftMin.day + standardShiftMin.night;
    const loadMin = kind === "lot" ? calculateLotLoadMin(leadDays, totalProcInGate, normal) : 0;
    const deadlines = allocations.map((item) => item.must_out).filter(isDate).sort();
    const dueDates = allocations.map((item) => item.due_date).filter(isDate).sort();
    const activeRow = allocations.find((item) => item.gate_state === "in_gate") || row;
    const savedGateState = allocations.some((item) => (item.saved_gate_state ?? item.gate_state) === "in_gate")
      ? "in_gate"
      : (row.saved_gate_state ?? row.gate_state);
    return {
      id, workKey: key, gate: row.gate_name, prdName: row.prd_name, item: row.item, lotNo: row.lot_no,
      qty: Number(row.qty) || 0, sheets: row.sheets == null ? null : Number(row.sheets),
      status: activeRow.status, gateState: activeRow.gate_state, savedGateState, processGroup: row.process_group,
      currentGate: activeRow.current_gate, currentProc: activeRow.proc_disp, isHold: allocations.some((item) => item.is_hold === true),
      passedGate: allocations.every((item) => item.passed_gate === true),
      dueDate: dueDates[0] || "", arriveBy: row.arrive_by, mustOut: deadlines[0] || "",
      baseDate: row.arrive_by, plannedDate: move?.planned_date || row.arrive_by, moved: Boolean(move),
      sourceChanged: Boolean(move) && move.original_date !== row.arrive_by, overdue: row.arrive_by < today,
      prevGate: row.prev_gate, prevDate: row.prev_must_out, nextGate: row.next_gate, nextDate: row.next_arrive_by,
      leadDays, totalProcInGate, standardShiftMin, loadMin,
      kind, allocations, sourceIds: [id],
    };
  });
  const orphanMoves = moves.filter((move) => !used.has(`${move.work_key}|${move.gate_name}`)).map((move) => ({
    workKey: move.work_key, gate: move.gate_name, prdName: move.prd_name, lotNo: move.lot_no,
    dueDate: move.due_date, originalDate: move.original_date, plannedDate: move.planned_date,
  }));
  return { cards, orphanMoves, undated, duplicates: rows.filter((row) => row.gate_state !== "passed" && isDate(row.arrive_by)).length - cards.length };
};

const enrichSnapshotWithLiveStatus = (snapshotData, liveRows) => {
  if (!snapshotData || !Array.isArray(snapshotData.arrivalRows) || !Array.isArray(snapshotData.cards)) {
    return snapshotData;
  }
  const arrivalRows = mergeLiveStatusIntoLockedRows(snapshotData.arrivalRows, liveRows);
  const byCard = new Map();
  for (const row of arrivalRows) {
    if (row.gate_state === "passed") continue;
    const key = `${row.workKey}|${row.gate_name}`;
    const list = byCard.get(key) || [];
    list.push(row);
    byCard.set(key, list);
  }
  const cards = snapshotData.cards.map((card) => {
    const rows = byCard.get(`${card.workKey}|${card.gate}`);
    if (!rows || !rows.length) return card;
    const activeRow = rows.find((item) => item.gate_state === "in_gate") || rows[0];
    const savedGateState = rows.some((item) => (item.saved_gate_state ?? item.gate_state) === "in_gate")
      ? "in_gate"
      : (rows[0].saved_gate_state ?? card.savedGateState ?? card.gateState);
    return {
      ...card,
      status: activeRow.status ?? card.status,
      gateState: activeRow.gate_state ?? card.gateState,
      savedGateState,
      currentGate: activeRow.current_gate !== undefined ? activeRow.current_gate : card.currentGate,
      currentProc: activeRow.proc_disp !== undefined ? activeRow.proc_disp : card.currentProc,
      isHold: rows.some((item) => item.is_hold === true),
      passedGate: rows.every((item) => item.passed_gate === true),
    };
  });
  return { ...snapshotData, arrivalRows, cards };
};

// Summary Gate uses arrival as the boundary: completion is leadDays working days later.
const arrivalEndDate = (arrival, leadDays, calendar) => {
  if (!isDate(arrival) || !Number.isInteger(leadDays) || leadDays < 1 || leadDays > 366) return null;
  let remaining = leadDays;
  let time = Date.parse(`${arrival}T00:00:00Z`);
  for (let step = 0; step <= leadDays * 7 + 14; step++, time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (step > 0 && calendar.isWorking(date)) remaining--;
    if (remaining === 0) return date;
  }
  return null;
};

// One card per work item and gate. A saved move replaces the must_out date for that gate only.
const buildCards = (rows, moves, today, config = buildCapacityConfig([])) => {
  const moveByKey = new Map(moves.map((move) => [`${move.work_key}|${move.gate_name}`, move]));
  const used = new Set();
  const seen = new Map();
  const cards = [];
  let undated = 0;
  let duplicates = 0;
  const standards = new Map(config.map(({ gate, shifts }) => [gate,
    Object.fromEntries(SHIFTS.map((code) => [code, shiftMinutesPerMachine(shifts[code], false)])),
  ]));
  for (const row of rows) {
    if (!isDate(row.must_out)) { undated += 1; continue; }
    const key = workKey(row);
    const moveKey = `${key}|${row.gate_name}`;
    if (seen.has(moveKey)) { duplicates += 1; continue; }
    seen.set(moveKey, true);
    const move = moveByKey.get(moveKey);
    if (move) used.add(moveKey);
    // Work that is already overdue still has to be done, so it loads today.
    const baseDate = row.must_out < today ? today : row.must_out;
    const target = move ? move.planned_date : baseDate;
    // Bound calendar expansion and flag bad/missing master values instead of inventing a duration.
    const leadDays = positiveInt(row.lead_days, 366);
    const totalProcInGate = positiveInt(row.total_proc_in_gate);
    const standardShiftMin = standards.get(row.gate_name) ?? { day: 0, night: 0 };
    const standardMin = round2(standardShiftMin.day + standardShiftMin.night);
    cards.push({
      id: moveKey,
      workKey: key, gate: row.gate_name,
      prdName: row.prd_name, item: row.item, lotNo: row.lot_no, dueDate: row.due_date,
      status: row.status, qty: Number(row.qty) || 0, sheets: row.sheets === null ? null : Number(row.sheets),
      gateState: row.gate_state, processGroup: row.process_group, prdCategory: row.prd_category,
      currentGate: row.current_gate, currentProc: row.proc_disp,
      isHold: row.is_hold === true,
      arriveBy: row.arrive_by, mustOut: row.must_out, baseDate,
      plannedDate: target < today ? today : target,
      moved: Boolean(move),
      // The source date differs from the one the planner saw when the move was saved.
      sourceChanged: Boolean(move) && move.original_date !== row.must_out,
      overdue: row.must_out < today,
      prevGate: row.prev_gate, prevDate: row.prev_must_out,
      nextGate: row.next_gate, nextDate: row.next_must_out,
      leadDays, totalProcInGate, standardShiftMin,
      loadMin: calculateLotLoadMin(leadDays, totalProcInGate, standardMin),
    });
  }
  const orphanMoves = moves.filter((move) => !used.has(`${move.work_key}|${move.gate_name}`)).map((move) => ({
    workKey: move.work_key, gate: move.gate_name, prdName: move.prd_name, lotNo: move.lot_no,
    dueDate: move.due_date, originalDate: move.original_date, plannedDate: move.planned_date,
  }));
  return { cards, orphanMoves, undated, duplicates };
};

// A bounded calendar also covers cards released after the visible range whose occupancy overlaps it.
const occupancyCalendarRange = (cards, start, end) => {
  const maxLead = cards.reduce((longest, card) => Math.max(longest, card.leadDays ?? 1), 1);
  const calendarStart = new Date(Date.parse(`${start}T00:00:00Z`) - (maxLead * 7 + 14) * 86400000)
    .toISOString().slice(0, 10);
  let calendarEnd = end;
  for (const card of cards) {
    if (card.leadDays !== null && isDate(card.plannedDate) && card.plannedDate > calendarEnd) calendarEnd = card.plannedDate;
    if (card.leadDays !== null && card.baseDate > calendarEnd) calendarEnd = card.baseDate;
  }
  if (Date.parse(`${calendarEnd}T00:00:00Z`) - Date.parse(`${calendarStart}T00:00:00Z`) > 3660 * 86400000) {
    throw new ValidationError("The planning dates exceed the supported ten-year calendar range.");
  }
  return { start: calendarStart, end: calendarEnd };
};

const parsePlanPayload = (body, today) => {
  const baseVersion = body?.baseVersion ?? 0;
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new ValidationError("Plan version is invalid.");
  if (!Array.isArray(body?.moves) || body.moves.length > 5000) throw new ValidationError("Plan moves are invalid.");
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const seen = new Set();
  const moves = body.moves.map((move) => {
    const key = `${move?.workKey}|${move?.gate}`;
    if (typeof move?.workKey !== "string" || !move.workKey.trim() || !LEVELING_GATES.includes(move.gate) || seen.has(key)) {
      throw new ValidationError("A moved card is invalid or repeated.");
    }
    if (!isDate(move.plannedDate) || move.plannedDate < today) {
      throw new ValidationError("A card cannot be planned on a past or invalid date.");
    }
    seen.add(key);
    return { workKey: move.workKey, gate: move.gate, plannedDate: move.plannedDate };
  });
  let boardCardOrder;
  if (body.boardCardOrder !== undefined) {
    if (!Array.isArray(body.boardCardOrder) || body.boardCardOrder.length > 5000) {
      throw new ValidationError("Board card order is invalid.");
    }
    const seenGroups = new Set();
    const seenCards = new Set();
    boardCardOrder = body.boardCardOrder.map((group) => {
      const key = JSON.stringify([group?.gate, group?.date]);
      if (!LEVELING_GATES.includes(group?.gate) || !isDate(group?.date) || group.date < today ||
        seenGroups.has(key) || !Array.isArray(group.cardIds) || group.cardIds.length === 0 || group.cardIds.length > 5000) {
        throw new ValidationError("Board order contains an invalid or repeated gate/day.");
      }
      seenGroups.add(key);
      const cardIds = group.cardIds.map((id) => {
        if (typeof id !== "string" || !id || id.length > 2048 || seenCards.has(id) || seenCards.size >= 5000) {
          throw new ValidationError("Board order contains an invalid or repeated card.");
        }
        seenCards.add(id);
        return id;
      });
      return { gate: group.gate, date: group.date, cardIds };
    });
  }
  return { baseVersion, note, moves, boardCardOrder };
};

/** Match the frontend's physical-lot buckets; stale saved identities fall back to source priority. */
const resolveBoardCardOrder = (groups, cards, today, strict = false) => {
  const allowed = new Set(cards.map((card) => JSON.stringify([
    card.gate, card.plannedDate, card.kind, card.kind === "lot" ? card.lotNo.trim() : card.workKey,
  ])));
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((group) => {
    if (!group || !Array.isArray(group.cardIds) || group.date < today) return [];
    const cardIds = group.cardIds.filter((id) => {
      if (!allowed.has(id)) return false;
      // The identity itself must belong to the submitted gate/day, not another group.
      const identity = JSON.parse(id);
      return identity[0] === group.gate && identity[1] === group.date;
    });
    if (strict && cardIds.length !== group.cardIds.length) {
      throw new ValidationError("Board cards or arrival dates changed. Reload before saving their order.");
    }
    return cardIds.length ? [{ gate: group.gate, date: group.date, cardIds }] : [];
  });
};

module.exports = {
  LEVELING_GATES, GATE_GROUP, SHIFTS, SPECIAL_ACTIONS, NORMAL_VALID_FROM, NORMAL_VALID_TO, DEFAULT_SHIFT,
  ValidationError, isDate, dateRange, shiftMinutesPerMachine, effectiveShift, dayCapacity, capacityGrid,
  loadStatus, buildCapacityConfig, parseSettingsPayload, sameShift,
  workKey, buildCards, occupancyCalendarRange, parsePlanPayload, arrivalWorkKey, buildArrivalCards, arrivalEndDate, resolveBoardCardOrder,
  mergeLiveStatusIntoLockedRows, enrichSnapshotWithLiveStatus,
};
