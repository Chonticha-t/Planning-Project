// Gate-only, bounded cache. Concurrent viewers share the same calendar read.
const createGateCalendarCache = (loadCalendar, { ttlMs = 60000, maxEntries = 8, now = Date.now } = {}) => {
  const entries = new Map();
  return async (start, end, { force = false } = {}) => {
    const key = JSON.stringify([start, end]);
    const cached = entries.get(key);
    const result = entry => ({ calendar: entry.calendar, maxAgeMs: Math.max(0, entry.expiresAt - now()) });
    if (cached?.pending) {
      await cached.pending;
      return result(cached);
    }
    if (!force && cached && cached.expiresAt > now()) return result(cached);

    const entry = { expiresAt: 0, calendar: null, pending: null };
    entry.pending = Promise.resolve().then(() => loadCalendar(start, end)).then(calendar => {
      entry.calendar = calendar;
      entry.expiresAt = now() + ttlMs;
      entry.pending = null;
      return calendar;
    }).catch(error => {
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    });
    entries.set(key, entry);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
    await entry.pending;
    return result(entry);
  };
};

module.exports = { createGateCalendarCache };
