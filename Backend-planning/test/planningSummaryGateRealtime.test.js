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
    process: { env: {} },
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
      if (name.endsWith("/gateCalendarCache")) return require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
      if (name.endsWith("/gateTableCache")) return require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTableCache");
      if (name.endsWith("/gateTablePerformance")) return {
        createGateTableProfiler: pool => require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTablePerformance").createGateTableProfiler(pool, { enabled: false }),
      };
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
const gateUnits = {};
const unitModule = ts.transpileModule(fs.readFileSync(path.join(frontendRoot, "src/pages/Planning_Summary_Gate/gateUnits.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
vm.runInNewContext(unitModule.outputText, { exports: gateUnits });

function hookHarness(today = "2026-01-01", { autoOpen = true } = {}) {
  const slots = [];
  const effects = [];
  const pendingEffects = [];
  const requests = [];
  const streams = [];
  const timers = new Map();
  const listeners = new Map();
  const timerDelays = new Map();
  let clock = Date.now();
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
    Date: class extends Date { static now() { return clock; } },
    document: { ...eventTarget, visibilityState: "visible" },
    window: eventTarget, navigator: { onLine: true },
    setTimeout(callback, delay) { timers.set(++timerId, callback); timerDelays.set(timerId, delay); return timerId; },
    clearTimeout(id) { timers.delete(id); timerDelays.delete(id); },
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
      if (name === "../gateUnits") return gateUnits;
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
    if (autoOpen) for (const stream of streams) {
      if (!stream.opened && !stream.closed) { stream.opened = true; stream.onopen(); }
    }
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
    render, requests, streams, timers, timerDelays, listeners, succeed, flush, context,
    setToday: value => { today = value; },
    advanceTime: milliseconds => { clock += milliseconds; },
    runTimer: delay => {
      const found = [...timers].find(([id]) => timerDelays.get(id) === delay);
      assert.ok(found, `Missing ${delay}ms timer`);
      const [id, callback] = found;
      timers.delete(id); timerDelays.delete(id); callback();
    },
    event: type => streams.at(-1).onmessage({ data: JSON.stringify({ type }) }),
    unmount: () => effects.forEach(effect => effect.cleanup?.()),
  };
}

test("overdue pending arrivals stay in details without changing schedule cards or chart", async () => {
  const h = hookHarness();
  h.render();
  const makeRow = (lot, state, arrival, departure, extra = {}) => ({
    prd_name: "SAMPLE", prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1,
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
  await h.succeed(h.requests.slice(2), [...active,
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
  assert.equal(value.tableStats.totalLots, 5);
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
      prd_name: "SAMPLE", prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1,
      lot_no: `ROW-${index}-${gate_state}`, due_date: ["2025-12-31", "2026-02-01", null][index % 3], gate_state,
      arrive_by, must_out: "2026-01-01", qty: 10, pri: 1,
      is_coming_3d: false, is_hold: true,
    })));
    rows.push(
      { ...rows[3], lot_no: "PASSED", gate_state: "passed" },
      { ...rows[3], lot_no: "OVERDUE-EXIT", must_out: "2025-12-31" },
      { ...rows[4], lot_no: "STATE-TAKES-PRIORITY", status: "need wip" },
      { ...rows[3], lot_no: "OTHER-CATEGORY", prd_category: "SMT", process_group: "SMT" },
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
      assert.equal(selected.in_gate_count, current.chartDataByUnit.lot.reduce((sum, day) => sum + day.in_gate, 0));
      assert.equal(selected.coming_count, current.chartDataByUnit.lot.reduce((sum, day) => sum + day.coming, 0));
      assert.equal(selected.need_wip_count, current.chartDataByUnit.lot.reduce((sum, day) => sum + day.needCount, 0));
    };
    assertCard(2);
    assertReconciled();
    const todayCell = JSON.stringify(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell);
    assert.equal(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell.lotsCount, 4);
    const details = JSON.stringify(value.filteredTableRows);
    value.setPlanWindow("1m");
    value = h.render();
    assertCard(4);
    assertReconciled();
    assert.equal(JSON.stringify(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell), todayCell);
    assert.equal(JSON.stringify(value.filteredTableRows), details);
    assert.equal(h.requests.length, 2);
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
    await h.succeed(h.requests.slice(2), rows);
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
    assert.ok(!h.requests.some(request => request.url === "summary"));
    await h.succeed(h.requests.slice(), []);
    const card = h.render().gateFlowList.find(row => row.gate_name === "FFPC");
    assert.equal(card.in_gate_count, 0);
    assert.equal(card.in_gate_qty, 0);
  } finally {
    h.unmount();
  }
});

test("arrival dates keep a gate visible without a summary API request", async () => {
  const h = hookHarness();
  try {
    h.render();
    assert.ok(!h.requests.some(request => request.url === "summary"));
    await h.succeed(h.requests.slice(), [{
      prd_name: "SAMPLE", prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FVAC", gate_order: 2, lot_no: "SAMPLE-ARRIVAL",
      gate_state: "coming", arrive_by: "2026-01-02", must_out: "2025-12-31", qty: 10,
    }]);
    let value = h.render();
    assert.ok(value.availableGates.includes("FVAC"));
    assert.equal(value.gateFlowList.find(row => row.gate_name === "FVAC").coming_count, 1);
    value.selectGate("FVAC");
    value = h.render();
    assert.equal(value.chartDataByUnit.lot.reduce((sum, day) => sum + day.coming, 0), 1);
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
      prd_name: "SAMPLE", prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1, lot_no: "SAMPLE-UNKNOWN",
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
    prd_name: lot, prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1,
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
  await h.succeed(h.requests.slice(2), rows.map(row => row.lot_no === "PAST-DEPARTURE"
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
  assert.equal(h.requests.length, 3);
  assert.equal(h.render().loading, false);
  assert.equal(h.render().rows.length, 1);
  await h.succeed(h.requests.slice(2), rows);
  assert.equal(h.requests.length, 4);
  h.requests[3].reject(new Error("Synthetic network outage"));
  await h.flush();
  assert.equal(h.render().rows.length, 1);
  assert.match(h.render().refreshWarning, /out of date/);
  assert.equal(h.timers.size, 2);
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
    assert.equal(h.requests.length, start + 1);
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
  await h.succeed(h.requests.slice(0, 2), [{ prd_name: "OLD" }]);
  assert.equal(h.render().rows.length, 0);
  await h.succeed(h.requests.slice(2, 4));
  assert.equal(h.render().loading, false);
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.event("PLANNING_SUMMARY_GATE_UPDATED");
  h.unmount();
  await h.succeed(h.requests.slice(4));
  assert.equal(h.requests.length, 5);
  assert.equal(h.timers.size, 0);
});

test("initial SSE connection performs one table read and no summary request", async () => {
  const h = hookHarness("2026-01-01", { autoOpen: false });
  try {
    h.render();
    assert.deepEqual(h.requests.map(request => request.url), ["calendar"]);
    h.streams[0].onopen();
    assert.deepEqual(h.requests.map(request => request.url), ["calendar", "table"]);
    await h.succeed(h.requests.slice());
    assert.equal(h.render().loading, false);
    assert.equal(h.requests.length, 2);
    assert.ok(![...h.timerDelays.values()].includes(1000));
    h.streams[0].onopen();
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests.at(-1).url, "table");
  } finally { h.unmount(); }
});

test("slow and failed SSE connections cannot block initial load and late opens catch up", async () => {
  for (const fail of [false, true]) {
    const h = hookHarness("2026-01-01", { autoOpen: false });
    try {
      h.render();
      if (fail) h.streams[0].onerror();
      else h.runTimer(1000);
      assert.deepEqual(h.requests.map(request => request.url), ["calendar", "table"]);
      await h.succeed(h.requests.slice());
      assert.equal(h.render().loading, false);
      h.streams[0].onopen();
      assert.equal(h.requests.at(-1).url, "table");
      assert.equal(h.requests.length, 3);
    } finally { h.unmount(); }
  }
});

test("calendar expires independently and manual refresh bypasses its cache", async () => {
  const h = hookHarness();
  try {
    h.render();
    await h.succeed(h.requests.slice());
    h.event("PLANNING_SUMMARY_GATE_UPDATED");
    await h.succeed(h.requests.slice(2));
    assert.equal(h.requests.filter(request => request.url === "calendar").length, 1);
    h.advanceTime(60000);
    h.runTimer(60000);
    assert.equal(h.requests.at(-1).url, "calendar");
    assert.equal(h.requests.filter(request => request.url === "table").length, 2);
    await h.succeed([h.requests.at(-1)]);
    const start = h.requests.length;
    h.render().refreshData();
    const batch = h.requests.slice(start);
    assert.deepEqual(batch.map(request => request.url), ["table", "calendar"]);
    assert.equal(batch[0].options.params.refresh, true);
    assert.equal(batch[1].options.params.refresh, true);
    await h.succeed(batch);
    assert.equal(h.render().refreshWarning, null);
  } finally { h.unmount(); }
});

test("calendar failures retain validated holidays while gate data continues to refresh", async () => {
  const h = hookHarness();
  try {
    h.render();
    const initial = h.requests.slice();
    const calendar = initial.find(request => request.url === "calendar");
    calendar.resolve({ data: { status: "OK", data: Array.from({ length: 29 }, (_, i) => ({
      date: dayjs("2026-01-01").add(i, "day").format("YYYY-MM-DD"), is_working: i !== 1,
    })) } });
    await h.succeed(initial.filter(request => request !== calendar));
    assert.equal(h.render().calendarDays[0].isHoliday, true);
    h.render().refreshData();
    const batch = h.requests.slice(2);
    batch.find(request => request.url === "calendar").reject(new Error("Synthetic calendar outage"));
    await h.succeed(batch.filter(request => request.url === "table"), [{ prd_name: "NEW" }]);
    assert.equal(h.render().rows[0].prd_name, "NEW");
    assert.equal(h.render().error, null);
    assert.equal(h.render().calendarDays[0].isHoliday, true);
    assert.match(h.render().refreshWarning, /calendar refresh failed/);
    h.runTimer(5000);
    assert.equal(h.requests.at(-1).url, "calendar");
    await h.succeed([h.requests.at(-1)]);
    assert.equal(h.render().refreshWarning, null);
    assert.equal(h.render().calendarDays[0].isHoliday, false);
  } finally { h.unmount(); }
});

test("invalid initial calendars block presentation and retry without refetching gate rows", async () => {
  for (const malformed of [[], Array(29).fill({ date: "2026-01-01", is_working: true })]) {
    const h = hookHarness();
    try {
      h.render();
      h.requests.find(request => request.url === "calendar").resolve({ data: { status: "OK", data: malformed } });
      await h.succeed(h.requests.filter(request => request.url === "table"));
      assert.match(h.render().error, /working-day calendar/);
      h.runTimer(5000);
      assert.equal(h.requests.length, 3);
      assert.equal(h.requests.at(-1).url, "calendar");
      await h.succeed([h.requests.at(-1)]);
      assert.equal(h.render().error, null);
      assert.equal(h.render().loading, false);
    } finally { h.unmount(); }
  }
});

test("calendar revalidation pauses while hidden and resumes when visible", async () => {
  const h = hookHarness();
  try {
    h.render();
    await h.succeed(h.requests.slice());
    h.context.document.visibilityState = "hidden";
    h.advanceTime(60000);
    h.runTimer(60000);
    assert.equal(h.requests.length, 2);
    h.context.document.visibilityState = "visible";
    h.listeners.get("visibilitychange")();
    assert.deepEqual(h.requests.slice(2).map(request => request.url), ["table", "calendar"]);
    await h.succeed(h.requests.slice(2));
    assert.equal(h.render().error, null);
  } finally { h.unmount(); }
});

test("day rollover cancels old requests and loads the new calendar range", async () => {
  const h = hookHarness();
  try {
    h.render();
    const old = h.requests.slice();
    h.setToday("2026-01-02");
    h.render();
    assert.ok(old.every(request => request.options.signal.aborted));
    assert.equal(h.streams[0].closed, true);
    const fresh = h.requests.slice(2);
    assert.equal(fresh.find(request => request.url === "calendar").options.params.startdate, "2026-01-02");
    await h.succeed(fresh, [{ prd_name: "NEW" }]);
    await h.succeed(old, [{ prd_name: "STALE" }]);
    assert.equal(h.render().rows[0].prd_name, "NEW");
    assert.equal(h.render().todayStr, "2026-01-02");
    assert.equal(h.render().error, null);
  } finally { h.unmount(); }
});

test("unmount before SSE opens prevents fallback work", async () => {
  const h = hookHarness("2026-01-01", { autoOpen: false });
  h.render();
  h.unmount();
  await h.succeed(h.requests.slice());
  h.streams[0].onopen();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
});

test("calendar cache shares reads, expires, forces refresh and does not cache failures", async () => {
  const { createGateCalendarCache } = require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
  let calls = 0;
  let clock = 0;
  let fail = false;
  const load = createGateCalendarCache(async (start, end) => {
    calls++;
    if (fail) throw new Error("Synthetic calendar outage");
    return { start, end, revision: calls };
  }, { now: () => clock });
  const [first, concurrent] = await Promise.all([
    load("2026-01-01", "2026-01-29"), load("2026-01-01", "2026-01-29", { force: true }),
  ]);
  assert.equal(first.calendar, concurrent.calendar);
  assert.equal(first.maxAgeMs, 60000);
  assert.equal(calls, 1);
  clock = 20000;
  const cached = await load("2026-01-01", "2026-01-29");
  assert.equal(cached.calendar, first.calendar);
  assert.equal(cached.maxAgeMs, 40000);
  assert.equal(calls, 1);
  clock = 60000;
  assert.equal((await load("2026-01-01", "2026-01-29")).calendar.revision, 2);
  assert.equal((await load("2026-01-01", "2026-01-29", { force: true })).calendar.revision, 3);
  fail = true;
  await assert.rejects(load("2026-01-01", "2026-01-29", { force: true }), /Synthetic calendar outage/);
  fail = false;
  assert.equal((await load("2026-01-01", "2026-01-29")).calendar.revision, 5);
});

test("calendar cache bounds range entries without reviving evicted pending reads", async () => {
  const { createGateCalendarCache } = require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
  let calls = 0;
  const resolvers = [];
  const load = createGateCalendarCache(() => {
    calls++;
    return new Promise(resolve => resolvers.push(resolve));
  }, { maxEntries: 1 });
  const first = load("2026-01-01", "2026-01-29");
  const second = load("2026-01-02", "2026-01-30");
  await Promise.resolve();
  resolvers[0]({ revision: 1 });
  resolvers[1]({ revision: 2 });
  await Promise.all([first, second]);
  assert.equal((await load("2026-01-02", "2026-01-30")).calendar.revision, 2);
  const third = load("2026-01-01", "2026-01-29");
  await Promise.resolve();
  assert.equal(calls, 3);
  resolvers[2]({ revision: 3 });
  await third;
});

test("frontend honors the server's remaining calendar lifetime", async () => {
  const h = hookHarness();
  try {
    h.render();
    const calendar = h.requests.find(request => request.url === "calendar");
    calendar.resolve({ data: { status: "OK", cache_ttl_ms: 10000, data: Array.from({ length: 29 }, (_, i) => ({
      date: dayjs("2026-01-01").add(i, "day").format("YYYY-MM-DD"), is_working: true,
    })) } });
    await h.succeed(h.requests.filter(request => request !== calendar));
    h.advanceTime(10000);
    h.runTimer(10000);
    assert.equal(h.requests.length, 3);
    assert.equal(h.requests.at(-1).url, "calendar");
  } finally { h.unmount(); }
});

test("calendar endpoint shares cached ranges, supports forced reads and rejects invalid dates", async () => {
  const routes = new Map();
  let reads = 0;
  let holiday = false;
  let fail = false;
  const context = {
    module: { exports: {} },
    process: { env: {} },
    require(name) {
      if (name === "express") return { Router: () => ({ get: (url, handler) => routes.set(url, handler) }) };
      if (name.endsWith("/config")) return {};
      if (name.endsWith("/gateCalendarCache")) return require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
      if (name.endsWith("/gateTableCache")) return require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTableCache");
      if (name.endsWith("/gateTablePerformance")) return {
        createGateTableProfiler: pool => require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTablePerformance").createGateTableProfiler(pool, { enabled: false }),
      };
      if (name.endsWith("/workingCalendar")) return {
        createCalendarIndex: require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/workingCalendar").createCalendarIndex,
        loadCalendar: async () => {
          reads++;
          if (fail) throw new Error("Synthetic calendar outage");
          const working = !holiday;
          return { isWorking: () => working };
        },
      };
      throw new Error("Unexpected dependency");
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(routesRoot, routePath), "utf8"), context);
  const get = async query => {
    const response = { statusCode: 200, set() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
    await routes.get("/calendar")({ query }, response);
    return response;
  };
  const query = { startdate: "2026-01-01", stopdate: "2026-01-29" };
  const [first, second] = await Promise.all([get(query), get(query)]);
  assert.equal(reads, 1);
  assert.equal(first.body.data.length, 29);
  assert.equal(second.body.data[0].is_working, true);
  assert.ok(first.body.cache_ttl_ms > 0 && first.body.cache_ttl_ms <= 60000);
  holiday = true;
  assert.equal((await get(query)).body.data[0].is_working, true);
  assert.equal((await get({ ...query, refresh: "true" })).body.data[0].is_working, false);
  assert.equal(reads, 2);
  fail = true;
  assert.equal((await get({ ...query, refresh: "true" })).statusCode, 503);
  fail = false;
  assert.equal((await get(query)).statusCode, 200);
  assert.equal(reads, 4);
  assert.equal((await get({ ...query, startdate: "invalid" })).statusCode, 400);
  assert.equal((await get({ ...query, startdate: "2026-02-30", stopdate: "2026-03-01" })).statusCode, 400);
  assert.equal(reads, 4);
});


test("actual lots deduplicate PO allocations and exclude Need WIP and missing lot identifiers", () => {
  const base = { prd_name: "SAMPLE-A", gate_name: "FFPC", gate_state: "coming", lot_no: "LOT-A", qty: 900, pcs_per_sheet: 30, pri: 1 };
  const result = gateUnits.summarizeGateQuantities([
    base, { ...base, due_date: "2026-02-01", allocated_qty: 100 },
    { ...base, lot_no: "LOT-B", qty: 125, pcs_per_sheet: 20 },
    { ...base, prd_name: "SAMPLE-B", lot_no: "LOT-C", qty: 80, pcs_per_sheet: 8 },
    { ...base, lot_no: "NEED WIP", gate_state: "need_wip", qty: 60 },
    { ...base, lot_no: " ", qty: 30 },
    { ...base, gate_state: "passed", lot_no: "PASSED" },
  ]);
  assert.equal(result.total.lot, 3);
  assert.equal(result.coming.lot, 3);
  assert.equal(result.need_wip.lot, 0);
  assert.equal(result.needCount, 1);
  assert.equal(result.unidentifiedCount, 1);
  assert.equal(result.total.piece, 1195);
  assert.equal(result.total.sheet, 49.25);
});

test("one physical lot cannot be counted twice through conflicting product labels", () => {
  const base = { prd_name: "SAMPLE-A", gate_name: "FFPC", gate_state: "coming", lot_no: " LOT-A ", qty: 900, pcs_per_sheet: 30 };
  const result = gateUnits.summarizeGateQuantities([base, { ...base, lot_no: "LOT-A", prd_name: "SAMPLE-B" }]);
  assert.equal(result.total.lot, 1);
  assert.equal(result.total.piece, null);
  assert.equal(result.total.sheet, null);
});

test("sheet equivalents preserve fractions and missing factors never become false zero totals", () => {
  const base = { prd_name: "SAMPLE", gate_name: "FFPC", gate_state: "in_gate", lot_no: "LOT-A", qty: 1, pcs_per_sheet: 3 };
  assert.equal(gateUnits.summarizeGateQuantities([base]).total.sheet, 1 / 3);
  assert.equal(gateUnits.formatGateQuantity(0.001, "sheet"), "1");
  for (const rate of [null, undefined, 0, -2, "", "invalid", Infinity]) {
    const result = gateUnits.summarizeGateQuantities([base, { ...base, lot_no: "LOT-B", pcs_per_sheet: rate }]);
    assert.equal(result.total.sheet, null);
    assert.equal(result.total.piece, 2);
    assert.equal(result.total.lot, 2);
  }
  assert.equal(gateUnits.summarizeGateQuantities([{ ...base, qty: "90", pcs_per_sheet: "30" }]).total.sheet, 3);
  assert.equal(gateUnits.summarizeGateQuantities([{ ...base, qty: -1 }]).total.piece, null);
  assert.equal(gateUnits.summarizeGateQuantities([base, { ...base, pcs_per_sheet: 4 }]).total.sheet, null);
});

test("sheet display rounds up without rounding lot quantities or changing raw totals", () => {
  const base = { prd_name: "SAMPLE", gate_name: "FFPC", gate_state: "coming", lot_no: "LOT-A", qty: 1, pcs_per_sheet: 4 };
  const result = gateUnits.summarizeGateQuantities([base, { ...base, lot_no: "LOT-B", pcs_per_sheet: 2 }]);
  assert.equal(result.total.sheet, 0.75);
  assert.equal(gateUnits.formatGateQuantity(result.total.sheet, "sheet"), "1");
  assert.equal(result.total.sheet, 0.75);
  assert.equal(result.total.piece, 2);
  assert.equal(result.total.lot, 2);
  for (const [value, expected] of [[0, "0"], [12, "12"], [12.01, "13"], [12.99, "13"], [1234.1, "1,235"], [null, "N/A"], [NaN, "N/A"], [Infinity, "N/A"]]) {
    assert.equal(gateUnits.formatGateQuantity(value, "sheet"), expected);
  }
  assert.equal(gateUnits.formatGateQuantity(12.34, "piece"), "12.34");
  assert.equal(gateUnits.formatGateQuantity(0.001, "piece"), "<0.01");
});

test("unit switching uses cached quantities, keeps drilldown, and survives live refresh", async () => {
  const h = hookHarness();
  try {
    h.render();
    const base = { prd_name: "SAMPLE", prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1, gate_state: "coming", lot_no: "LOT-A", qty: 900, pcs_per_sheet: 30, pri: 1, arrive_by: "2026-01-01", must_out: "2026-01-02" };
    const rows = [base, { ...base, due_date: "2026-02-01" }, { ...base, lot_no: "NEED WIP", gate_state: "need_wip", qty: 60 }];
    await h.succeed(h.requests.slice(), rows);
    let value = h.render();
    assert.equal(value.unitMode, "all");
    assert.equal(value.summaryUnit, "piece");
    assert.equal(value.chartData[0].total, 960);
    assert.equal(value.chartDataByUnit.sheet[0].total, 32);
    assert.equal(value.chartDataByUnit.lot[0].total, 1);
    assert.equal(value.chartDataByUnit.lot[0].need_wip, 0);
    value.selectDate("2026-01-01");
    for (const [mode, unit, total] of [["piece", "piece", 960], ["sheet", "sheet", 32], ["lot", "lot", 1], ["all", "piece", 960]]) {
      h.render().setUnitMode(mode);
      value = h.render();
      assert.equal(value.summaryUnit, unit);
      assert.equal(value.chartData[0].total, total);
      assert.equal(value.tableStats.quantities.total[unit], total);
      assert.equal(value.filters.selectedDate, "2026-01-01");
      assert.equal(value.filteredTableRows.length, 3);
      assert.equal(h.requests.length, 2);
    }
    value.setUnitMode("sheet");
    h.event("PLANNING_SUMMARY_GATE_UPDATED");
    await h.succeed(h.requests.slice(2), rows.map(row => ({ ...row, qty: row.qty * 2 })));
    value = h.render();
    assert.equal(value.unitMode, "sheet");
    assert.equal(value.chartData[0].total, 64);
    assert.equal(value.tableStats.totalLots, 1);
  } finally { h.unmount(); }
});


test("lot status filters all sections, composes with other filters and survives live refresh", async () => {
  const h = hookHarness();
  try {
    h.render();
    const base = {
      prd_name: "SAMPLE", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1,
      gate_state: "coming", arrive_by: "2026-01-01", must_out: "2026-01-02",
      pcs_per_sheet: 10, pri: 1,
    };
    const rows = [
      { ...base, lot_no: "LOT-W", lot_status: " wip ", qty: 10 },
      { ...base, lot_no: "LOT-P", lot_status: " pending ", qty: 20 },
      { ...base, lot_no: "LOT-N", lot_status: null, qty: 30 },
      { ...base, lot_no: "LOT-U", lot_status: "HOLD", qty: 40 },
      { ...base, lot_no: "NEED WIP", lot_status: null, gate_state: "need_wip", qty: 50 },
    ];
    await h.succeed(h.requests.slice(), rows);
    const check = (total, count) => {
      const value = h.render();
      assert.equal(value.gateFlowList.find(row => row.gate_name === "FFPC").quantities.total.piece, total);
      assert.equal(value.matrixRows.find(row => row.gate_name === "FFPC").todayCell.quantities.total.piece, total);
      assert.equal(value.chartDataByUnit.piece[0].total, total);
      assert.equal(value.tableStats.quantities.total.piece, total);
      assert.equal(value.filteredTableRows.length, count);
    };
    assert.equal(h.render().lotStatusFilter, "ALL");
    check(150, 5);
    h.render().setLotStatusFilter("WIP");
    check(10, 1);
    h.render().setLotStatusFilter("PENDING");
    check(20, 1);
    h.render().setSelectedProduct("NO-MATCH");
    check(0, 0);
    h.render().setSelectedProduct("");
    h.render().setSearch("LOT-W");
    check(0, 0);
    h.render().setSearch("");
    h.render().setStatusFilter("in_gate");
    assert.equal(h.render().filteredTableRows.length, 0);
    assert.equal(h.render().chartDataByUnit.piece[0].total, 20);
    h.render().setStatusFilter("all");
    assert.equal(h.requests.length, 2);
    h.event("PLANNING_SUMMARY_GATE_UPDATED");
    await h.succeed(h.requests.slice(2), rows.map(row => ({ ...row, qty: row.qty * 2 })));
    assert.equal(h.render().lotStatusFilter, "PENDING");
    check(40, 1);
    h.render().setLotStatusFilter("ALL");
    check(300, 5);
  } finally { h.unmount(); }
});

test("process groups filter all gate sections using stored classification without extra requests", async () => {
  const h = hookHarness();
  try {
    h.render();
    const base = {
      prd_name: "SAMPLE", prd_category: "FULL", gate_name: "FFPC", gate_order: 1,
      gate_state: "coming", arrive_by: "2026-01-01", must_out: "2026-01-02",
      pcs_per_sheet: 10, pri: 1,
    };
    const rows = [
      { ...base, lot_no: "GEN", process_group: "EFPC_GEN", proc_disp: "AT-SYNTHETIC", qty: 10 },
      { ...base, lot_no: "AUTO", process_group: "EFPC_AUTO", proc_disp: "SYNTHETIC", qty: 20 },
      { ...base, gate_name: "MFPC", lot_no: "SMT", process_group: "SMT", proc_disp: "SYNTHETIC", qty: 30 },
      { ...base, lot_no: "NULL", process_group: null, qty: 40 },
      { ...base, lot_no: "MISSING", qty: 50 },
      { ...base, lot_no: "UNRECOGNIZED", process_group: "UNKNOWN", qty: 60 },
    ];
    await h.succeed(h.requests.slice(), rows);
    assert.equal(h.render().filters.category, "EFPC_GEN");
    assert.ok(!h.requests.some(request => request.url === "summary"));
    for (const [group, total, lots] of [["EFPC_GEN", 10, 1], ["EFPC_AUTO", 20, 1], ["SMT", 30, 1], ["ALL", 180, 5]]) {
      h.render().setCategory(group);
      const value = h.render();
      const gate = group === "SMT" ? "MFPC" : "FFPC";
      assert.equal(value.gateFlowList.find(row => row.gate_name === gate).quantities.total.piece, total);
      assert.equal(value.matrixRows.find(row => row.gate_name === gate).todayCell.quantities.total.piece, total);
      assert.equal(value.chartDataByUnit.piece[0].total, total);
      assert.equal(value.tableStats.quantities.total.piece, total);
      assert.equal(value.filteredTableRows.length, lots);
      assert.equal(h.requests.length, 2);
    }
    h.render().setCategory("EFPC_AUTO");
    h.render().setSelectedProduct("NO-MATCH");
    assert.equal(h.render().filteredTableRows.length, 0);
    h.render().setSelectedProduct("");
    h.render().setSearch("GEN");
    assert.equal(h.render().tableStats.quantities.total.piece, 0);
    h.render().setSearch("");
    h.render().selectDate("2026-01-02");
    h.render().setCurrentProcessFilter("SYNTHETIC");
    h.render().setSelectedProduct("SAMPLE");
    h.render().setCategory("EFPC_GEN");
    let value = h.render();
    assert.equal(value.filters.selectedDate, null);
    assert.equal(value.filters.selectedProduct, "");
    assert.equal(value.currentProcessFilter, "");
    assert.deepEqual(Array.from(value.availableProducts), ["SAMPLE"]);
    h.event("PLANNING_SUMMARY_GATE_UPDATED");
    await h.succeed(h.requests.slice(2), rows.map(row => ({ ...row, qty: row.qty * 2 })));
    value = h.render();
    assert.equal(value.filters.category, "EFPC_GEN");
    assert.equal(value.tableStats.quantities.total.piece, 20);
  } finally { h.unmount(); }
});

test("overview and schedule share the same established gate list in every group", async () => {
  const h = hookHarness();
  try {
    h.render();
    await h.succeed(h.requests.slice(), [
      { gate_name: "FFPC", gate_order: 1, process_group: "EFPC_GEN" },
      { gate_name: "FVAC", gate_order: 2, process_group: "EFPC_AUTO" },
      { gate_name: "SMT", gate_order: 3, process_group: "SMT" },
    ]);
    const fpc = ["FFPC", "FVAC", "FADL", "FIN", "W/H"];
    const smt = ["MFPC", "MMOT", "MBLK", "MFIN", "MW/H"];
    for (const [group, gates] of [["EFPC_GEN", fpc], ["EFPC_AUTO", fpc], ["SMT", smt], ["ALL", [...fpc, ...smt]]]) {
      h.render().setCategory(group);
      h.render();
      const value = h.render();
      assert.deepEqual(Array.from(value.availableGates), gates);
      assert.deepEqual(Array.from(value.gateFlowList, row => row.gate_name), gates);
      assert.deepEqual(Array.from(value.matrixRows, row => row.gate_name), gates);
      assert.ok(gates.includes(value.filters.selectedGate));
    }
  } finally { h.unmount(); }
});

test("arrival schedule keeps the established FPC and SMT rows in every group", async () => {
  const h = hookHarness();
  try {
    h.render();
    const base = { prd_name: "SAMPLE", prd_category: "FPC", gate_order: 1, gate_state: "coming", arrive_by: "2026-01-01", must_out: "2026-01-02", qty: 10 };
    await h.succeed(h.requests.slice(), [
      { ...base, gate_name: "SHIP", process_group: "EFPC_GEN", lot_no: "EXTRA-GATE" },
      { ...base, gate_name: "FFPC", process_group: "EFPC_AUTO", lot_no: "AUTO" },
      { ...base, prd_category: "SMT", gate_name: "MMOT", process_group: "SMT", lot_no: "SMT" },
    ]);
    const fpc = ["FFPC", "FVAC", "FADL", "FIN", "W/H"];
    const smt = ["MFPC", "MMOT", "MBLK", "MFIN", "MW/H"];
    for (const [group, expected] of [["EFPC_GEN", fpc], ["EFPC_AUTO", fpc], ["SMT", smt], ["ALL", [...fpc, ...smt]]]) {
      h.render().setCategory(group);
      h.render();
      let value = h.render();
      assert.deepEqual(Array.from(value.matrixRows, row => row.gate_name), expected);
      assert.equal(value.filters.selectedGate, group === "SMT" ? "MFPC" : "FFPC");
      assert.equal(value.matrixRows[0].todayCell.quantities.total.piece, group === "EFPC_AUTO" || group === "ALL" ? 10 : 0);
      assert.ok(value.matrixRows.every(row => row.days.length === 14));
      value.selectGate(expected.at(-1));
      h.render();
      value = h.render();
      assert.equal(value.filters.selectedGate, expected.at(-1));
      assert.equal(value.chartDataByUnit.piece.length, 15);
      assert.ok(value.chartDataByUnit.piece.every(day => day.total === 0));
      assert.equal(value.filteredTableRows.length, 0);
    }
    h.render().setCategory("EFPC_GEN");
    h.render().selectGate("SHIP");
    h.render();
    assert.equal(h.render().filters.selectedGate, "FFPC");
    assert.equal(h.render().chartDataByUnit.piece[0].total, 0);
    h.render().setSearch("NO-MATCH");
    assert.deepEqual(Array.from(h.render().matrixRows, row => row.gate_name), fpc);
    assert.ok(h.render().matrixRows.every(row => row.todayCell.quantities.total.piece === 0));
    assert.equal(h.requests.length, 2);
  } finally { h.unmount(); }
});

test("table API returns the stored process group including null values", async () => {
  const routes = new Map();
  const expectedRows = [{ process_group: "EFPC_GEN" }, { process_group: "EFPC_AUTO" }, { process_group: "SMT" }, { process_group: null }];
  let queryText;
  const context = {
    module: { exports: {} },
    process: { env: {} },
    require(name) {
      if (name === "express") return { Router: () => ({ get: (url, handler) => routes.set(url, handler) }) };
      if (name.endsWith("/config")) return { pool_smart: { query: async (sql, params) => {
        queryText = sql;
        assert.deepEqual(Array.from(params), []);
        return { rows: expectedRows };
      } } };
      if (name.endsWith("/workingCalendar")) return {};
      if (name.endsWith("/gateCalendarCache")) return require("../routes/10.17.87.244/Planning System/WorkingDayCalendar/gateCalendarCache");
      if (name.endsWith("/gateTableCache")) return require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTableCache");
      if (name.endsWith("/gateTablePerformance")) return {
        createGateTableProfiler: pool => require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTablePerformance").createGateTableProfiler(pool, { enabled: false }),
      };
      throw new Error("Unexpected dependency");
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(routesRoot, routePath), "utf8"), context);
  const res = { set() {}, json(body) { this.body = body; } };
  await routes.get("/table")({ query: {} }, res);
  assert.match(queryText, /proc_disp,\s+process_group,\s+seq,/);
  assert.equal(res.body.status, "OK");
  assert.deepEqual(res.body.data, expectedRows);
});

test("period counts deduplicate a physical lot across dates without changing daily drilldown", async () => {
  const h = hookHarness();
  try {
    h.render();
    const base = { prd_name: "SAMPLE", prd_category: "FPC", process_group: "EFPC_GEN", gate_name: "FFPC", gate_order: 1, gate_state: "coming", lot_no: "LOT-A", qty: 90, pcs_per_sheet: 30, pri: 1, arrive_by: "2026-01-01", must_out: "2026-01-03" };
    await h.succeed(h.requests.slice(), [base, { ...base, arrive_by: "2026-01-02", due_date: "2026-02-01" }]);
    const value = h.render();
    assert.equal(value.gateFlowList[0].quantities.total.lot, 1);
    assert.equal(value.gateFlowList[0].quantities.total.piece, 90);
    assert.equal(value.chartDataByUnit.lot[0].total, 1);
    assert.equal(value.chartDataByUnit.lot[1].total, 1);
    value.selectDate("2026-01-02");
    assert.equal(h.render().tableStats.totalLots, 1);
    assert.equal(h.render().filteredTableRows.length, 1);
  } finally { h.unmount(); }
});
