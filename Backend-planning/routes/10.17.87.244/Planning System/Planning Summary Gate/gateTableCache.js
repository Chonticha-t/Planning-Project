// Process-local cache for the read-only gate table. No database credentials or rows are logged.
const createGateTableCache = ({
  ttlMs = 60000, maxEntries = 16, maxBytes = 64 * 1024 * 1024, now = Date.now,
} = {}) => {
  const entries = new Map();
  const counts = { hits: 0, misses: 0, shared: 0, refreshes: 0, bypasses: 0, oversized: 0, evictions: 0, invalidations: 0 };
  let bytes = 0;
  const remove = key => {
    const entry = entries.get(key);
    if (entry) bytes -= entry.bytes;
    entries.delete(key);
  };
  const stats = () => ({ ...counts, entries: entries.size, bytes, maxBytes, ttlMs });
  const invalidate = () => {
    entries.clear();
    bytes = 0;
    counts.invalidations++;
  };
  const read = async (key, load, { force = false } = {}) => {
    const reply = (entry, status, reason, previousAgeMs = null) => ({
      value: entry.value, status: entry.oversized ? "OVERSIZE" : status,
      reason: entry.oversized ? "BYTE_LIMIT" : reason, previousAgeMs,
      ageMs: Math.max(0, now() - entry.loadedAt), stats: stats(),
    });
    if (ttlMs <= 0 || maxEntries <= 0 || maxBytes <= 0 || Buffer.byteLength(key) > 16384) {
      counts.bypasses++;
      return { value: await load(), status: "BYPASS", reason: "DISABLED_OR_KEY_LIMIT", previousAgeMs: null, ageMs: 0, stats: stats() };
    }
    const cached = entries.get(key);
    // A manual refresh must not join an older ordinary read. Simultaneous forced reads can share.
    if (cached?.pending && (!force || cached.forced)) {
      counts.shared++;
      await cached.pending;
      return reply(cached, "SHARED", "IN_FLIGHT");
    }
    if (!force && cached && cached.expiresAt > now()) {
      counts.hits++;
      entries.delete(key);
      entries.set(key, cached);
      return reply(cached, "HIT", "FRESH");
    }
    const reason = force ? "FORCED" : cached ? "EXPIRED" : "ABSENT";
    const previousAgeMs = cached && !cached.pending ? Math.max(0, now() - cached.loadedAt) : null;
    for (const [entryKey, entry] of entries) {
      if (!entry.pending && entry.expiresAt <= now()) remove(entryKey);
    }
    remove(key);
    if (force) counts.refreshes++;
    else counts.misses++;
    const entry = { bytes: 0, value: null, loadedAt: 0, expiresAt: 0, pending: null, forced: force };
    entry.pending = Promise.resolve().then(load).then(value => {
      entry.value = value;
      entry.loadedAt = now();
      entry.expiresAt = entry.loadedAt + ttlMs;
      // Entry identity prevents invalidated, replaced or evicted reads from repopulating the cache.
      if (entries.get(key) === entry) {
        entry.bytes = Buffer.byteLength(JSON.stringify(value)) + Buffer.byteLength(key);
        bytes += entry.bytes;
        if (entry.bytes > maxBytes) {
          entry.oversized = true;
          counts.oversized++;
          remove(key);
        }
        while (bytes > maxBytes) {
          remove(entries.keys().next().value);
          counts.evictions++;
        }
      }
      entry.pending = null;
    }).catch(error => {
      if (entries.get(key) === entry) remove(key);
      throw error;
    });
    entries.set(key, entry);
    while (entries.size > maxEntries) {
      remove(entries.keys().next().value);
      counts.evictions++;
    }
    await entry.pending;
    return reply(entry, force ? "REFRESH" : "MISS", reason, previousAgeMs);
  };
  return { read, invalidate, stats };
};

module.exports = { createGateTableCache };
