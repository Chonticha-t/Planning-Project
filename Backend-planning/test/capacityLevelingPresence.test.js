const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const compression = require("compression");
const { createPresenceRouter, createPresenceStore, parseScopes, PRESENCE_TTL_MS } = require("../routes/10.17.87.244/Planning System/Capacity Leveling/capacityLevelingPresence");

const tabA = "11111111-1111-4111-8111-111111111111";
const tabB = "22222222-2222-4222-8222-222222222222";
const scope = { kind: "plan", gate: "FVAC", date: "2026-11-12" };
const planner = { username: "planner", full_name: "A Planner", role: "planner" };

// Shared database simulation: independent stores must share identity, expiry and tab ownership.
function database() {
  const rows = new Map();
  let now = Date.now(), unavailable = false;
  return {
    rows,
    advance(ms) { now += ms; },
    fail(value) { unavailable = value; },
    async query(sql, params = []) {
      if (unavailable) throw new Error("Database offline");
      if (sql.startsWith("CREATE TABLE")) return { rows: [] };
      if (sql.includes("INSERT INTO")) {
        rows.set(`${params[0]}|${params[1]}`, { username: params[0], full_name: params[2], role: params[3], scopes: JSON.parse(params[4]), expires_at: params[5].getTime() });
      } else if (sql.includes("DELETE") && sql.includes("username =")) rows.delete(`${params[0]}|${params[1]}`);
      else if (sql.includes("DELETE")) { for (const [key, row] of rows) if (row.expires_at <= now) rows.delete(key); }
      else if (sql.includes("SELECT username")) return { rows: [...rows.values()].filter(row => row.expires_at > now) };
      return { rows: [] };
    },
  };
}

test("editing areas reject forged gates, invalid dates and oversized drafts", () => {
  assert.deepEqual(parseScopes([scope, scope]), [scope]);
  for (const input of [null, [null], [{ ...scope, gate: "UNKNOWN" }], [{ ...scope, date: "2026-02-31" }], [{ ...scope, kind: "sql" }], Array(257).fill(scope)]) assert.throws(() => parseScopes(input));
});

test("workers merge tabs into one user; deleting one lease retains the other and expired editors disappear", async () => {
  const pool = database();
  const workerA = createPresenceStore(pool), workerB = createPresenceStore(pool);
  await workerA.touch(planner, tabA, [scope]);
  await workerB.touch(planner, tabB, [{ ...scope, gate: "FIN" }]);
  assert.equal((await workerA.list()).length, 1);
  assert.equal((await workerB.list())[0].scopes.length, 2);
  await workerA.remove("someone-else", tabB);
  assert.equal(pool.rows.size, 2);
  await workerA.remove(planner.username, tabA);
  assert.equal((await workerB.list())[0].scopes[0].gate, "FIN");
  pool.advance(PRESENCE_TTL_MS + 1);
  assert.deepEqual(await workerA.list(), []);
});

test("idle or cancelled editing removes the tab and leases cannot outlive the login token", async () => {
  const pool = database(), store = createPresenceStore(pool);
  await store.touch({ ...planner, exp: Math.floor(Date.now() / 1000) + 10 }, tabA, [scope]);
  pool.advance(11000);
  assert.deepEqual(await store.list(), []);
  await store.touch(planner, tabB, [scope]);
  await store.touch(planner, tabB, []);
  assert.equal(pool.rows.size, 0);
});

async function withServer(run) {
  const pool = database();
  const app = express();
  app.use(compression());
  app.use(express.json());
  app.use(createPresenceRouter({ pool, verifyPlanner: (req, res, next) => {
    if (req.headers.authorization !== "Bearer test") return res.status(401).json({ status: "ERROR" });
    req.user = planner; next();
  } }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, method = "GET", body, authenticated = true) => fetch(base + url, { method,
    headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer test" } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  try { await run({ request, pool }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("presence API uses authenticated identity and prevents deleting someone else's tab", async () => withServer(async ({ request, pool }) => {
  assert.equal((await request("/presence", "POST", { tabId: tabA, scopes: [scope] }, false)).status, 401);
  assert.equal((await request("/presence", "POST", { tabId: "-".repeat(36), scopes: [scope] })).status, 400);
  assert.equal((await request("/presence", "POST", { tabId: tabA, scopes: [scope], username: "admin", full_name: "Fake" })).status, 200);
  assert.equal([...pool.rows.values()][0].username, "planner");
  assert.equal([...pool.rows.values()][0].full_name, "A Planner");
  await createPresenceStore(pool).touch({ ...planner, username: "other" }, tabB, [scope]);
  await request(`/presence/${tabB}`, "DELETE");
  assert.equal(pool.rows.size, 2);
  await request(`/presence/${tabA}`, "DELETE");
  assert.equal(pool.rows.size, 1);
}));

function presenceReader(response) {
  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  return {
    async next() {
      let end = buffer.indexOf("\n\n");
      while (end < 0) {
        const part = await reader.read();
        assert.equal(part.done, false, "Expected an editing status event");
        buffer += part.value;
        end = buffer.indexOf("\n\n");
      }
      const event = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      assert.match(event, /^event: presence\n/);
      return JSON.parse(event.split("\n")[1].slice("data: ".length)).editors;
    },
    cancel: () => reader.cancel(),
  };
}

test("two tabs share the in-flight snapshot and receive writes without waiting for a poll", { timeout: 5000 }, async () => withServer(async ({ request, pool }) => {
  const query = pool.query.bind(pool);
  let markSnapshotStarted, releaseSnapshot;
  const snapshotStarted = new Promise(resolve => { markSnapshotStarted = resolve; });
  const snapshotBlocked = new Promise(resolve => { releaseSnapshot = resolve; });
  let reads = 0;
  pool.query = async (sql, params) => {
    const result = await query(sql, params);
    if (sql.includes("SELECT username") && ++reads === 1) {
      markSnapshotStarted();
      await snapshotBlocked;
    }
    return result;
  };
  const viewers = await Promise.all([1, 2].map(async () => presenceReader(await request("/presence/events", "GET", undefined, false))));
  await snapshotStarted;
  try {
    assert.equal((await request("/presence", "POST", { tabId: tabA, scopes: [scope] })).status, 200);
    assert.equal(reads, 1);
  } finally { releaseSnapshot(); }
  assert.deepEqual(await Promise.all(viewers.map(viewer => viewer.next())), [[], []]);
  const afterEdit = await Promise.all(viewers.map(viewer => viewer.next()));
  assert.deepEqual(afterEdit.map(editors => editors[0].fullName), ["A Planner", "A Planner"]);
  assert.equal(reads, 2);
  assert.equal((await request(`/presence/${tabA}`, "DELETE")).status, 200);
  assert.deepEqual(await Promise.all(viewers.map(viewer => viewer.next())), [[], []]);
  await Promise.all(viewers.map(viewer => viewer.cancel()));
}));

test("database failures return unavailable and initialization can recover", async () => withServer(async ({ request, pool }) => {
  pool.fail(true);
  assert.equal((await request("/presence", "POST", { tabId: tabA, scopes: [scope] })).status, 503);
  pool.fail(false);
  assert.equal((await request("/presence", "POST", { tabId: tabA, scopes: [scope] })).status, 200);
}));

test("a failed presence stream closes and a new connection can receive status after recovery", { timeout: 5000 }, async () => withServer(async ({ request, pool }) => {
  pool.fail(true);
  const unavailable = await request("/presence/events", "GET", undefined, false);
  assert.equal((await unavailable.body.getReader().read()).done, true);
  pool.fail(false);
  const viewer = presenceReader(await request("/presence/events", "GET", undefined, false));
  assert.deepEqual(await viewer.next(), []);
  await viewer.cancel();
}));

test("presence names fit the shared audit width; long display names are trimmed, usernames are not", async () => {
  const { NAME_MAX_LENGTH } = require("../routes/10.17.87.244/Planning System/Capacity Leveling/capacityLevelingPresence");
  const statements = [];
  const pool = database();
  const query = pool.query.bind(pool);
  pool.query = async (sql, params) => { statements.push(sql); return query(sql, params); };
  const store = createPresenceStore(pool);
  await store.touch({ ...planner, full_name: "N".repeat(NAME_MAX_LENGTH + 20) }, tabA, [scope]);
  const ddl = statements.find((sql) => sql.startsWith("CREATE TABLE"));
  assert.ok(ddl.includes(`username VARCHAR(${NAME_MAX_LENGTH})`));
  assert.ok(ddl.includes(`full_name VARCHAR(${NAME_MAX_LENGTH})`));
  const [row] = pool.rows.values();
  assert.equal(row.full_name.length, NAME_MAX_LENGTH);
  assert.equal(row.username, planner.username);
});
