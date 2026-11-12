import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";

import "../../Planning_Summary_Gate/gateTheme.css";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import type {
  CountUnit,
  FinishedTodaySummary,
  GateGroup,
  InGateCategory,
  InGateLot,
  InGateView,
  OrderBy,
  OrderHistoryEntry,
  SavedOrder,
  SavedPlanInfo,
  WorkMode,
} from "../types";
import {
  buildFinishedToday,
  buildWorkList,
  PCS_PER_SHEET,
  routeGatesForGroup,
  tabsForCategory,
} from "../mock/inGateMockData";
import {
  appendOrderHistory,
  loadOrderHistory,
  loadSavedOrders,
  loadSavedPlans,
  orderKey,
  saveOrder,
} from "../planStore";
import {
  applySavedOrder,
  autoArrangeLots,
  diffOrder,
  movedLotIds,
  moveItem,
  splitByCapacity,
} from "../utils";
import { InGateHeader } from "../components/InGateHeader";
import { WorkListTable } from "../components/WorkListTable";
import { MoveSummary } from "../components/MoveSummary";
import { SaveOrderModal } from "../components/SaveOrderModal";
import { HistoryPanel } from "../components/HistoryPanel";
import { MonthlySummary } from "../components/MonthlySummary";
import { buildMonthSummary, dayTotals, toUnit, UNIT_LABEL } from "../mock/monthlyMockData";

type UndoEntry = { ids: string[]; changes: string[] };

const fmt = (n: number) => n.toLocaleString();

const CATEGORIES: InGateCategory[] = ["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"];

const DEFAULT_MOCK_PLAN: SavedPlanInfo = {
  version: 1,
  savedAt: "2026-11-12T08:00:00.000Z",
  savedBy: "Planner",
  sourceCategory: "EFPC_AUTO",
};

const loadPlansWithFallback = (): Record<GateGroup, SavedPlanInfo> => {
  const stored = loadSavedPlans();
  return {
    FPC: stored.FPC ?? DEFAULT_MOCK_PLAN,
    SMT: stored.SMT ?? DEFAULT_MOCK_PLAN,
  };
};

const Planning_In_Gate: React.FC = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const userName = user?.full_name || user?.username || "Planner";
  const todayStr = dayjs().format("YYYY-MM-DD");

  const [searchParams, setSearchParams] = useSearchParams();
  // ?cat=ALL|EFPC_GEN|EFPC_AUTO|SMT (defaults to EFPC_AUTO matching the mockup)
  const catParam =
    searchParams.get("cat") ?? (searchParams.get("group") === "SMT" ? "SMT" : "");
  const category: InGateCategory = CATEGORIES.includes(catParam as InGateCategory)
    ? (catParam as InGateCategory)
    : "EFPC_AUTO";

  // ?view=month → Summary · Month (mock data)
  const view: InGateView = searchParams.get("view") === "month" ? "month" : "day";
  const setView = (v: InGateView) => {
    const next = new URLSearchParams(searchParams);
    if (v === "month") next.set("view", "month");
    else next.delete("view");
    setSearchParams(next, { replace: true });
  };
  const thisMonth = todayStr.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [unit, setUnit] = useState<CountUnit>("lots");

  const [date, setDate] = useState(todayStr);
  const [gateId, setGateId] = useState(() => {
    const catTabs = tabsForCategory(category);
    const fvac = catTabs.find((t) => t.gate.id === "FVAC");
    return (fvac ?? catTabs[0]).gate.id;
  });
  const [orderBy, setOrderBy] = useState<OrderBy>("plan");
  const [search, setSearch] = useState("");
  const [workMode, setWorkMode] = useState<WorkMode>("edit");
  const [tvMode, setTvMode] = useState(false);

  const [plans, setPlans] = useState<Record<GateGroup, SavedPlanInfo>>(loadPlansWithFallback);
  const [savedOrders, setSavedOrders] = useState<Record<string, SavedOrder>>(loadSavedOrders);
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [draftChanges, setDraftChanges] = useState<Record<string, string[]>>({});
  const [undoStack, setUndoStack] = useState<Record<string, UndoEntry[]>>({});
  const [history, setHistory] = useState<Record<string, OrderHistoryEntry[]>>(loadOrderHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // Pick up a plan saved from Capacity Leveling in another tab
  useEffect(() => {
    const onStorage = () => {
      setPlans(loadPlansWithFallback());
      setSavedOrders(loadSavedOrders());
      setHistory(loadOrderHistory());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const tabs = useMemo(() => tabsForCategory(category), [category]);

  // Keep the selected gate valid when switching process group
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.gate.id === gateId)) {
      setGateId(tabs[0].gate.id);
    }
  }, [tabs, gateId]);

  const tab = tabs.find((t) => t.gate.id === gateId) ?? tabs[0];
  const plan = tab ? plans[tab.group] : DEFAULT_MOCK_PLAN;
  const gate = tab?.gate ?? tabsForCategory(category)[0].gate;
  const key = orderKey(tab?.scope ?? category, gate.id, date);

  // Mock work list + finished summary for every tab
  const listsByGate = useMemo(() => {
    const out: Record<string, InGateLot[]> = {};
    tabs.forEach((t) => {
      const p = plans[t.group];
      const k = orderKey(t.scope, t.gate.id, date);
      out[t.gate.id] = applySavedOrder(
        buildWorkList(t.group, t.gate, date, p.version, t.scope),
        drafts[k] ?? savedOrders[k]?.ids
      );
    });
    return out;
  }, [tabs, plans, date, drafts, savedOrders]);

  const finishedByGate = useMemo(() => {
    const out: Record<string, FinishedTodaySummary> = {};
    tabs.forEach((t) => {
      const qLen = (listsByGate[t.gate.id] ?? []).length;
      out[t.gate.id] = buildFinishedToday(t.group, t.gate, date, qLen);
    });
    return out;
  }, [tabs, listsByGate, date]);

  const planOrder = useMemo(() => listsByGate[gate.id] ?? [], [listsByGate, gate.id]);
  const finishedToday = useMemo(
    () => finishedByGate[gate.id] ?? buildFinishedToday(tab.group, gate, date, planOrder.length),
    [finishedByGate, gate, tab.group, date, planOrder.length]
  );
  const routeGates = useMemo(() => routeGatesForGroup(tab.group), [tab.group]);

  const { over } = useMemo(
    () => splitByCapacity(planOrder, gate.capacityMin),
    [planOrder, gate.capacityMin]
  );

  const holdCount = useMemo(
    () => planOrder.filter((l) => l.status === "hold").length,
    [planOrder]
  );
  const isDirty = Boolean(drafts[key]);

  // Last SAVED order of this gate/day (baseline for history + Excel)
  const savedList = useMemo(
    () =>
      tab && plan
        ? applySavedOrder(
            buildWorkList(tab.group, gate, date, plan.version, tab.scope),
            savedOrders[key]?.ids
          )
        : [],
    [tab, plan, gate, date, savedOrders, key]
  );

  // Unsaved moves compared with the saved order
  const pendingDiff = useMemo(
    () =>
      isDirty
        ? diffOrder(
            savedList,
            planOrder,
            movedLotIds(draftChanges[key]),
            gate.capacityMin
          )
        : null,
    [isDirty, savedList, planOrder, draftChanges, key, gate.capacityMin]
  );

  const setCategory = (c: InGateCategory) => {
    const next = new URLSearchParams(searchParams);
    next.delete("group");
    next.set("cat", c);
    setSearchParams(next, { replace: true });
    const nextTabs = tabsForCategory(c);
    const keepCurrent = nextTabs.find((t) => t.gate.id === gateId);
    setGateId((keepCurrent ?? nextTabs[0]).gate.id);
  };

  const handleMove = useCallback(
    async (lotId: string, toIndex: number) => {
      if (workMode !== "edit") return;
      const ids = planOrder.map((l) => l.id);
      const from = ids.indexOf(lotId);
      if (from < 0 || toIndex < 0 || toIndex >= ids.length || from === toIndex) return;

      const movingUp = toIndex < from;
      const lot = planOrder[from];
      const beforeOver = new Set(
        splitByCapacity(planOrder, gate.capacityMin).over.map((l) => l.id)
      );
      const afterOver = new Set(
        splitByCapacity(moveItem(planOrder, from, toIndex), gate.capacityMin).over.map(
          (l) => l.id
        )
      );
      const ok = await confirm({
        title: `Move ${lot.id} ${movingUp ? "up" : "down"} to #${toIndex + 1}?`,
        description: (
          <MoveSummary
            lot={lot}
            from={from}
            to={toIndex}
            shifted={
              movingUp
                ? planOrder.slice(toIndex, from)
                : planOrder.slice(from + 1, toIndex + 1)
            }
            nowFit={planOrder.filter(
              (l) => beforeOver.has(l.id) && !afterOver.has(l.id)
            )}
            pushedOut={planOrder.filter(
              (l) => !beforeOver.has(l.id) && afterOver.has(l.id)
            )}
          />
        ),
        confirmText: movingUp ? "Move up" : "Move down",
        cancelText: "Cancel",
        confirmClassName:
          "!bg-[#316be8] hover:!bg-[#2557c7] !border-[#316be8] !text-white shadow-xs",
        size: "md",
      });
      if (!ok) return;

      const next = moveItem(ids, from, toIndex);
      setUndoStack((u) => ({
        ...u,
        [key]: [...(u[key] ?? []), { ids, changes: draftChanges[key] ?? [] }],
      }));
      setDrafts((d) => ({ ...d, [key]: next }));
      setDraftChanges((c) => ({
        ...c,
        [key]: [
          ...(c[key] ?? []).filter((s) => !s.startsWith(`moved ${lotId} `)),
          `moved ${lotId} to #${toIndex + 1}`,
        ],
      }));
    },
    [workMode, planOrder, key, draftChanges, confirm, gate.capacityMin]
  );

  const handleAutoArrange = () => {
    if (workMode !== "edit") return;
    const currentIds = planOrder.map((l) => l.id);
    const { ids: nextIds, changes } = autoArrangeLots(planOrder);
    if (nextIds.join("|") === currentIds.join("|")) {
      toast("Queue is already in optimal order", { icon: "✨" });
      return;
    }
    setUndoStack((u) => ({
      ...u,
      [key]: [...(u[key] ?? []), { ids: currentIds, changes: draftChanges[key] ?? [] }],
    }));
    setDrafts((d) => ({ ...d, [key]: nextIds }));
    setDraftChanges((c) => ({
      ...c,
      [key]: [...(c[key] ?? []), ...changes],
    }));
    toast.success("Auto-arranged queue by due date & setup grouping");
  };

  const handleUndo = () => {
    const stack = undoStack[key] ?? [];
    const last = stack[stack.length - 1];
    if (!last) return;
    setUndoStack((u) => ({ ...u, [key]: stack.slice(0, -1) }));
    const savedIds = savedOrders[key]?.ids;
    const isBackToSaved =
      stack.length === 1 ||
      (savedIds ? savedIds.join() === last.ids.join() : false);
    setDrafts((d) => {
      const n = { ...d };
      if (isBackToSaved) delete n[key];
      else n[key] = last.ids;
      return n;
    });
    setDraftChanges((c) => ({ ...c, [key]: last.changes }));
  };

  const handleSaveOrder = () => {
    if (!plan || !drafts[key]) return;
    setSaveOpen(true);
  };

  const confirmSaveOrder = (reason: string) => {
    if (!plan || !drafts[key] || !pendingDiff) return;
    const savedAt = new Date().toISOString();
    const entry: SavedOrder = {
      ids: drafts[key],
      savedAt,
      savedBy: userName,
      summary: (draftChanges[key] ?? []).join(", ") || "re-ordered",
      planVersion: plan.version,
    };
    saveOrder(key, entry);
    setSavedOrders((s) => ({ ...s, [key]: entry }));
    if (pendingDiff.moves.length > 0) {
      setHistory(
        appendOrderHistory(key, {
          id: `${Date.now()}`,
          savedAt,
          savedBy: userName,
          planVersion: plan.version,
          reason: reason || undefined,
          ...pendingDiff,
        })
      );
    }
    const clear = <T,>(m: Record<string, T>) => {
      const n = { ...m };
      delete n[key];
      return n;
    };
    setDrafts(clear);
    setDraftChanges(clear);
    setUndoStack(clear);
    setSaveOpen(false);
    toast.success(`${gate.name} order saved for ${dayjs(date).format("DD/MM")}`);
  };

  const handleRefresh = () => {
    setPlans(loadPlansWithFallback());
    setSavedOrders(loadSavedOrders());
    setHistory(loadOrderHistory());
    const clear = <T,>(m: Record<string, T>) => {
      const n = { ...m };
      delete n[key];
      return n;
    };
    setDrafts(clear);
    setDraftChanges(clear);
    setUndoStack(clear);
    toast.success("Reloaded saved order");
  };

  // Excel always uses the SAVED order (what the gate actually received)
  const savedRows = () => {
    const so = new Set(splitByCapacity(savedList, gate.capacityMin).over.map((l) => l.id));
    return savedList.map((l, i) => ({
      seq: i + 1,
      product: l.product,
      lot: l.id,
      sheet: l.sheet,
      pcs: l.qty,
      outputPcs: l.outputPcs,
      outputSheet: l.outputSheet,
      today: so.has(l.id) ? "Next day / OT" : "Today",
    }));
  };

  const warnUnsaved = () => {
    if (isDirty) {
      toast("Exporting the saved order — press Save order to include your changes.", {
        icon: "ℹ️",
      });
    }
  };

  // Summary · Month → one row per product, one column per working day
  const handleMonthExcel = () => {
    if (!tab || !plan) return;
    const data = buildMonthSummary(tab.scope, gate, month, plan.version, todayStr);
    const days = data.days.filter((d) => !d.off);
    const totals = dayTotals(data, unit);
    const rows = data.rows.map((r) => {
      const row: Record<string, string | number> = {
        product: r.product.name,
        code: r.product.code,
      };
      let actual = 0;
      let planTotal = 0;
      days.forEach((d) => {
        const c = r.cells[d.date];
        if (!c) return;
        planTotal += toUnit(c.plan, r.product, unit);
        if (c.ds === null) {
          row[`p${d.day}`] = toUnit(c.plan, r.product, unit);
          return;
        }
        row[`d${d.day}`] = toUnit(c.ds, r.product, unit);
        row[`n${d.day}`] = toUnit(c.ns ?? 0, r.product, unit);
        actual += toUnit(c.ds + (c.ns ?? 0), r.product, unit);
      });
      return { ...row, actual, plan: planTotal };
    });
    const totalRow: Record<string, string | number> = {
      product: "Total",
      code: "",
      actual: 0,
      plan: 0,
    };
    days.forEach((d) => {
      const t = totals[d.date];
      totalRow.plan = (totalRow.plan as number) + t.plan;
      if (!t.hasActual) {
        totalRow[`p${d.day}`] = t.plan;
        return;
      }
      totalRow[`d${d.day}`] = t.ds;
      totalRow[`n${d.day}`] = t.ns;
      totalRow.actual = (totalRow.actual as number) + t.ds + t.ns;
    });
    const num = { width: 8, align: "right" as const, numFmt: "#,##0" };
    exportToExcel({
      fileName: `InGate_Month_${category}_${gate.name.replace("/", "")}_${month.replace("-", "")}_${UNIT_LABEL[unit]}`,
      data: [...rows, totalRow],
      columns: [
        { header: "Product", key: "product", width: 16 },
        { header: "Code", key: "code", width: 12 },
        ...days.flatMap((d) => {
          const group = dayjs(d.date).format("ddd DD/MM");
          return d.phase === "future"
            ? [{ header: "Plan", key: `p${d.day}`, group, ...num }]
            : [
                { header: "D/S", key: `d${d.day}`, group, ...num },
                { header: "N/S", key: `n${d.day}`, group, ...num },
              ];
        }),
        { header: `Actual (${UNIT_LABEL[unit]})`, key: "actual", ...num, width: 14 },
        { header: `Plan (${UNIT_LABEL[unit]})`, key: "plan", ...num, width: 14 },
      ],
    });
  };

  const handleExcel = () => {
    if (view === "month") return handleMonthExcel();
    warnUnsaved();
    exportToExcel({
      fileName: `InGate_${category}_${gate.name.replace("/", "")}_${dayjs(date).format("YYYYMMDD")}`,
      data: savedRows(),
      columns: [
        { header: "Pri", key: "seq", width: 6, align: "center" },
        { header: "Product", key: "product", width: 14 },
        { header: "Lot No", key: "lot", width: 14 },
        { header: "Sheet", key: "sheet", width: 10, align: "right", numFmt: "#,##0" },
        { header: "Pcs", key: "pcs", width: 10, align: "right", numFmt: "#,##0" },
        { header: "Output (pcs)", key: "outputPcs", width: 13, align: "right", numFmt: "#,##0" },
        { header: "Output (sheet)", key: "outputSheet", width: 14, align: "right", numFmt: "#,##0" },
        { header: "Run", key: "today", width: 14 },
      ],
    });
  };

  return (
    <div
      className={`planning-summary-gate flex flex-col gap-4 w-full ${
        tvMode ? "fixed inset-0 z-[100] overflow-y-auto bg-base-200 p-4 sm:p-6" : ""
      }`}
    >
      <InGateHeader
        view={view}
        onViewChange={setView}
        month={month}
        thisMonth={thisMonth}
        onMonthChange={setMonth}
        unit={unit}
        onUnitChange={setUnit}
        category={category}
        onCategoryChange={setCategory}
        date={date}
        todayStr={todayStr}
        onDateChange={setDate}
        orderBy={orderBy}
        onOrderByChange={setOrderBy}
        search={search}
        onSearchChange={setSearch}
        onExcel={handleExcel}
        onRefresh={handleRefresh}
        workMode={workMode}
        onWorkModeChange={setWorkMode}
        tvMode={tvMode}
        onTvModeChange={setTvMode}
      />

      {view === "month" ? (
        <MonthlySummary
          tabs={tabs}
          plans={plans}
          gateId={gate.id}
          onGateChange={setGateId}
          month={month}
          today={todayStr}
          unit={unit}
          search={search}
        />
      ) : (
        <div className="rounded-2xl bg-base-100 border border-base-300 shadow-xs overflow-visible">
          {/* Gate tabs — identical blue bar (#316be8) & tab style as MonthlySummary */}
          <div className="flex gap-1 overflow-x-auto rounded-t-2xl bg-[#316be8] px-4 pt-3">
            {tabs.map(({ gate: g, scope }) => {
              const qLots = listsByGate[g.id] ?? [];
              const fin = finishedByGate[g.id];
              const totalGateLots = (fin?.totalLots ?? 0) + qLots.length;
              const totalGatePcs =
                (fin?.totalPcs ?? 0) + qLots.reduce((s, l) => s + l.qty, 0);
              const totalGateSheets = Math.ceil(totalGatePcs / PCS_PER_SHEET);
              const tabCountText =
                unit === "pcs"
                  ? `${fmt(totalGatePcs)} pcs`
                  : unit === "sheets"
                    ? `${fmt(totalGateSheets)} sheets`
                    : `${totalGateLots} lots`;
              const active = g.id === gate.id;
              const hasDraft = Boolean(drafts[orderKey(scope, g.id, date)]);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGateId(g.id)}
                  className={`shrink-0 rounded-t-lg px-5 py-2 text-left cursor-pointer transition-colors ${
                    active
                      ? "bg-base-100 text-[#316be8]"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-bold">
                    {g.name}
                    {hasDraft && (
                      <span title="Unsaved changes"> •</span>
                    )}
                  </div>
                  <div
                    className={`text-xs tabular-nums ${
                      active ? "text-base-content/60" : "text-white/80"
                    }`}
                  >
                    {tabCountText}
                    {active && " · live"}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-6 flex flex-col gap-4">
            {/* Queue Header Bar: status badges + action buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-sm font-extrabold uppercase tracking-wider mr-1">
                Queue
              </h2>

              <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold text-base-content/75">
                {unit === "pcs"
                  ? `On track · ${fmt(finishedToday.totalPcs)} out vs ${fmt(
                      finishedToday.totalPcs + 1650
                    )} planned pcs`
                  : unit === "sheets"
                    ? `On track · ${fmt(
                        Math.ceil(finishedToday.totalPcs / PCS_PER_SHEET)
                      )} out vs ${fmt(
                        Math.ceil((finishedToday.totalPcs + 1650) / PCS_PER_SHEET)
                      )} planned sheets`
                    : `On track · ${finishedToday.totalLots} out vs ${finishedToday.plannedToNow} planned`}
              </span>

              {holdCount > 0 && (
                <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold text-base-content/75">
                  {holdCount} HOLD from D/S
                </span>
              )}

              {over.length > 0 && (
                <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold text-base-content/75">
                  {over.length} won&apos;t fit before 08:00
                </span>
              )}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                {workMode === "edit" && (
                  <button
                    type="button"
                    onClick={handleAutoArrange}
                    className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content hover:bg-base-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus size={13} className="rotate-45 text-[#316be8]" />
                    <span>+ Auto-arrange</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content/80 hover:bg-base-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>History</span>
                  {(history[key]?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-[#e6f0fd] px-1.5 text-[11px] font-extrabold text-[#316be8]">
                      {history[key].length}
                    </span>
                  )}
                </button>

                {workMode === "edit" && (
                  <>
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={!(undoStack[key]?.length)}
                      className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content/80 hover:bg-base-200 disabled:opacity-40 cursor-pointer"
                    >
                      Undo
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveOrder}
                      disabled={!isDirty}
                      className="btn btn-xs h-8 rounded-lg btn-primary px-4 text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Save order
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Queue Table */}
            <WorkListTable
              key={key}
              planOrder={planOrder}
              capacityMin={gate.capacityMin}
              orderBy={orderBy}
              search={search}
              onMove={handleMove}
              currentGate={gate}
              routeGates={routeGates}
              finishedToday={finishedToday}
              workMode={workMode}
              unit={unit}
            />
          </div>
        </div>
      )}

      <SaveOrderModal
        isOpen={saveOpen}
        title={`${gate.name} · ${dayjs(date).format("ddd DD/MM")}`}
        diff={pendingDiff ?? { moves: [], pushedOut: [], nowFit: [] }}
        onClose={() => setSaveOpen(false)}
        onConfirm={confirmSaveOrder}
      />
      <HistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`${gate.name} · ${dayjs(date).format("ddd DD/MM")}`}
        plan={plan}
        entries={history[key] ?? []}
        pending={pendingDiff && pendingDiff.moves.length ? pendingDiff : null}
      />
    </div>
  );
};

export default Planning_In_Gate;
