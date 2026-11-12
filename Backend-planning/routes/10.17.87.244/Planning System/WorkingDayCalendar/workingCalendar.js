const mariadb = require("mariadb");

class CalendarError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalendarError";
    this.code = "WORKING_CALENDAR_UNAVAILABLE";
  }
}

const dayNumber = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "0001-01-01") {
    throw new CalendarError("Calendar date is invalid");
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new CalendarError("Calendar date is invalid");
  }
  return time / 86400000;
};

const sourceDate = (value) => {
  if (typeof value !== "string") throw new CalendarError("Calendar date format is invalid");
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new CalendarError("Calendar date format is invalid");
  return dayNumber(`${match[3]}-${match[2]}-${match[1]}`);
};

const calendarConfig = (environment = process.env) => {
  const generic = { host: "MARIADB_HOST", port: "MARIADB_PORT", user: "MARIADB_USER",
    password: "MARIADB_PASSWORD", database: "MARIADB_DATABASE" };
  let names = generic;
  if (!Object.values(generic).some(name => Object.hasOwn(environment, name))) {
    const prefix = "MARIADB_HOST_NAME_";
    const suffixes = Object.keys(environment).filter(name => name.startsWith(prefix) && name.length > prefix.length)
      .map(name => name.slice(prefix.length));
    const suffix = environment.MARIADB_ENV_SUFFIX || (suffixes.length === 1 ? suffixes[0] : null);
    if (!suffix || !suffixes.includes(suffix)) throw new CalendarError("Calendar environment group is missing or ambiguous");
    names = { host: `MARIADB_HOST_NAME_${suffix}`, port: `MARIADB_PORTS_${suffix}`,
      user: `MARIADB_USER_NAME_${suffix}`, password: `MARIADB_PASSWORD_${suffix}`,
      database: `MARIADB_DATABASE_NAME_${suffix}` };
  }
  const config = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, environment[name]]));
  if (["host", "user", "database"].some(key => typeof config[key] !== "string" || !config[key].trim()) ||
    typeof config.password !== "string") throw new CalendarError("Calendar configuration is incomplete");
  const port = config.port === undefined ? 3306 : Number(config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CalendarError("Calendar port is invalid");
  return { ...config, port };
};

const createCalendarIndex = (rows, startDate, endDate) => {
  const start = dayNumber(startDate);
  const end = dayNumber(endDate);
  if (start > end || !Array.isArray(rows)) throw new CalendarError("Calendar range is invalid");
  const dates = new Map();
  for (const row of rows) {
    const date = sourceDate(row.w_date);
    if (date < start || date > end) continue;
    const shift = row.w_w;
    const result = row.w_result;
    if (!["D/S", "N/S"].includes(shift) || !["Working day", "Holiday"].includes(result)) {
      throw new CalendarError("Calendar contains an unsupported shift or result");
    }
    const shifts = dates.get(date) || new Map();
    if (shifts.has(shift) && shifts.get(shift) !== result) throw new CalendarError("Calendar contains conflicting results within one shift");
    shifts.set(shift, result);
    dates.set(date, shifts);
  }
  const ordinals = new Map();
  let cumulative = 0;
  for (let date = start; date <= end; date += 1) {
    const shifts = dates.get(date);
    if (shifts && (!shifts.has("D/S") || !shifts.has("N/S"))) throw new CalendarError("Calendar is missing a required shift");
    // A wholly absent date retains the original calendar-day count, including weekends.
    if (!shifts || [...shifts.values()].includes("Working day")) cumulative += 1;
    ordinals.set(date, cumulative);
  }
  return {
    isWorking(dateStr) {
      const date = dayNumber(dateStr);
      if (!ordinals.has(date)) throw new CalendarError("Calendar does not cover the requested date");
      const shifts = dates.get(date);
      return !shifts || [...shifts.values()].includes("Working day");
    },
    dayLeft(today, target) {
      const current = dayNumber(today);
      const shipping = dayNumber(target);
      if (!ordinals.has(current) || !ordinals.has(shipping)) throw new CalendarError("Calendar does not cover the requested shipping date");
      return ordinals.get(shipping) - ordinals.get(current);
    },
  };
};

const loadCalendar = async (startDate, endDate, { environment = process.env, connect = mariadb.createConnection } = {}) => {
  const start = dayNumber(startDate);
  if (start > dayNumber(endDate)) throw new CalendarError("Calendar range is invalid");
  const config = calendarConfig(environment);
  let connection;
  try {
    connection = await connect({ ...config, connectTimeout: 5000, socketTimeout: 10000, dateStrings: true });
    await connection.query("START TRANSACTION READ ONLY");
    const rows = await connection.query(`SELECT w_date, w_w, w_result FROM tbl_date
      WHERE STR_TO_DATE(w_date, '%d/%m/%Y') BETWEEN ? AND ?`, [startDate, endDate]);
    return createCalendarIndex(rows, startDate, endDate);
  } catch (error) {
    if (error instanceof CalendarError) throw error;
    throw new CalendarError("Unable to read the working-day calendar. Existing planning data was preserved.");
  } finally {
    if (connection) {
      await connection.rollback().catch(() => {});
      await connection.end().catch(() => {});
    }
  }
};

const priorityForDayLeft = (days) => {
  if (!Number.isInteger(days)) throw new CalendarError("Working-day count is invalid");
  if (days < 0) return "Urgent";
  if (days <= 3) return "High";
  if (days <= 7) return "Top";
  if (days <= 14) return "Next Week";
  return "Next Plan";
};

const refreshPoCalendarFields = async (client, poList, loader = loadCalendar) => {
  if (!poList.length) return;
  const { rows } = await client.query("SELECT CURRENT_DATE::text AS today");
  const today = rows[0]?.today;
  dayNumber(today);
  const dates = [today, ...poList.map(po => po.ship_to_p1)];
  dates.forEach(dayNumber);
  dates.sort();
  const calendar = await loader(dates[0], dates[dates.length - 1]);
  for (const po of poList) {
    po.base_day_left = calendar.dayLeft(today, po.ship_to_p1);
    po.base_priority = priorityForDayLeft(po.base_day_left);
  }
};

module.exports = { CalendarError, calendarConfig, createCalendarIndex, loadCalendar, priorityForDayLeft, refreshPoCalendarFields };
