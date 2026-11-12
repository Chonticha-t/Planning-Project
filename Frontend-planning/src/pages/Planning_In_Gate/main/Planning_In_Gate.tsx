import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { History, RotateCcw, Save, SlidersHorizontal } from "lucide-react";

import "../../Planning_Summary_Gate/gateTheme.css";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ConfirmDialog";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import type { CountUnit, InGateCategory, InGateLot, InGateView, OrderBy, OrderHistoryEntry, SavedOrder } from "../types";
import { buildWorkList, tabsForCategory } from "../mock/inGateMockData";
import {
  appendOrderHistory,
  loadOrderHistory,
  loadSavedOrders,
  loadSavedPlans,
  orderKey,
  saveOrder,
} from "../planStore";
import { applySavedOrder, diffOrder, movedLotIds, moveItem, splitByCapacity, sumMinutes } from "../utils";
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

const Planning_In_Gate: React.FC = () => {
  const { user } = useAuth();
  const confirm = useConfirm();
  const userName = user?.full_name || user?.username || "Planner";
  const todayStr = dayjs().format("YYYY-MM-DD");

  const [searchParams, setSearchParams] = useSearchParams();
  // ?cat=ALL|EFPC_GEN|EFPC_AUTO|SMT (old ?group=SMT links still work)
  const catParam = searchParams.get("cat") ?? (searchParams.get("group") === "SMT" ? "SMT" : "");
  const category: InGateCategory = CATEGORIES.includes(catParam as InGateCategory)
    ? (catParam as InGateCategory)
    : "EFPC_GEN";

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
  const [gateId, setGateId] = useState(() => tabsForCategory(category)[0].gate.id);
  const [orderBy, setOrderBy] = useState<OrderBy>("plan");
  const [search, setSearch] = useState("");

  const [plans, setPlans] = useState(loadSavedPlans);
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
      setPlans(loadSavedPlans());
      setSavedOrders(loadSavedOrders());
      setHistory(loadOrderHistory());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Only gates whose FPC / SMT plan has been saved from Capacity Leveling
  const tabs = useMemo(
    () => tabsForCategory(category).filter((t) => plans[t.group]),
    [category, plans]
  );

  // Keep the selected gate valid when switching process group
  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.gate.id === gateId)) setGateId(tabs[0].gate.id);
  }, [tabs, gateId]);

  const tab = tabs.find((t) => t.gate.id === gateId) ?? tabs[0];
  const plan = tab ? plans[tab.group] : undefined;
  const gate = tab?.gate ?? tabsForCategory(category)[0].gate;
  const key = orderKey(tab?.scope ?? category, gate.id, date);
  const missingGroups = Array.from(new Set(tabsForCategory(category).map((t) => t.group))).filter(
    (g) => !plans[g]
  );

  // Mock work list for every tab (tabs need the counts)
  const listsByGate = useMemo(() => {
    const out: Record<string, InGateLot[]> = {};
    tabs.forEach((t) => {
      const p = plans[t.group];
      if (!p) return;
      const k = orderKey(t.scope, t.gate.id, date);
      out[t.gate.id] = applySavedOrder(
        buildWorkList(t.group, t.gate, date, p.version, t.scope),
        drafts[k] ?? savedOrders[k]?.ids
      );
    });
    return out;
  }, [tabs, plans, date, drafts, savedOrders]);

  const planOrder = useMemo(() => listsByGate[gate.id] ?? [], [listsByGate, gate.id]);
  const needMin = sumMinutes(planOrder);
  const carriedCount = planOrder.filter((l) => l.status === "carried").length;
  const isDirty = Boolean(drafts[key]);

  // Last SAVED order of this gate/day (baseline for history + Excel)
  const savedList = useMemo(
    () =>
      tab && plan
        ? applySavedOrder(buildWorkList(tab.group, gate, date, plan.version, tab.scope), savedOrders[key]?.ids)
        : [],
    [tab, plan, gate, date, savedOrders, key]
  );
  // Unsaved moves compared with the saved order
  const pendingDiff = useMemo(
    () => (isDirty ? diffOrder(savedList, planOrder, movedLotIds(draftChanges[key]), gate.capacityMin) : null),
    [isDirty, savedList, planOrder, draftChanges, key, gate.capacityMin]
  );

  const setCategory = (c: InGateCategory) => {
    const next = new URLSearchParams(searchParams);
    next.delete("group");
    next.set("cat", c);
    setSearchParams(next, { replace: true });
    const first = tabsForCategory(c).find((t) => plans[t.group]) ?? tabsForCategory(c)[0];
    setGateId(first.gate.id);
  };

  const handleMove = useCallback(
    async (lotId: string, toIndex: number) => {
      const ids = planOrder.map((l) => l.id);
      const from = ids.indexOf(lotId);
      if (from < 0 || toIndex < 0 || toIndex >= ids.length || from === toIndex) return;

      // Every move (up or down) shifts other lots → ask first
      const movingUp = toIndex < from;
      const lot = planOrder[from];
      const beforeOver = new Set(splitByCapacity(planOrder, gate.capacityMin).over.map((l) => l.id));
      const afterOver = new Set(
        splitByCapacity(moveItem(planOrder, from, toIndex), gate.capacityMin).over.map((l) => l.id)
      );
      const ok = await confirm({
        title: `Move ${lot.id} ${movingUp ? "up" : "down"} to ${toIndex + 1}?`,
        description: (
          <MoveSummary
            lot={lot}
            from={from}
            to={toIndex}
            shifted={movingUp ? planOrder.slice(toIndex, from) : planOrder.slice(from + 1, toIndex + 1)}
            nowFit={planOrder.filter((l) => beforeOver.has(l.id) && !afterOver.has(l.id))}
            pushedOut={planOrder.filter((l) => !beforeOver.has(l.id) && afterOver.has(l.id))}
          />
        ),
        confirmText: movingUp ? "Move up" : "Move down",
        cancelText: "Cancel",
        confirmClassName: "!bg-[#4f46e5] hover:!bg-[#4338ca] !border-[#4f46e5] !text-white shadow-xs",
        size: "md",
      });
      if (!ok) return;

      const next = moveItem(ids, from, toIndex);
      setUndoStack((u) => ({ ...u, [key]: [...(u[key] ?? []), { ids, changes: draftChanges[key] ?? [] }] }));
      setDrafts((d) => ({ ...d, [key]: next }));
      setDraftChanges((c) => ({
        ...c,
        [key]: [...(c[key] ?? []).filter((s) => !s.startsWith(`moved ${lotId} `)), `moved ${lotId} to #${toIndex + 1}`],
      }));
    },
    [planOrder, key, draftChanges, confirm, gate.capacityMin]
  );

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
    setPlans(loadSavedPlans());
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
    if (isDirty) toast("Exporting the saved order — press Save order to include your changes.", { icon: "ℹ️" });
  };

  // Summary · Month → one row per product, one column per working day (actual, or plan for future days)
  const handleMonthExcel = () => {
    if (!tab || !plan) return;
    const data = buildMonthSummary(tab.scope, gate, month, plan.version, todayStr);
    const days = data.days.filter((d) => !d.off);
    const totals = dayTotals(data, unit);
    const rows = data.rows.map((r) => {
      const row: Record<string, string | number> = { product: r.product.name, code: r.product.code };
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
    const totalRow: Record<string, string | number> = { product: "Total", code: "", actual: 0, plan: 0 };
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
    <div className="planning-summary-gate flex flex-col gap-4 w-full">
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
      />

      {!tab ? (
        <div className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-12 text-center">
          <SlidersHorizontal size={28} className="mx-auto text-[#4f46e5]" />
          <h2 className="mt-3 text-base font-bold">No {missingGroups.join(" / ")} plan has been saved yet</h2>
          <p className="mt-1 text-sm text-base-content/60">
            Open Capacity Leveling, level the releases, then press <b>Save Plan</b>. The work list for each gate appears here.
          </p>
          <Link
            to="/planning/planning_summary_gate/capacity_leveling"
            className="btn btn-sm mt-5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white border-0"
          >
            Go to Capacity Leveling
          </Link>
        </div>
      ) : view === "month" ? (
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
        <div className="rounded-2xl bg-base-100 border border-base-300 shadow-xs overflow-hidden">
          {/* Gate tabs */}
          <div className="flex gap-1 overflow-x-auto bg-[#316be8] px-4 pt-3">
            {tabs.map(({ gate: g, scope }) => {
              const lots = listsByGate[g.id] ?? [];
              const active = g.id === gate.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGateId(g.id)}
                  className={`shrink-0 rounded-t-lg px-5 py-2 text-left cursor-pointer transition-colors ${
                    active ? "bg-base-100 text-[#4f46e5]" : "text-white hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-bold">
                    {g.name}
                    {drafts[orderKey(scope, g.id, date)] && <span title="Unsaved changes"> •</span>}
                  </div>
                  <div className={`text-xs tabular-nums ${active ? "text-base-content/60" : "text-white/80"}`}>
                    {lots.length} lots
                    {active && ` · ${fmt(needMin)} / ${fmt(g.capacityMin)} min`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Section title */}
          <div className="px-6 pt-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold">
                {gate.name} · {dayjs(date).format("ddd DD/MM")}
              </h2>
              <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                Available {fmt(gate.capacityMin)} min
              </span>
              {carriedCount > 0 && (
                <span className="rounded-md bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                  {carriedCount} carried over from {dayjs(date).subtract(1, "day").format("DD/MM")}
                </span>
              )}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  className="btn h-10 rounded-xl border-base-300 bg-base-100 px-4 gap-1.5 font-semibold"
                >
                  <History size={15} /> History
                  {(history[key]?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-[#eef2ff] px-1.5 text-xs font-bold text-[#4f46e5]">
                      {history[key].length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!(undoStack[key]?.length)}
                  className="btn h-10 rounded-xl border-base-300 bg-base-100 px-4 gap-1.5 font-semibold"
                >
                  <RotateCcw size={15} /> Undo
                </button>
                <button
                  type="button"
                  onClick={handleSaveOrder}
                  disabled={!isDirty}
                  className="btn h-10 rounded-xl border-0 bg-[#4f46e5] hover:bg-[#4338ca] px-5 gap-1.5 font-bold text-white"
                >
                  <Save size={15} /> Save order
                </button>
              </div>
            </div>

          </div>

          <div className="mt-4">
            <WorkListTable
              key={key}
              planOrder={planOrder}
              capacityMin={gate.capacityMin}
              orderBy={orderBy}
              search={search}
              onMove={handleMove}
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
