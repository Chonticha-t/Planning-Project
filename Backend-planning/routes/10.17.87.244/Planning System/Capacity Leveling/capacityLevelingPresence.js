const express = require("express");
const { LEVELING_GATES, isDate } = require("./capacityLeveling");

const PRESENCE_TTL_MS = 45000;
const validTab = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const parseScopes = (value) => {
  if (!Array.isArray(value) || value.length > 256) throw new Error("Invalid editing areas.");
  const scopes = value.map((scope) => {
    if (!scope || !["plan", "capacity"].includes(scope.kind) || !LEVELING_GATES.includes(scope.gate) ||
      (scope.kind === "plan" && scope.date !== null && !isDate(scope.date))) throw new Error("Invalid editing area.");
    return { kind: scope.kind, gate: scope.gate, date: scope.kind === "capacity" ? null : scope.date };
  });
  return [...new Map(scopes.map((scope) => [JSON.stringify(scope), scope])).values()];
};

const groupEditors = (rows) => {
  const users = new Map();
  for (const row of rows) {
    const editor = users.get(row.username) ?? { username: row.username, fullName: row.full_name, role: row.role, scopes: [] };
    editor.scopes.push(...row.scopes);
    users.set(row.username, editor);
  }
  return [...users.values()].map((user) => ({ ...user,
    scopes: [...new Map(user.scopes.map((scope) => [JSON.stringify(scope), scope])).values()],
  })).sort((a, b) => a.username.localeCompare(b.username));
};

// Ephemeral rows in PostgreSQL let every backend worker see the same editors.
const createPresenceStore = (pool) => {
  let initialization;
  const ready = () => {
    if (!initialization) initialization = pool.query(`CREATE TABLE IF NOT EXISTS planning.capacity_leveling_presence (
      username VARCHAR(50) NOT NULL, tab_id UUID NOT NULL,
      full_name VARCHAR(100) NOT NULL, role VARCHAR(20) NOT NULL,
      scopes JSONB NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (username, tab_id)
    )`).catch((error) => { initialization = null; throw error; });
    return initialization;
  };
  return {
    async touch(user, tabId, scopes) {
      await ready();
      await pool.query("DELETE FROM planning.capacity_leveling_presence WHERE expires_at <= CURRENT_TIMESTAMP");
      if (!scopes.length) return this.remove(user.username, tabId);
      const expiresAt = new Date(Math.min(Date.now() + PRESENCE_TTL_MS, user.exp ? user.exp * 1000 : Infinity));
      await pool.query(`INSERT INTO planning.capacity_leveling_presence (username, tab_id, full_name, role, scopes, expires_at)
        VALUES ($1, $2, $3, $4, $5::jsonb, $6)
        ON CONFLICT (username, tab_id) DO UPDATE SET full_name = EXCLUDED.full_name,
          role = EXCLUDED.role, scopes = EXCLUDED.scopes, expires_at = EXCLUDED.expires_at`,
      [user.username, tabId, user.full_name || user.username, user.role, JSON.stringify(scopes), expiresAt]);
    },
    async remove(username, tabId) {
      await ready();
      await pool.query("DELETE FROM planning.capacity_leveling_presence WHERE username = $1 AND tab_id = $2", [username, tabId]);
    },
    async list() {
      await ready();
      const { rows } = await pool.query(`SELECT username, full_name, role, scopes FROM planning.capacity_leveling_presence
        WHERE expires_at > CURRENT_TIMESTAMP ORDER BY username, tab_id`);
      return groupEditors(rows);
    },
  };
};

const createPresenceRouter = ({ pool, verifyPlanner }) => {
  const router = express.Router();
  const store = createPresenceStore(pool);
  const viewers = new Set();
  let timer = null, pending = null;

  const removeViewer = (res) => {
    viewers.delete(res);
    if (!viewers.size && timer) { clearInterval(timer); timer = null; }
  };
  const refresh = () => {
    if (pending) return pending;
    pending = (async () => {
      try {
        const editors = await store.list();
        for (const res of viewers) {
          try {
            if (!res.write(`event: presence\ndata: ${JSON.stringify({ editors })}\n\n`)) {
              removeViewer(res); res.end();
            }
            res.flush?.();
          } catch { removeViewer(res); res.end(); }
        }
      } catch {
        for (const res of viewers) { removeViewer(res); res.end(); }
      }
    })().finally(() => { pending = null; });
    return pending;
  };

  router.get("/presence/events", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    viewers.add(res);
    res.on("close", () => removeViewer(res));
    if (!timer) { timer = setInterval(refresh, 5000); timer.unref?.(); }
    void refresh();
  });

  router.post("/presence", verifyPlanner, async (req, res) => {
    res.set("Cache-Control", "no-store");
    let scopes;
    try {
      if (!validTab(req.body?.tabId)) throw new Error("Invalid tab ID.");
      scopes = parseScopes(req.body?.scopes);
    } catch (error) { return res.status(400).json({ status: "ERROR", message: error.message }); }
    try {
      await store.touch(req.user, req.body.tabId, scopes);
      if (viewers.size) void refresh();
      return res.json({ status: "OK" });
    } catch { return res.status(503).json({ status: "ERROR", message: "Editing status is temporarily unavailable." }); }
  });
  router.delete("/presence/:tabId", verifyPlanner, async (req, res) => {
    if (!validTab(req.params.tabId)) return res.status(400).json({ status: "ERROR" });
    try {
      await store.remove(req.user.username, req.params.tabId);
      if (viewers.size) void refresh();
      return res.json({ status: "OK" });
    } catch { return res.status(503).json({ status: "ERROR" }); }
  });
  return router;
};

module.exports = { createPresenceRouter, createPresenceStore, parseScopes, groupEditors, PRESENCE_TTL_MS };
