const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const root = path.join(__dirname, "../../Frontend-planning");
const frontendRequire = createRequire(path.join(root, "package.json"));
const ts = frontendRequire("typescript");
const pageDirectory = path.join(root, "src/pages/Capacity_Leveling");

function harness() {
  const slots = [], effects = [], pending = [], requests = [], saves = [];
  let cursor = 0, dirty = true, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: "fragment",
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], value => {
        const next = typeof value === "function" ? value(slots[i]) : value;
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; }
      }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useMemo(callback, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: callback(), deps };
      return slots[i].value;
    },
    useCallback(callback, deps) { return react.useMemo(() => callback, deps); },
    useEffect(callback, deps) {
      const i = cursor++;
      if (!effects[i] || !same(effects[i].deps, deps)) pending.push(() => {
        effects[i]?.cleanup?.();
        effects[i] = { deps, cleanup: callback() };
      });
    },
  };
  const modules = new Map();
  function evaluate(filename, custom = {}) {
    if (modules.has(filename)) return modules.get(filename);
    const module = { exports: {} };
    modules.set(filename, module.exports);
    const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText;
    vm.runInNewContext(source, { module, exports: module.exports, AbortController,
      require(name) {
        if (name in custom) return custom[name];
        if (name.endsWith(".css")) return {};
        if (name === "react") return react;
        if (name === "react-hot-toast") return { success() {}, error() {} };
        if (name === "lucide-react") return { AlertTriangle: "icon", RefreshCw: "icon" };
        if (name === "@/context/AuthContext") return { useAuth: () => ({ user: { username: "planner" }, requirePlanner: async callback => callback() }) };
        if (name.endsWith("/hooks/api")) return {
          fetchLevelingData: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })),
          savePlan: async (...args) => { saves.push(args); return { plan: { version: 6 }, movedCount: 0, orderedGroupCount: 0 }; },
          toApiFailure: error => ({ message: error.message }),
        };
        if (name.endsWith("/hooks/useEditingPresence")) return { useEditingPresence: () => ({}) };
        if (name.includes("/components/")) { const type = path.basename(name); return { [type]: type }; }
        if (name.startsWith(".")) {
          const target = path.resolve(path.dirname(filename), name);
          return evaluate(path.extname(target) ? target : `${target}.ts`);
        }
        return frontendRequire(name);
      },
    });
    return module.exports;
  }
  const utils = evaluate(path.join(pageDirectory, "utils/levelingCalculations.ts"));
  const component = evaluate(path.join(pageDirectory, "main/Capacity_Leveling.tsx"), {
    "../utils/levelingCalculations": {
      ...utils, buildGrid: () => [], buildBoardLots: (_data, lots) => lots,
      calculateKpis: () => ({ movedCount: 0, missingPlanningCards: 0, overloadCells: 0, movedLateCards: 0, unsetCapacityGates: [] }),
    },
    "../utils/boardShiftAllocation": { allocateBoardShifts: () => new Map() },
  }).default;
  const find = (node, type) => {
    if (!node || typeof node !== "object") return undefined;
    if (node.type === type) return node.props;
    for (const child of (Array.isArray(node) ? node : node.props?.children ?? [])) {
      const match = find(child, type);
      if (match) return match;
    }
  };
  const render = () => {
    let iterations = 0;
    do {
      assert.ok(iterations++ < 20, "render must settle");
      cursor = 0; dirty = false;
      tree = component({});
      while (pending.length) pending.shift()();
    } while (dirty);
  };
  const flush = async () => { await new Promise(resolve => setImmediate(resolve)); render(); };
  render();
  return { requests, saves, flush, props: type => { render(); return find(tree, type); },
    async resolve(value) { requests.at(-1).resolve(value); await flush(); },
    unmount() { effects.forEach(effect => effect?.cleanup?.()); },
  };
}

const data = (arrival = "2026-11-12") => ({
  today: "2026-11-12", days: [], calendarDays: [], gates: [], capacity: {}, arrivalRows: [],
  cards: ["EFPC_GEN", "SMT"].map((processGroup, index) => ({ id: String(index), workKey: String(index),
    gate: index ? "MMOT" : "FADL", processGroup, baseDate: arrival, plannedDate: "2026-11-20",
    prdName: "SYNTHETIC", lotNo: `L${index}` })),
  boardCardOrder: [{ gate: "FADL", date: "2026-11-20", cardIds: ["0"] }],
  plan: { version: 5 },
});

test("reset requires confirmation, loads fresh data, survives reload and saves empty overrides as a new version", async () => {
  const h = harness();
  try {
    await h.resolve(data());
    assert.ok(!h.requests[0].args[4], "initial load must read the locked active plan");
    h.props("LevelingHeader").onResetRequired();
    assert.equal(h.requests.length, 1);
    h.props("ResetRequiredModal").onCancel();
    assert.equal(h.props("ResetRequiredModal"), undefined);
    h.props("LevelingHeader").onResetRequired();
    h.props("ResetRequiredModal").onConfirm();
    assert.equal(h.requests.at(-1).args[3], true, "reset must bypass backend cache");
    assert.equal(h.requests.at(-1).args[4], true, "reset must request live Summary Gate arrivals");
    await h.resolve(data("2026-11-13"));
    assert.equal(h.saves.length, 0, "reset must never auto-save");
    const lots = h.props("LotDetailSidePanel").allLots;
    assert.ok(lots.every(lot => lot.plannedDate === "2026-11-13"));
    assert.ok(lots.every(lot => lot.savedDate === "2026-11-20"));
    assert.equal(h.props("LevelingHeader").canSave, true);
    assert.equal(h.props("LevelingHeader").isDraftModified, true);
    h.props("LevelingHeader").onReload();
    assert.equal(h.requests.at(-1).args[4], true, "reload during reset draft must keep loading live arrivals");
    await h.resolve(data("2026-11-14"));
    assert.ok(h.props("LotDetailSidePanel").allLots.every(lot => lot.plannedDate === "2026-11-14"));
    h.props("LevelingHeader").onSavePlan();
    assert.equal(h.props("SavePlanModal").resetToRequired, true);
    h.props("SavePlanModal").onConfirmSave("Reset to Required");
    await h.flush();
    assert.equal(h.saves[0][0], 5);
    assert.equal(h.saves[0][1].length, 0);
    assert.equal(h.saves[0][2], "Reset to Required");
    assert.equal(h.saves[0][3].length, 0, "saved ordering must be explicitly cleared");
    assert.equal(h.saves[0][4], true, "reset save must flag resetToRequired");
    const saved = data("2026-11-14");
    saved.cards.forEach(card => { card.plannedDate = card.baseDate; });
    saved.boardCardOrder = [];
    saved.plan.version = 6;
    assert.ok(!h.requests.at(-1).args[4], "post-save reload must return to locked plan mode");
    await h.resolve(saved);
    assert.equal(h.props("LevelingHeader").isDraftModified, false);
  } finally { h.unmount(); }
});

test("failed reset preserves existing dates and permits retry", async () => {
  const h = harness();
  try {
    await h.resolve(data());
    h.props("LevelingHeader").onResetRequired();
    h.props("ResetRequiredModal").onConfirm();
    h.requests.at(-1).reject(new Error("Synthetic outage"));
    await h.flush();
    assert.ok(h.props("LotDetailSidePanel").allLots.every(lot => lot.plannedDate === "2026-11-20"));
    assert.equal(h.props("ResetRequiredModal").error, "Synthetic outage");
    assert.equal(h.saves.length, 0);
    h.props("ResetRequiredModal").onConfirm();
    await h.resolve(data());
    assert.equal(h.props("ResetRequiredModal"), undefined);
    assert.ok(h.props("LotDetailSidePanel").allLots.every(lot => lot.plannedDate === "2026-11-12"));
  } finally { h.unmount(); }
});
