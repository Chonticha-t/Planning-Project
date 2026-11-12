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
  const timer = (work, ms) => { const id = ++timerId; timers.set(id, { work, ms }); return id; };
  const listen = target => ({
    addEventListener(name, handler) { const entries = target.get(name) ?? new Set(); entries.add(handler); target.set(name, entries); },
    removeEventListener(name, handler) { target.get(name)?.delete(handler); },
  });
  const document = { visibilityState: "visible", ...listen(documentListeners) };
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
  }, window: { setInterval: timer, setTimeout: timer, clearInterval: id => timers.delete(id), clearTimeout: id => timers.delete(id), ...listen(windowListeners) },
  document, EventSource: FakeStream, crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
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
    render, requests, streams, document,
    get result() { return result; },
    advance(ms) { now += ms; },
    event(name) { for (const handler of (name === "visibilitychange" ? documentListeners : windowListeners).get(name) ?? []) handler(); },
    async tick(ms) {
      for (const item of [...timers.values()].filter(item => item.ms === ms)) item.work();
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
    client.advance(21000);
    await client.tick(5000);
    assert.equal(client.result.connected, false);
    assert.equal(client.result.editors.length, 0);
    stream.emit(editors);
    client.render();
    assert.equal(client.result.connected, true);
    stream.onerror();
    client.render();
    assert.equal(client.result.editors.length, 0);
  } finally { client.close(); }
});

test("hidden pages release editing and preview/unmount stops the stream and heartbeat", async () => {
  const client = clientHarness();
  try {
    client.render([scope]);
    await client.tick(200);
    client.document.visibilityState = "hidden";
    client.event("visibilitychange");
    await client.tick(200);
    assert.equal(client.requests.at(-1).body.scopes.length, 0);
    client.render([scope], false);
    assert.equal(client.streams[0].closed, true);
    assert.equal(client.requests.at(-1).method, "DELETE");
    const count = client.requests.length;
    await client.tick(15000);
    assert.equal(client.requests.length, count);
  } finally { client.close(); }
});
