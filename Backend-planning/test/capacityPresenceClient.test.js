const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../Frontend-planning/node_modules/typescript");

// Run the real hook with controlled React effects, timers and transport boundaries.
function clientHarness() {
  const slots = [], effects = [], timers = new Map(), windowListeners = new Map(), documentListeners = new Map();
  const requests = [], streams = [];
  let cursor = 0, dirty = false, timerId = 0, now = Date.now(), activeScopes = [], enabled = true, result;
  const moduleRoot = path.join(__dirname, "../../Frontend-planning/src/pages/Capacity_Leveling");
  const state = initial => {
    const index = cursor++;
    if (!slots[index]) slots[index] = { value: initial };
    return [slots[index].value, value => {
      const next = typeof value === "function" ? value(slots[index].value) : value;
      if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; }
    }];
  };
  const react = {
    useState: state,
    useRef(value) { const index = cursor++; return slots[index] ??= { current: value }; },
    useEffect(work, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((value, offset) => !Object.is(value, previous.deps[offset]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { slots[index].cleanup?.(); slots[index].cleanup = work(); });
      }
    },
  };
  class FakeStream {
    constructor() { this.listeners = new Map(); this.closed = false; streams.push(this); }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    emit(editors) { this.listeners.get("presence")({ data: JSON.stringify({ editors }) }); }
    close() { this.closed = true; }
  }
  const timer = (work, ms, repeat = false) => { const id = ++timerId; timers.set(id, { work, ms, repeat }); return id; };
  const listen = target => ({
    addEventListener(name, handler) { const entries = target.get(name) ?? new Set(); entries.add(handler); target.set(name, entries); },
    removeEventListener(name, handler) { target.get(name)?.delete(handler); },
  });
  const document = { visibilityState: "visible", ...listen(documentListeners) };
  const navigator = { onLine: true };
  const axios = {
    async post(url, body) { requests.push({ method: "POST", body }); },
    async delete(url) { requests.push({ method: "DELETE", url }); },
  };
  const uniqueScopes = scopes => [...new Map(scopes.map(scope => [JSON.stringify(scope), scope])).values()];
  const context = { module: { exports: {} }, exports: {}, require(name) {
    if (name === "react") return react;
    if (name === "axios") return { default: axios };
    if (name.includes("AuthContext")) return { useAuth: () => ({ user: { username: "me" }, canEditPlanning: true }) };
    if (name.includes("apiConfig")) return { getApiBaseUrl: () => "http://test" };
    if (name.includes("editingPresence")) return { uniqueScopes };
    throw new Error(name);
  }, window: { setInterval: (work, ms) => timer(work, ms, true), setTimeout: timer, clearInterval: id => timers.delete(id), clearTimeout: id => timers.delete(id), ...listen(windowListeners) },
  document, navigator, EventSource: FakeStream, Math: Object.assign(Object.create(Math), { random: () => 0 }),
  crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
  AbortController, Date: class extends Date { static now() { return now; } }, console };
  context.exports = context.module.exports;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(moduleRoot, "hooks/useEditingPresence.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  const hook = context.module.exports.useEditingPresence;
  const render = (scopes = activeScopes, nextEnabled = enabled) => {
    activeScopes = scopes; enabled = nextEnabled;
    do {
      dirty = false; cursor = 0;
      result = hook(activeScopes, enabled);
      while (effects.length) effects.shift()();
    } while (dirty);
    return result;
  };
  return {
    render, requests, streams, document, navigator,
    get result() { return result; },
    advance(ms) { now += ms; },
    event(name) { for (const handler of (name === "visibilitychange" ? documentListeners : windowListeners).get(name) ?? []) handler(); },
    async tick(ms) {
      for (const [id, item] of [...timers].filter(([, item]) => item.ms === ms)) {
        if (!timers.has(id)) continue;
        if (!item.repeat) timers.delete(id);
        item.work();
      }
      await new Promise(resolve => setImmediate(resolve));
      render();
    },
    close() { for (const slot of slots) slot?.cleanup?.(); },
  };
}

const scope = { kind: "plan", gate: "FVAC", date: "2026-11-12" };

test("opening a page is not editing; edits heartbeat, idle clears the lease, and interaction resumes it", async () => {
  const client = clientHarness();
  try {
    client.render([]);
    await client.tick(15000);
    assert.equal(client.requests.length, 0);
    client.render([scope]);
    await client.tick(200);
    assert.equal(JSON.stringify(client.requests.at(-1).body.scopes), JSON.stringify([scope]));
    client.advance(121000);
    await client.tick(15000);
    assert.equal(client.requests.at(-1).body.scopes.length, 0);
    client.event("pointerdown");
    await client.tick(200);
    assert.equal(client.requests.at(-1).body.scopes.length, 1);
    client.render([]);
    await client.tick(200);
    assert.equal(client.requests.at(-1).body.scopes.length, 0);
  } finally { client.close(); }
});

test("stale or disconnected presence is never presented as a confirmed editor list and reconnect restores it", async () => {
  const client = clientHarness();
  try {
    client.render([]);
    const stream = client.streams[0];
    const editors = [{ username: "other", fullName: "Other", role: "planner", scopes: [scope] }];
    stream.emit(editors);
    client.render();
    assert.equal(client.result.connected, true);
    assert.equal(client.result.editors.length, 1);
    client.advance(20000);
    await client.tick(20000);
    assert.equal(client.result.connected, false);
    assert.equal(client.result.editors.length, 0);
    assert.equal(stream.closed, true);
    stream.emit(editors);
    client.render();
    assert.equal(client.result.connected, false);
    client.advance(5000);
    await client.tick(5000);
    const reconnected = client.streams[1];
    reconnected.emit(editors);
    client.render();
    assert.equal(client.result.connected, true);
    reconnected.onerror();
    client.render();
    assert.equal(client.result.editors.length, 0);
  } finally { client.close(); }
});

test("retries back off while unavailable, cap at thirty seconds and reset on a valid snapshot", async () => {
  const client = clientHarness();
  try {
    client.render();
    for (const delay of [5000, 10000, 20000, 30000, 30000]) {
      const count = client.streams.length;
      const stream = client.streams.at(-1);
      stream.onerror();
      stream.onerror();
      assert.equal(stream.closed, true);
      client.advance(delay - 1);
      await client.tick(delay - 1);
      assert.equal(client.streams.length, count);
      client.advance(1);
      await client.tick(delay);
      assert.equal(client.streams.length, count + 1);
    }
    client.streams.at(-1).emit([]);
    client.render();
    assert.equal(client.result.connected, true);
    client.streams.at(-1).onerror();
    const count = client.streams.length;
    client.advance(5000);
    await client.tick(5000);
    assert.equal(client.streams.length, count + 1);
  } finally { client.close(); }
});

test("hidden and offline tabs pause the stream, and preview stops the stream and heartbeat", async () => {
  const client = clientHarness();
  try {
    client.render([scope]);
    await client.tick(200);
    client.document.visibilityState = "hidden";
    client.event("visibilitychange");
    await client.tick(200);
    assert.equal(client.requests.at(-1).body.scopes.length, 0);
    assert.equal(client.streams[0].closed, true);
    await client.tick(15000);
    assert.equal(client.streams.length, 1);
    client.navigator.onLine = false;
    client.document.visibilityState = "visible";
    client.event("visibilitychange");
    assert.equal(client.streams.length, 1);
    client.navigator.onLine = true;
    client.event("online");
    client.event("visibilitychange");
    assert.equal(client.streams.length, 2);
    client.render([scope], false);
    assert.equal(client.streams[1].closed, true);
    assert.equal(client.requests.at(-1).method, "DELETE");
    const count = client.requests.length;
    await client.tick(15000);
    assert.equal(client.requests.length, count);
  } finally { client.close(); }
});

test("hiding a failing stream cancels its timer and preserves the remaining retry delay", async () => {
  const client = clientHarness();
  try {
    client.render();
    client.streams[0].onerror();
    client.advance(1000);
    client.document.visibilityState = "hidden";
    client.event("visibilitychange");
    await client.tick(5000);
    assert.equal(client.streams.length, 1);
    client.document.visibilityState = "visible";
    client.event("visibilitychange");
    assert.equal(client.streams.length, 1);
    client.advance(4000);
    await client.tick(4000);
    assert.equal(client.streams.length, 2);
  } finally { client.close(); }
});
