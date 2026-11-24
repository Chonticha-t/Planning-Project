import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { allocateBoardShifts } from "../../Capacity_Leveling/utils/boardShiftAllocation";
import { applyBoardCardOrder, readBoardCardOrder, reorderBoardCards, type BoardCardOrder } from "../../Capacity_Leveling/utils/boardCardOrder";
import { buildBoardLots, toLotItem } from "../../Capacity_Leveling/utils/levelingCalculations";
import type { LotItem } from "../../Capacity_Leveling/types";
import type { CountUnit, InGateCategory, InGateView, MonthOutputScope, WorkMode } from "../types";
import { planStatus, savedPlanGates, savedViewRows } from "../savedPlan";
import { buildWorkRows } from "../finishedPlan";
import {
  buildSaveOrderItems,
  computeOrderDiff,
  findDirtyOrderScopes,
  hasActiveInGateOrder,
  mergeInGateOrders,
  orderScopeKey,
} from "../inGateOrder";
import { saveInGateOrder } from "./inGateOrderApi";
import { useInGateOrders } from "./useInGateOrders";
import { useSavedPlan } from "./useSavedPlan";
import { useFinishedToday } from "./useFinishedToday";
import { useMonthlyOutput } from "./useMonthlyOutput";

const CATEGORIES: InGateCategory[] = ["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"];
const DEFAULT_FPC_GATES = ["FVAC", "FADL", "FIN"];
const DEFAULT_SMT_GATES = ["MMOT", "MBLK", "MFIN"];
const TV_REFRESH_MS = 60000;

export interface StagedReorder {
  scopeKey: string;
  before: LotItem[];
  after: LotItem[];
  beforePositions: ReadonlyMap<string, number>;
  afterPositions: ReadonlyMap<string, number>;
  movingIds: string[];
  nextOrder: BoardCardOrder;
}

export default function usePlanningInGate() {
  const [params, setParams] = useSearchParams();
  const rawCategory = params.get("cat") ?? (params.get("group") === "SMT" ? "SMT" : "EFPC_GEN");
  const category = CATEGORIES.includes(rawCategory as InGateCategory) ? rawCategory as InGateCategory : "EFPC_GEN";
  const today = dayjs().format("YYYY-MM-DD");
  const [date, setDate] = useState(today);
  const [selectedGate, setSelectedGate] = useState("FVAC");
  const [month, setMonth] = useState(today.slice(0, 7));
  const view: InGateView = params.get("view") === "month" ? "month" : "day";
  const [workMode, setWorkMode] = useState<WorkMode>("view");
  const [outputScope, setOutputScope] = useState<MonthOutputScope>("all");
  const [unit, setUnit] = useState<CountUnit>("lots");
  const [search, setSearch] = useState("");
  const [tvMode, setTvMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { saved, loading, error, reload, revalidate: revalidatePlan } = useSavedPlan();
  const inGateOrders = useInGateOrders(true);
  const { revalidate: revalidateOrders } = inGateOrders;
  const finished = useFinishedToday(date, view === "day");
  const effectiveOutputScope: MonthOutputScope = outputScope === "plan" && saved?.plan.planId ? "plan" : "all";
  const monthlyPlanId = effectiveOutputScope === "plan" ? saved?.plan.planId ?? null : null;
  const monthly = useMonthlyOutput(month, category, search, view === "month", monthlyPlanId);
  const { loading: observedLoading, revalidate: revalidateObserved } = view === "day" ? finished : monthly;

  useEffect(() => {
    if (!tvMode || loading || observedLoading) return;
    let dueAt = performance.now() + TV_REFRESH_MS;
    let timer: number | undefined;
    function schedule() {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      const now = performance.now();
      if (now >= dueAt) {
        dueAt = now + TV_REFRESH_MS;
        revalidatePlan();
        revalidateOrders();
        revalidateObserved();
      }
      timer = window.setTimeout(schedule, dueAt - now);
    }

    schedule();
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
    };
  }, [tvMode, loading, observedLoading, revalidatePlan, revalidateOrders, revalidateObserved]);

  const [draftCardOrder, setDraftCardOrder] = useState<BoardCardOrder>(new Map());
  const [resetScopes, setResetScopes] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);

  useEffect(() => {
    setDraftCardOrder(new Map());
    setResetScopes(new Set());
  }, [saved?.plan.planId, saved?.plan.version]);

  const planCardOrder = useMemo(() => readBoardCardOrder(saved?.snapshot.boardCardOrder), [saved]);
  const savedCardOrder = useMemo(
    () => mergeInGateOrders(planCardOrder, inGateOrders.orders),
    [planCardOrder, inGateOrders.orders],
  );
  const effectiveCardOrder = useMemo(() => {
    const base = resetScopes.size > 0
      ? mergeInGateOrders(planCardOrder, inGateOrders.orders, resetScopes)
      : savedCardOrder;
    return new Map([...base, ...draftCardOrder]);
  }, [planCardOrder, inGateOrders.orders, resetScopes, savedCardOrder, draftCardOrder]);

  const allBoardLots = useMemo(() => {
    if (!saved) return [];
    return buildBoardLots(saved.snapshot, saved.snapshot.cards.map(toLotItem), "ALL");
  }, [saved]);

  const categoryBoardLots = useMemo(() => {
    if (!saved) return [];
    return category === "ALL"
      ? allBoardLots
      : buildBoardLots(saved.snapshot, saved.snapshot.cards.map(toLotItem), category);
  }, [saved, category, allBoardLots]);

  const savedPlanLots = useMemo(
    () => applyBoardCardOrder(allBoardLots, effectiveCardOrder),
    [allBoardLots, effectiveCardOrder],
  );

  const rows = useMemo(
    () => applyBoardCardOrder(categoryBoardLots, effectiveCardOrder),
    [categoryBoardLots, effectiveCardOrder],
  );

  const allocations = useMemo(
    () => (saved ? allocateBoardShifts(saved.snapshot, savedPlanLots, { excludePassed: true }) : new Map()),
    [saved, savedPlanLots],
  );
  const monthAllocations = useMemo(
    () => (saved ? allocateBoardShifts(saved.snapshot, savedPlanLots, { excludePassed: false }) : new Map()),
    [saved, savedPlanLots],
  );
  const gates = useMemo(() => {
    if (saved) return savedPlanGates(saved.snapshot, category);
    const list = category === "ALL" ? [...DEFAULT_FPC_GATES, ...DEFAULT_SMT_GATES] : category === "SMT" ? DEFAULT_SMT_GATES : DEFAULT_FPC_GATES;
    return list.map(gate => ({ gate }));
  }, [saved, category]);
  const gate = gates.find(item => item.gate === selectedGate)?.gate ?? gates[0]?.gate ?? "";
  const finishedRows = useMemo(() => finished.rows.filter(row => row.gate === gate && (category === "ALL" || row.processGroup === category)), [finished.rows, gate, category]);
  const gateRows = useMemo(() => rows.filter(row => row.gate === gate), [rows, gate]);
  const dayRows = useMemo(() => savedViewRows(rows, view, view === "month" ? month : date), [rows, date, month, view]);
  const dayPlanLots = useMemo(() => rows.filter(row => row.plannedDate === date && row.gate === gate), [rows, date, gate]);
  const savedDayPlanLots = useMemo(
    () => applyBoardCardOrder(categoryBoardLots, savedCardOrder).filter(row => row.plannedDate === date && row.gate === gate),
    [categoryBoardLots, savedCardOrder, date, gate],
  );
  const scheduledDates = useMemo(() => [...new Set(gateRows.map(row => row.plannedDate))].sort(), [gateRows]);
  const queue = useMemo(() => dayRows.filter(row => row.gate === gate).map((lot, index) => ({ lot, sequence: index + 1 })), [dayRows, gate]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return queue.filter(({ lot }) => !query || [lot.label, lot.product, lot.item].some(value => value?.toLowerCase().includes(query)));
  }, [queue, search]);

  const dayWork = useMemo(
    () => buildWorkRows(dayPlanLots, savedPlanLots, finishedRows),
    [dayPlanLots, savedPlanLots, finishedRows],
  );
  const activeQueueLots = useMemo(
    () => dayWork.queue.map((row) => row.lot).filter((lot): lot is LotItem => Boolean(lot)),
    [dayWork.queue],
  );
  const activeQueueIdSet = useMemo(
    () => new Set(activeQueueLots.map((lot) => lot.id)),
    [activeQueueLots],
  );
  const excludedFromDayQueueIds = useMemo(
    () => new Set(dayPlanLots.filter((lot) => !activeQueueIdSet.has(lot.id)).map((lot) => lot.id)),
    [dayPlanLots, activeQueueIdSet],
  );

  const buildDisplayPositions = (
    lots: readonly LotItem[],
    displayFilter: "queue" | "all",
  ): Map<string, number> => {
    if (displayFilter === "all") {
      return new Map(lots.map((lot, idx) => [lot.id, idx + 1]));
    }
    const queued = lots.filter((lot) => activeQueueIdSet.has(lot.id));
    return new Map(queued.map((lot, idx) => [lot.id, idx + 1]));
  };

  const dirtyScopes = useMemo(() => {
    if (!saved || (draftCardOrder.size === 0 && resetScopes.size === 0)) return [];
    return findDirtyOrderScopes(allBoardLots, savedCardOrder, effectiveCardOrder);
  }, [saved, allBoardLots, savedCardOrder, effectiveCardOrder, draftCardOrder.size, resetScopes.size]);

  const hasUnsavedChanges = dirtyScopes.length > 0 || resetScopes.size > 0;

  const pendingDiff = useMemo(() => {
    if (!saved || !hasUnsavedChanges) return null;
    return computeOrderDiff(saved.snapshot, savedDayPlanLots, dayPlanLots, excludedFromDayQueueIds);
  }, [saved, hasUnsavedChanges, savedDayPlanLots, dayPlanLots, excludedFromDayQueueIds]);

  const currentOrder = useMemo(
    () => inGateOrders.orders.find((order) => order.gate === gate && order.date === date) ?? null,
    [inGateOrders.orders, gate, date],
  );
  const currentScopeKey = orderScopeKey(gate, date);
  const hasSavedCurrentOrder = hasActiveInGateOrder(currentOrder);
  const isCurrentScopeReset = resetScopes.has(currentScopeKey);
  const canResetOrder = Boolean(
    saved
    && !saving
    && !isCurrentScopeReset
    && (hasSavedCurrentOrder || dirtyScopes.some((scope) => scope.key === currentScopeKey)),
  );

  const stageMoveLot = (
    lot: LotItem,
    direction: "up" | "down" | "top",
    displayFilter: "queue" | "all" = "queue",
  ): StagedReorder | null => {
    if (!saved) return null;
    const index = activeQueueLots.findIndex(l => l.id === lot.id);
    if (index === -1) return null;

    let targetId: string;
    let position: "before" | "after";

    if (direction === "up") {
      if (index === 0) return null;
      targetId = activeQueueLots[index - 1].id;
      position = "before";
    } else if (direction === "down") {
      if (index >= activeQueueLots.length - 1) return null;
      targetId = activeQueueLots[index + 1].id;
      position = "after";
    } else {
      if (index === 0) return null;
      targetId = activeQueueLots[0].id;
      position = "before";
    }

    const nextOrder = reorderBoardCards(allBoardLots, effectiveCardOrder, [lot.id], targetId, position);
    if (nextOrder === effectiveCardOrder) return null;
    const after = applyBoardCardOrder(dayPlanLots, nextOrder);
    return {
      scopeKey: orderScopeKey(lot.gate, lot.plannedDate),
      before: dayPlanLots,
      after,
      beforePositions: buildDisplayPositions(dayPlanLots, displayFilter),
      afterPositions: buildDisplayPositions(after, displayFilter),
      movingIds: [lot.id],
      nextOrder,
    };
  };

  const stageReorderById = (
    movingLotId: string,
    targetLotId: string,
    position: "before" | "after" = "before",
    displayFilter: "queue" | "all" = "queue",
  ): StagedReorder | null => {
    if (!saved || !movingLotId || !targetLotId || movingLotId === targetLotId) return null;
    const target = allBoardLots.find((lot) => lot.id === targetLotId);
    if (!target) return null;
    const nextOrder = reorderBoardCards(allBoardLots, effectiveCardOrder, [movingLotId], targetLotId, position);
    if (nextOrder === effectiveCardOrder) return null;
    const after = applyBoardCardOrder(dayPlanLots, nextOrder);
    return {
      scopeKey: orderScopeKey(target.gate, target.plannedDate),
      before: dayPlanLots,
      after,
      beforePositions: buildDisplayPositions(dayPlanLots, displayFilter),
      afterPositions: buildDisplayPositions(after, displayFilter),
      movingIds: [movingLotId],
      nextOrder,
    };
  };

  const confirmReorder = (nextOrder: BoardCardOrder, scopeKey?: string) => {
    if (scopeKey) {
      const ids = nextOrder.get(scopeKey);
      if (!ids) return;
      setResetScopes((prev) => {
        if (!prev.has(scopeKey)) return prev;
        const next = new Set(prev);
        next.delete(scopeKey);
        return next;
      });
      setDraftCardOrder((prev) => {
        const updated = new Map(prev);
        updated.set(scopeKey, ids);
        return updated;
      });
      return;
    }
    setDraftCardOrder(nextOrder);
  };

  const moveLot = (lot: LotItem, direction: "up" | "down" | "top") => {
    const staged = stageMoveLot(lot, direction);
    if (staged) {
      confirmReorder(staged.nextOrder, staged.scopeKey);
    }
  };

  const undoOrder = () => {
    setDraftCardOrder(new Map());
    setResetScopes(new Set());
  };

  const resetCurrentOrder = () => {
    if (!saved || !gate || !date) return;
    const scopeKey = orderScopeKey(gate, date);
    setDraftCardOrder((prev) => {
      if (!prev.has(scopeKey)) return prev;
      const next = new Map(prev);
      next.delete(scopeKey);
      return next;
    });
    if (hasSavedCurrentOrder) {
      setResetScopes((prev) => {
        const next = new Set(prev);
        next.add(scopeKey);
        return next;
      });
      toast.success(`Reset to Plan v${saved.plan.version}. Review the draft and click Save order to apply.`);
    } else {
      toast.success(`Draft changes reverted to Plan v${saved.plan.version}.`);
    }
  };

  const saveOrder = async (reason?: string) => {
    if (!saved || (!dirtyScopes.length && !resetScopes.size) || saving) return;
    setSaving(true);
    const ordersByScope = new Map(inGateOrders.orders.map((order) => [orderScopeKey(order.gate, order.date), order]));
    const scopesToSave = dirtyScopes.map((scope) => ({
      ...scope,
      isReset: resetScopes.has(scope.key),
    }));
    const includedKeys = new Set(scopesToSave.map((scope) => scope.key));
    for (const resetKey of resetScopes) {
      if (includedKeys.has(resetKey)) continue;
      let parsedGate: string;
      let parsedDate: string;
      try {
        [parsedGate, parsedDate] = JSON.parse(resetKey) as [string, string];
      } catch {
        continue;
      }
      const scopeLots = allBoardLots.filter((lot) => lot.gate === parsedGate && lot.plannedDate === parsedDate);
      if (!scopeLots.length) continue;
      const beforeLots = applyBoardCardOrder(scopeLots, savedCardOrder);
      const afterLots = applyBoardCardOrder(scopeLots, effectiveCardOrder);
      scopesToSave.push({
        key: resetKey,
        gate: parsedGate,
        date: parsedDate,
        beforeIds: beforeLots.map((lot) => lot.id),
        afterIds: afterLots.map((lot) => lot.id),
        beforeLots,
        afterLots,
        isReset: true,
      });
    }

    const savedKeys: string[] = [];
    let lastRevision: number | null = null;
    let lastWasReset = false;
    try {
      for (const scope of scopesToSave) {
        const existing = ordersByScope.get(scope.key);
        const inactiveSet = new Set(
          scope.afterLots
            .filter((lot) => lot.passedGate || (scope.key === currentScopeKey && !activeQueueIdSet.has(lot.id)))
            .map((lot) => lot.id),
        );
        const diff = computeOrderDiff(saved.snapshot, scope.beforeLots, scope.afterLots, inactiveSet);
        const result = await saveInGateOrder({
          gate: scope.gate,
          date: scope.date,
          planId: saved.plan.planId,
          planVersion: saved.plan.version,
          baseRevision: existing?.revision ?? 0,
          cardIdsBefore: scope.beforeIds,
          cardIds: scope.afterIds,
          inactiveCardIds: [...inactiveSet],
          items: buildSaveOrderItems(scope.afterLots),
          pushedOutLots: diff?.pushedOut ?? [],
          nowFitLots: diff?.nowFit ?? [],
          reason: reason ?? (scope.isReset ? `Reset to Plan v${saved.plan.version}` : undefined),
          resetToPlan: scope.isReset,
        });
        savedKeys.push(scope.key);
        lastRevision = result.order.revision;
        lastWasReset = scope.isReset;
      }
      toast.success(
        scopesToSave.length === 1 && lastRevision !== null
          ? lastWasReset
            ? `Queue order reset to Plan v${saved.plan.version} (Order r${lastRevision})`
            : `Queue order saved (Order r${lastRevision})`
          : `Queue order saved for ${savedKeys.length} gates/days`,
      );
    } catch (err: unknown) {
      const responseData = (err as { response?: { data?: { code?: string; message?: string } } })?.response?.data;
      if (responseData?.code === "ORDER_VERSION_CONFLICT") {
        inGateOrders.reload();
      }
      const message = responseData?.message || (err instanceof Error ? err.message : "Failed to save queue order");
      toast.error(message);
    } finally {
      if (savedKeys.length > 0) {
        const savedSet = new Set(savedKeys);
        setDraftCardOrder((prev) => {
          const next = new Map(prev);
          for (const key of savedSet) next.delete(key);
          return next;
        });
        setResetScopes((prev) => {
          const next = new Set(prev);
          for (const key of savedSet) next.delete(key);
          return next;
        });
        setHistoryRefreshToken((token) => token + 1);
        inGateOrders.reload();
      }
      setSaving(false);
    }
  };

  const changeCategory = (nextCategory: InGateCategory) => {
    const next = new URLSearchParams(params);
    next.delete("group");
    next.set("cat", nextCategory);
    setParams(next, { replace: true });
  };
  const changeView = (nextView: InGateView) => {
    const next = new URLSearchParams(params);
    if (nextView === "month") next.set("view", "month");
    else next.delete("view");
    setParams(next, { replace: true });
  };
  // Tab counts for every gate, grouped in one pass over the rows.
  const gateCountTexts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const byGate = new Map<string, typeof dayRows>();
    for (const row of dayRows) {
      if (view === "month" && query && !row.product.toLowerCase().includes(query) && !row.label.toLowerCase().includes(query)) continue;
      const items = byGate.get(row.gate);
      if (items) items.push(row);
      else byGate.set(row.gate, [row]);
    }
    const format = (items: typeof dayRows) => {
      const needs = items.filter(row => row.kind === "need").length;
      const unknown = items.filter(row => row.kind === "unidentified").length;
      const value = unit === "lots" ? items.filter(row => row.kind === "lot").length
        : items.reduce<number | null>((total, row) => {
          const amount = unit === "pcs" ? row.qty : row.sheets;
          return total === null || amount === null ? null : total + amount;
        }, 0);
      return `${formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet")} ${unit}${needs ? ` · ${needs} need` : ""}${unknown ? ` · ${unknown} no ID` : ""}`;
    };
    return { byGate: new Map([...byGate].map(([gateName, items]) => [gateName, format(items)])), empty: format([]) };
  }, [dayRows, view, search, unit]);
  const countText = (gateName: string) => gateCountTexts.byGate.get(gateName) ?? gateCountTexts.empty;
  const refresh = () => {
    reload();
    inGateOrders.reload();
    setHistoryRefreshToken((token) => token + 1);
    if (view === "day") finished.reload();
    else monthly.reload();
  };
  const exportPlan = async () => {
    if (!saved || loading || error || exporting || !visible.length) return;
    setExporting(true);
    try {
      await exportToExcel({
        fileName: `InGate_Plan_v${saved.plan.version}_${gate}_${view === "month" ? month : date}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
        data: visible.map(({ lot, sequence }) => ({
          planId: saved.plan.planId, version: saved.plan.version, savedAt: saved.plan.savedAt,
          savedBy: saved.plan.savedBy, sequence, gate, plannedDate: lot.plannedDate,
          product: lot.product, lot: lot.kind === "unidentified" ? "No lot identity" : lot.label, kind: lot.kind, pcs: lot.qty ?? "N/A",
          sheets: lot.sheets === null ? "N/A" : Math.ceil(lot.sheets),
          mustOut: lot.mustOut, capturedStatus: planStatus(lot),
        })),
        columns: [
          { header: "Plan ID", key: "planId", width: 38 },
          { header: "Version", key: "version", width: 10 },
          { header: "Saved at", key: "savedAt", width: 22 },
          { header: "Saved by", key: "savedBy", width: 20 },
          { header: "Plan order", key: "sequence", width: 12 },
          { header: "Gate", key: "gate", width: 12 },
          { header: "Planned arrival", key: "plannedDate", width: 18 },
          { header: "Product", key: "product", width: 25 },
          { header: "Lot / Need WIP", key: "lot", width: 24 },
          { header: "Type", key: "kind", width: 16 },
          { header: "Pcs", key: "pcs", width: 14 },
          { header: "Sheets", key: "sheets", width: 14 },
          { header: "Source must out", key: "mustOut", width: 18 },
          { header: "Status at save", key: "capturedStatus", width: 22 },
        ],
      });
    } catch {
      toast.error("Unable to export the saved plan. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return {
    today, category, view, date, setDate, month, setMonth, unit, setUnit, search, setSearch,
    workMode, setWorkMode, outputScope: effectiveOutputScope, setOutputScope, tvMode, setTvMode, exporting,
    saved, loading, error, reload, finished, monthly,
    gates, gate, setSelectedGate, gateRows, dayPlanLots, savedPlanLots, scheduledDates, queue, visible,
    allocations, monthAllocations, finishedRows,
    changeCategory, changeView, countText, refresh, exportPlan,
    hasUnsavedChanges, saving, currentOrder, hasSavedCurrentOrder, isCurrentScopeReset, canResetOrder,
    pendingDiff, historyRefreshToken,
    moveLot, stageMoveLot, stageReorderById, confirmReorder, undoOrder, resetCurrentOrder, saveOrder,
  };
}
