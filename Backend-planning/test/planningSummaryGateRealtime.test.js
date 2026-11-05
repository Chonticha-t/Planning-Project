const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

const routesRoot = path.join(__dirname, "../routes");
const routePath = fs.readdirSync(routesRoot, { recursive: true })
  .find(name => path.basename(name) === "Planning Summary Gate.js");

function monitorHarness(router = null) {
  const routes = new Map();
  const timers = new Map();
  let timerId = 0;
  let queries = 0;
  let query = async () => ({ rows: [{ row_count: "2", content_hash: "100" }] });
  const context = {
    module: { exports: {} },
    require(name) {
      if (name === "express") return { Router: () => ({ get: (url, handler) => {
        routes.set(url, handler);
        router?.get(url, handler);
      } }) };
      if (name.endsWith("/config")) return { pool_smart: { query: async config => {
        queries++;
        assert.equal(config.query_timeout, 5000);
        assert.match(config.text, /^SELECT/);
        return query();
      } } };
      if (name.endsWith("/workingCalendar")) return {};
      throw new Error("Unexpected dependency");
    },
    setInterval(callback, delay) { timers.set(++timerId, { callback, delay }); return timerId; },
    clearInterval(id) { timers.delete(id); },
  };
  vm.runInNewContext(fs.readFileSync(path.join(routesRoot, routePath), "utf8"), context);
  const connect = () => {
    const req = new EventEmitter();
    const res = new EventEmitter();
    res.messages = [];
    res.writeHead = (status, headers) => { res.status = status; res.headers = headers; };
    res.write = message => { res.messages.push(message); return !res.slow; };
    res.destroy = () => { res.destroyed = true; };
    routes.get("/stream")(req, res);
    return { req, res };
  };
  return {
    connect, timers,
    setQuery: value => { query = value; },
    queries: () => queries,
    tick: async () => {
      for (const timer of [...timers.values()]) if (timer.delay === 2500) await timer.callback();
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test("gate viewers share one monitor; unchanged rows do not trigger reloads", async () => {
  const h = monitorHarness();
  const first = h.connect();
  const second = h.connect();
  await h.tick();
  assert.equal(h.queries(), 1);
  assert.equal([...h.timers.values()].filter(timer => timer.delay === 2500).length, 1);
  assert.equal(first.res.headers["Content-Type"], "text/event-stream");
  assert.ok(first.res.messages.some(message => message.includes("GATE_MONITOR_OK")));
  assert.ok(!second.res.messages.some(message => message.includes("GATE_UPDATED")));
  await h.tick();
  assert.ok(!first.res.messages.some(message => message.includes("PLANNING_SUMMARY_GATE_UPDATED")));
  first.req.emit("close");
  second.req.emit("close");
  assert.equal(h.timers.size, 0);
});

test("gate changes and deletes notify every viewer; monitor errors can recover", async () => {
  const h = monitorHarness();
  const { req, res } = h.connect();
  await h.tick();
  h.setQuery(async () => ({ rows: [{ row_count: "2", content_hash: "101" }] }));
  await h.tick();
  h.setQuery(async () => ({ rows: [{ row_count: "0", content_hash: "0" }] }));
  await h.tick();
  assert.equal(res.messages.filter(message => message.includes("PLANNING_SUMMARY_GATE_UPDATED")).length, 2);
  h.setQuery(async () => { throw new Error("Synthetic database outage"); });
  await h.tick();
  assert.ok(res.messages.at(-1).includes("GATE_MONITOR_UNAVAILABLE"));
  h.setQuery(async () => ({ rows: [{ row_count: "0", content_hash: "0" }] }));
  await h.tick();
  assert.ok(res.messages.at(-1).includes("GATE_MONITOR_OK"));
  req.emit("close");
});

test("slow queries never overlap and a disconnected generation cannot notify a new viewer", async () => {
  const h = monitorHarness();
  let finish;
  h.setQuery(() => new Promise(resolve => { finish = resolve; }));
  const first = h.connect();
  await h.tick();
  assert.equal(h.queries(), 1);
  first.req.emit("close");
  const second = h.connect();
  finish({ rows: [{ row_count: "1", content_hash: "1" }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(second.res.messages.length, 1);
  h.setQuery(async () => ({ rows: [{ row_count: "2", content_hash: "2" }] }));
  await h.tick();
  assert.ok(second.res.messages.at(-1).includes("GATE_MONITOR_OK"));
  second.req.emit("close");
});

test("response errors and backpressure release all stream timers", async () => {
  const h = monitorHarness();
  const first = h.connect();
  await h.tick();
  first.res.emit("error", new Error("Synthetic socket error"));
  assert.equal(h.timers.size, 0);
  const second = h.connect();
  second.res.slow = true;
  await h.tick();
  assert.equal(second.res.destroyed, true);
  assert.equal(h.timers.size, 0);
});

test("SSE headers and change events flush through Express compression over local HTTP", { timeout: 5000 }, async () => {
  const express = require("express");
  const app = express();
  const router = express.Router();
  const h = monitorHarness(router);
  let resolveResponseClosed;
  const responseClosed = new Promise(resolve => { resolveResponseClosed = resolve; });
  app.use((req, res, next) => {
    res.once("close", resolveResponseClosed);
    next();
  });
  app.use(require("compression")());
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  const controller = new AbortController();
  try {
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/stream`, {
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    assert.equal(response.headers.get("x-accel-buffering"), "no");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let messages = decoder.decode((await reader.read()).value);
    assert.match(messages, /CONNECTED/);
    h.setQuery(async () => ({ rows: [{ row_count: "2", content_hash: "102" }] }));
    await h.tick();
    while (!messages.includes("PLANNING_SUMMARY_GATE_UPDATED")) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      messages += decoder.decode(chunk.value);
    }
    await reader.cancel();
  } finally {
    controller.abort();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await responseClosed;
  }
  assert.equal(h.timers.size, 0);
});

// Exercise the actual frontend hook with synthetic HTTP, React lifecycle and SSE.
const frontendRoot = path.join(__dirname, "../../Frontend-planning");
const { createRequire } = require("node:module");
const frontendRequire = createRequire(path.join(frontendRoot, "package.json"));
const ts = frontendRequire("typescript");
const dayjs = frontendRequire("dayjs");

function hookHarness() {
  const slots = [];
  const effects = [];
  const pendingEffects = [];
  const requests = [];
  const streams = [];
  const timers = new Map();
  const listeners = new Map();
  let cursor = 0;
  let timerId = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] || (slots[i] = { current: initial });
    },
    useMemo(callback) { cursor++; return callback(); },
    useDeferredValue(value) { cursor++; return value; },
    useCallback(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { callback, deps };
      return slots[i].callback;
    },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!effects[i] || !same(effects[i].deps, deps)) {
        pendingEffects.push(() => {
          effects[i]?.cleanup?.();
          effects[i] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const eventTarget = {
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: type => listeners.delete(type),
  };
  const context = {
    exports: {}, AbortController,
    document: { ...eventTarget, visibilityState: "visible" },
    window: eventTarget, navigator: { onLine: true },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    EventSource: class {
      constructor() { streams.push(this); }
      close() { this.closed = true; }
    },
    require(name) {
      if (name === "react") return react;
      if (name === "axios") return { get: (url, options) => new Promise((resolve, reject) => {
        requests.push({ url, options, resolve, reject });
      }) };
      if (name === "dayjs") return dayjs;
      if (name === "./useGateToday") return { useGateToday: () => "2026-01-01" };
      if (name === "../gatePresentation") return {};
      if (name === "./api") return {
        PLANNING_SUMMARY_GATE_TABLE_API: "table", PLANNING_SUMMARY_GATE_SUMMARY_API: "summary",
        PLANNING_SUMMARY_GATE_CALENDAR_API: "calendar", PLANNING_SUMMARY_GATE_STREAM_API: "stream",
      };
      throw new Error("Unexpected hook dependency");
    },
  };
  const hookPath = path.join(frontendRoot, "src/pages/Planning_Summary_Gate/hooks/usePlanningSummaryGate.ts");
  const compiled = ts.transpileModule(fs.readFileSync(hookPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  });
  vm.runInNewContext(compiled.outputText, context);
  const render = () => {
    cursor = 0;
    const value = context.exports.usePlanningSummaryGate();
    while (pendingEffects.length) pendingEffects.shift()();
    return value;
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const succeed = async (batch, tableRows = []) => {
    for (const request of batch) {
      let data = [];
      if (request.url === "table") data = tableRows;
      if (request.url === "calendar") data = Array.from({ length: 29 }, (_, i) => ({
        date: dayjs("2026-01-01").add(i, "day").format("YYYY-MM-DD"), is_working: true,
      }));
      request.resolve({ data: { status: "OK", data } });
    }
    await flush();
  };
  return {
    render, requests, streams, timers, listeners, succeed, flush,
    event: type => streams.at(-1).onmessage({ data: JSON.stringify({ type }) }),
    unmount: () => effects.forEach(effect => effect.cleanup?.()),
  };
}

test("bursts coalesce into one trailing refresh and background failures retain data", async () => {
  const h = hookHarness();
  h.render();
  const rows = [{ prd_name: "SAMPLE", gate_name: "FFPC", gate_state: "in_gate" }];
  await h.succeed(h.requests.slice(), rows);
  assert.equal(h.render().rows.length, 1);
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  assert.equal(h.requests.length, 6);
  assert.equal(h.render().loading, false);
  assert.equal(h.render().rows.length, 1);
  await h.succeed(h.requests.slice(3), rows);
  assert.equal(h.requests.length, 9);
  h.requests[6].reject(new Error("Synthetic network outage"));
  await h.flush();
  assert.equal(h.render().rows.length, 1);
  assert.match(h.render().refreshWarning, /out of date/);
  assert.equal(h.timers.size, 1);
  h.unmount();
  assert.equal(h.timers.size, 0);
  assert.equal(h.streams[0].closed, true);
  assert.equal(h.listeners.size, 0);
});

test("reconnect, visibility, online and monitor recovery request fresh gate data", async () => {
  const h = hookHarness();
  h.render();
  await h.succeed(h.requests.slice());
  for (const trigger of [
    () => h.streams[0].onopen(),
    () => h.listeners.get("visibilitychange")(),
    () => h.listeners.get("online")(),
    () => { h.event("GATE_MONITOR_UNAVAILABLE"); h.event("GATE_MONITOR_OK"); },
  ]) {
    const start = h.requests.length;
    trigger();
    assert.equal(h.requests.length, start + 3);
    await h.succeed(h.requests.slice(start));
  }
  h.streams[0].onerror();
  assert.match(h.render().refreshWarning, /Reconnecting/);
  h.unmount();
});

test("manual refresh cancels stale requests; unmount prevents trailing work", async () => {
  const h = hookHarness();
  h.render();
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.render().refreshData();
  assert.equal(h.requests[0].options.signal.aborted, true);
  await h.succeed(h.requests.slice(0, 3), [{ prd_name: "OLD" }]);
  assert.equal(h.render().rows.length, 0);
  await h.succeed(h.requests.slice(3, 6));
  assert.equal(h.render().loading, false);
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.unmount();
  await h.succeed(h.requests.slice(6));
  assert.equal(h.requests.length, 9);
  assert.equal(h.timers.size, 0);
});
