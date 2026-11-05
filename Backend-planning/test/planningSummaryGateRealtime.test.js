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

function hookHarness(today = "2026-01-01") {
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
    useMemo(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: callback(), deps };
      return slots[i].value;
    },
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
      if (name === "./useGateToday") return { useGateToday: () => today };
      if (name === "../gatePresentation") return {
        formatGateName: gate => gate || "",
        formatGateTransition: (gate, next) => `${gate || ""} → ${next || ""}`,
      };
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
        date: dayjs(today).add(i, "day").format("YYYY-MM-DD"), is_working: true,
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

test("overdue pending arrivals stay in details without changing schedule cards or chart", async () => {
  const h = hookHarness();
  h.render();
  const makeRow = (lot, state, arrival, departure, extra = {}) => ({
    prd_name: "SAMPLE", prd_category: "FPC", gate_name: "FFPC", gate_order: 1,
    lot_no: lot, gate_state: state, arrive_by: arrival, must_out: departure,
    qty: 10, pri: 1, ...extra,
  });
  const active = [
    makeRow("TODAY", "coming", "2026-01-01", "2026-01-02"),
    makeRow("FUTURE", "coming", "2026-01-03", "2026-01-04"),
    makeRow("IN-GATE", "in_gate", "2026-01-01", "2026-01-02"),
  ];
  await h.succeed(h.requests.slice(), active);
  const baseline = h.render();
  const schedule = JSON.stringify([baseline.gateFlowList, baseline.matrixRows, baseline.chartData]);
  baseline.refreshData();
  await h.succeed(h.requests.slice(3), [...active,
    makeRow("LATE-COMING", "coming", "2025-12-30", "2025-12-31", {
      prd_name: "OVERDUE-ONLY", proc_disp: "SAMPLE-PROCESS", is_coming_3d: true,
    }),
    makeRow("NEED WIP", "need_wip", "2025-12-31", "2025-12-31"),
    makeRow("OLD-IN-GATE", "in_gate", "2025-12-30", "2025-12-31"),
    makeRow("PASSED", "passed", "2026-01-01", "2026-01-02"),
    makeRow("NO-DATE", "need_wip", null, "2025-12-31"),
  ]);
  let value = h.render();
  const lots = () => Array.from(h.render().filteredTableRows, row => row.lot_no).sort();
  assert.deepEqual(lots(), ["FUTURE", "IN-GATE", "LATE-COMING", "NEED WIP", "NO-DATE", "OLD-IN-GATE", "TODAY"]);
  assert.equal(value.tableStats.totalLots, 7);
  assert.equal(value.tableStats.totalPcs, 70);
  assert.equal(value.tableStats.inGateLots, 2);
  assert.equal(value.tableStats.needWipLots, 2);
  assert.equal(JSON.stringify([value.gateFlowList, value.matrixRows, value.chartData]), schedule);
  assert.ok(value.availableProducts.includes("OVERDUE-ONLY"));
  assert.ok(value.availableCurrentProcesses.includes("SAMPLE-PROCESS"));

  value.setActionTab("today");
  assert.deepEqual(lots(), ["IN-GATE", "TODAY"]);
  h.render().setActionTab("need_wip");
  assert.deepEqual(lots(), ["NEED WIP", "NO-DATE"]);
  h.render().setActionTab("in_gate");
  assert.deepEqual(lots(), ["IN-GATE", "OLD-IN-GATE"]);
  h.render().setActionTab("all");
  h.render().selectDate("2026-01-03");
  assert.deepEqual(lots(), ["FUTURE"]);
  h.render().selectDate(null);
  h.render().setStatusFilter("coming");
  assert.deepEqual(lots(), ["FUTURE", "LATE-COMING", "TODAY"]);
  h.render().setStatusFilter("all");
  h.render().setCurrentProcessFilter("SAMPLE-PROCESS");
  assert.deepEqual(lots(), ["LATE-COMING"]);
  h.render().setCurrentProcessFilter("");
  h.render().setSelectedProduct("OVERDUE-ONLY");
  assert.deepEqual(lots(), ["LATE-COMING"]);
  h.render().setSelectedProduct("");
  h.render().setSearch("LATE-COMING");
  assert.deepEqual(lots(), ["LATE-COMING"]);
  h.unmount();
});

test("overview cards reconcile with schedule and trend across inclusive arrival windows and global filters", async () => {
  const h = hookHarness();
  try {
    h.render();
    const arrivals = ["2025-12-31", "2026-01-01", "2026-01-15", "2026-01-16", "2026-01-29", "2026-01-30", null];
    const rows = arrivals.flatMap((arrive_by, index) => ["in_gate", "coming", "need_wip"].map(gate_state => ({
      prd_name: "SAMPLE", prd_category: "FPC", gate_name: "FFPC", gate_order: 1,
      lot_no: `ROW-${index}-${gate_state}`, due_date: ["2025-12-31", "2026-02-01", null][index % 3], gate_state,
      arrive_by, must_out: "2026-01-01", qty: 10, pri: 1,
      is_coming_3d: false, is_hold: true,
    })));
    rows.push(
      { ...rows[3], lot_no: "PASSED", gate_state: "passed" },
      { ...rows[3], lot_no: "OVERDUE-EXIT", must_out: "2025-12-31" },
      { ...rows[4], lot_no: "STATE-TAKES-PRIORITY", status: "need wip" },
      { ...rows[3], lot_no: "OTHER-CATEGORY", prd_category: "SMT" },
      { ...rows[3], lot_no: "OTHER-GATE", gate_name: "FIN" },
    );
    await h.succeed(h.requests.slice(), rows);
    assert.equal(h.requests.find(request => request.url === "table").options.params.startdate, undefined);
    let value = h.render();
    const card = () => h.render().gateFlowList.find(row => row.gate_name === "FFPC");
    const assertCard = expected => {
      const result = card();
      assert.equal(result.in_gate_count, expected + 1);
      assert.equal(result.in_gate_qty, (expected + 1) * 10);
      assert.equal(result.coming_count, expected + 1);
      assert.equal(result.need_wip_count, expected);
      assert.equal(result.hold_count, expected * 3 + 2);
      assert.equal(result.must_out_today_count, expected * 3 + 1);
    };
    const assertReconciled = () => {
      const current = h.render();
      for (const summary of current.gateFlowList) {
        const matrix = current.matrixRows.find(row => row.gate_name === summary.gate_name);
        const cells = [matrix.todayCell, ...matrix.days];
        assert.equal(summary.in_gate_count, cells.reduce((sum, cell) => sum + cell.inGateCount, 0));
        assert.equal(summary.coming_count, cells.reduce((sum, cell) => sum + cell.comingCount, 0));
        assert.equal(summary.need_wip_count, cells.reduce((sum, cell) => sum + cell.needCount, 0));
      }
      const selected = current.gateFlowList.find(row => row.gate_name === current.filters.selectedGate);
      assert.equal(selected.in_gate_count, current.chartData.reduce((sum, day) => sum + day.in_gate, 0));
      assert.equal(selected.coming_count, current.chartData.reduce((sum, day) => sum + day.coming, 0));
      assert.equal(selected.need_wip_count, current.chartData.reduce((sum, day) => sum + day.need_wip, 0));
    };
    assertCard(2);
    assertReconciled();
    const todayCell = JSON.stringify(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell);
    assert.equal(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell.lotsCount, 5);
    const details = JSON.stringify(value.filteredTableRows);
    value.setPlanWindow("1m");
    value = h.render();
    assertCard(4);
    assertReconciled();
    assert.equal(JSON.stringify(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell), todayCell);
    assert.equal(JSON.stringify(value.filteredTableRows), details);
    assert.equal(h.requests.length, 3);
    value.selectDate("2026-01-29");
    assert.equal(h.render().filteredTableRows.length, 3);
    h.render().setPlanWindow("2w");
    assert.equal(h.render().filters.selectedDate, null);
    assertCard(2);
    assertReconciled();
    h.render().setSearch("OVERDUE-EXIT");
    assert.equal(card().in_gate_count, 1);
    assertReconciled();
    h.render().selectDate("2026-01-01");
    assert.equal(h.render().filteredTableRows[0].lot_no, "OVERDUE-EXIT");
    h.render().selectDate(null);
    h.render().setSearch("NO-MATCH");
    assert.equal(card().in_gate_count, 0);
    assertReconciled();
    h.render().setSearch("");
    h.render().setSelectedProduct("NO-MATCH");
    assert.equal(card().in_gate_count, 0);
    assertReconciled();
    h.render().setSelectedProduct("");
    h.render().setCategory("ALL");
    await h.succeed(h.requests.slice(3), rows);
    assert.equal(card().in_gate_count, 4);
    assertReconciled();
  } finally {
    h.unmount();
  }
});

test("overview cards never fall back to summary totals without arrival-date filtering", async () => {
  const h = hookHarness();
  try {
    h.render();
    h.requests.find(request => request.url === "summary").resolve({
      data: { status: "OK", data: [{ gate_name: "FFPC", gate_order: 1, in_gate_count: 999, in_gate_qty: 9990 }] },
    });
    await h.succeed(h.requests.slice(), []);
    const card = h.render().gateFlowList.find(row => row.gate_name === "FFPC");
    assert.equal(card.in_gate_count, 0);
    assert.equal(card.in_gate_qty, 0);
  } finally {
    h.unmount();
  }
});

test("arrival dates keep a gate visible even when the summary API omits that gate", async () => {
  const h = hookHarness();
  try {
    h.render();
    h.requests.find(request => request.url === "summary").resolve({
      data: { status: "OK", data: [{ gate_name: "FFPC", gate_order: 1, in_gate_count: 999 }] },
    });
    await h.succeed(h.requests.slice(), [{
      prd_name: "SAMPLE", prd_category: "FPC", gate_name: "FVAC", gate_order: 2,
      gate_state: "coming", arrive_by: "2026-01-02", must_out: "2025-12-31", qty: 10,
    }]);
    let value = h.render();
    assert.ok(value.availableGates.includes("FVAC"));
    assert.equal(value.gateFlowList.find(row => row.gate_name === "FVAC").coming_count, 1);
    value.selectGate("FVAC");
    value = h.render();
    assert.equal(value.chartData.reduce((sum, day) => sum + day.coming, 0), 1);
    value.selectDate("2026-01-02");
    assert.equal(h.render().filteredTableRows.length, 1);
  } finally {
    h.unmount();
  }
});

test("date drilldown includes every counted arrival even with an unknown state and past exit date", async () => {
  const h = hookHarness();
  try {
    h.render();
    await h.succeed(h.requests.slice(), [{
      prd_name: "SAMPLE", prd_category: "FPC", gate_name: "FFPC", gate_order: 1,
      gate_state: "unknown", arrive_by: "2026-01-01", must_out: "2025-12-31", qty: 10,
    }]);
    const value = h.render();
    assert.equal(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell.lotsCount, 1);
    value.selectDate("2026-01-01");
    assert.equal(h.render().filteredTableRows.length, 1);
  } finally {
    h.unmount();
  }
});

test("in-gate lots survive past plan dates until passed and remain discoverable", async () => {
  const h = hookHarness();
  h.render();
  const makeRow = (lot, arrival, departure) => ({
    prd_name: lot, prd_category: "FPC", gate_name: "FFPC", gate_order: 1,
    lot_no: lot, gate_state: "in_gate", arrive_by: arrival, must_out: departure,
    proc_disp: `PROCESS-${lot}`, qty: 10, pri: 1,
  });
  const rows = [
    makeRow("PAST-ARRIVAL", "2025-12-31", "2026-01-02"),
    makeRow("PAST-DEPARTURE", "2025-12-30", "2025-12-31"),
    makeRow("MISSING-DATES", null, null),
  ];
  await h.succeed(h.requests.slice(), rows);
  let value = h.render();
  assert.equal(value.filteredTableRows.length, 3);
  assert.equal(value.tableStats.inGateLots, 3);
  assert.ok(value.availableProducts.includes("PAST-DEPARTURE"));
  assert.ok(value.availableCurrentProcesses.includes("PROCESS-PAST-DEPARTURE"));
  value.setActionTab("in_gate");
  assert.equal(h.render().filteredTableRows.length, 3);
  h.render().setSelectedProduct("PAST-DEPARTURE");
  assert.equal(h.render().filteredTableRows[0].lot_no, "PAST-DEPARTURE");
  h.render().setSelectedProduct("");
  h.render().refreshData();
  await h.succeed(h.requests.slice(3), rows.map(row => row.lot_no === "PAST-DEPARTURE"
    ? { ...row, gate_state: "passed" } : row));
  value = h.render();
  assert.equal(value.filteredTableRows.length, 2);
  assert.equal(value.tableStats.inGateLots, 2);
  assert.ok(!value.filteredTableRows.some(row => row.lot_no === "PAST-DEPARTURE"));
  h.unmount();
});

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
