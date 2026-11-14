import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { AlertTriangle, RefreshCw } from "lucide-react";

import "../../Planning_Summary_Gate/gateTheme.css";
import type {
  ProcessCategory,
  ViewMode,
  Granularity,
  PlanMode,
  LotItem,
  LevelingData,
  MoveHistoryEntry,
} from "../types";
import {
  buildGrid,
  buildBoardLots,
  expandBoardLots,
  lotKind,
  moveWarning,
  calculateKpis,
  computeMovePreview,
  isMoved,
  occupancyWindow,
  plannedDateIndex,
  toLotItem,
  requiredLots,
} from "../utils/levelingCalculations";
import { allocateBoardShifts } from "../utils/boardShiftAllocation";
import { applyBoardCardOrder, readBoardCardOrder, reorderBoardCards, serializeBoardCardOrder, type BoardCardOrder } from "../utils/boardCardOrder";
import { appendMoveHistory, mergeMoveHistory, reorderMoveHistory } from "../utils/moveHistory";
import { fetchLevelingData, savePlan, toApiFailure, type ApiFailure } from "../hooks/api";

import { LevelingHeader } from "../components/LevelingHeader";
import { GateLoadGrid } from "../components/GateLoadGrid";
import { ReleaseBoard } from "../components/ReleaseBoard";
import { LotDetailSidePanel } from "../components/LotDetailSidePanel";
import { ConfirmMoveModal } from "../components/ConfirmMoveModal";
import { ConfirmReorderModal } from "../components/ConfirmReorderModal";
import { CapacityModal } from "../components/CapacityModal";
import { SavePlanModal } from "../components/SavePlanModal";
import { ResetRequiredModal } from "../components/ResetRequiredModal";
import { PlanHistoryModal } from "../components/PlanHistoryModal";
import { useAuth } from "@/context/AuthContext";
import { useEditingPresence } from "../hooks/useEditingPresence";
import { EditingPresence } from "../components/EditingPresence";
import { uniqueScopes, type EditingScope } from "../utils/editingPresence";

/** Days shown from today, inclusive. */
const RANGE_DAYS = 28;

interface CapacityLevelingProps {
  snapshot?: LevelingData;
  onExitPreview?: () => void;
  onViewSnapshot?: (snapshot: LevelingData) => void;
  activeVersion?: number;
}

const Capacity_Leveling: React.FC<CapacityLevelingProps> = ({ snapshot, onExitPreview, onViewSnapshot, activeVersion }) => {
  const readOnly = Boolean(snapshot);
  const [preview, setPreview] = useState<LevelingData | null>(null);
  const { user, requirePlanner } = useAuth();
  const [category, setCategory] = useState<ProcessCategory>("EFPC_GEN");
  const [planMode, setPlanMode] = useState<PlanMode>("planned");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [granularity, setGranularity] = useState<Granularity>("days");

  const [data, setData] = useState<LevelingData | null>(snapshot ?? null);
  const [loading, setLoading] = useState(!snapshot);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [lots, setLots] = useState<LotItem[]>(() => snapshot?.cards.map(toLotItem) ?? []);
  const [boardCardOrder, setBoardCardOrder] = useState<BoardCardOrder>(new Map());
  const [saving, setSaving] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [requiredReset, setRequiredReset] = useState(false);
  const requiredResetRef = useRef(false);
  // Unsaved moves survive a reload (for example after capacity settings change).
  const draftRef = useRef(new Map<string, string>());
  const draftHistoryRef = useRef(new Map<string, MoveHistoryEntry[]>());
  const moveSequenceRef = useRef(0);
  const requestRef = useRef<AbortController | null>(null);

  const [boardGate, setBoardGate] = useState<string>("FVAC");
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [selectedLotIds, setSelectedLotIds] = useState<Set<string>>(new Set());

  const [draggedLot, setDraggedLot] = useState<LotItem | null>(null);
  const [hoverTargetDate, setHoverTargetDate] = useState<string | null>(null);

  const [selectedGridGate, setSelectedGridGate] = useState<string | null>(null);
  const [selectedGridDate, setSelectedGridDate] = useState<string | null>(null);
  const [focusedBoardDate, setFocusedBoardDate] = useState<string | null>(null);

  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [capacityEditingScopes, setCapacityEditingScopes] = useState<EditingScope[]>([]);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    lots: LotItem[];
    targetDate: string;
  } | null>(null);
  const [pendingReorder, setPendingReorder] = useState<{
    movingIds: string[];
    targetId: string;
    position: "before" | "after";
    before: LotItem[];
    after: LotItem[];
  } | null>(null);
  const handleCancelReorder = useCallback(() => setPendingReorder(null), []);

  const load = useCallback(async (refresh = false, mode: "keep" | "reset" | "saved" = "keep") => {
    if (snapshot) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setPendingReorder(null);
    setLoading(true);
    try {
      const start = dayjs().format("YYYY-MM-DD");
      const stop = dayjs().add(RANGE_DAYS - 1, "day").format("YYYY-MM-DD");
      const reset = mode === "reset" || (mode === "keep" && requiredResetRef.current);
      const next = await fetchLevelingData(start, stop, controller.signal, refresh, reset);
      if (controller.signal.aborted || requestRef.current !== controller) return false;
      const draft = mode === "keep" ? draftRef.current : new Map<string, string>();
      const sourceLots = reset ? requiredLots(next.cards) : next.cards.map(toLotItem);
      setData(next);
      setLots(sourceLots.map((lot) => {
        const draftDate = draft.get(lot.id);
        const restored = draftDate && draftDate >= next.today ? { ...lot, plannedDate: draftDate } : lot;
        return { ...restored, moveHistory: mergeMoveHistory(mode === "keep" ? draftHistoryRef.current.get(lot.id) : undefined, lot.moveHistory) };
      }));
      if (mode !== "keep") {
        requiredResetRef.current = reset;
        setRequiredReset(reset);
        draftRef.current = new Map();
        draftHistoryRef.current = new Map();
        setBoardCardOrder(new Map());
      }
      if (mode === "reset") {
        setSelectedLotId(null);
        setSelectedLotIds(new Set());
        setPendingMove(null);
        setDraggedLot(null);
        setHoverTargetDate(null);
        setSelectedGridGate(null);
        setSelectedGridDate(null);
        setFocusedBoardDate(null);
        setPlanMode("planned");
      }
      setFailure(null);
      return true;
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure(toApiFailure(error));
      return false;
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [snapshot]);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    draftRef.current = new Map(
      lots.filter((lot) => lot.plannedDate !== (requiredReset ? lot.baseDate : lot.savedDate)).map((lot) => [lot.id, lot.plannedDate])
    );
    draftHistoryRef.current = new Map(lots.flatMap((lot) => {
      const entries = lot.moveHistory?.filter((entry) => !entry.planVersion) ?? [];
      return entries.length ? [[lot.id, entries] as const] : [];
    }));
  }, [lots, requiredReset]);

  const today = data?.today ?? dayjs().format("YYYY-MM-DD");
  const gates = useMemo(() => data?.gates ?? [], [data]);
  const visibleGridGates = useMemo(
    () => category === "ALL" ? gates : gates.filter((gate) => gate.group === (category === "SMT" ? "SMT" : "FPC")),
    [gates, category]
  );

  // Follow the process group: SMT works on the SMT gates, the FPC groups on the FPC gates.
  useEffect(() => {
    if (!gates.length) return;
    const wanted = category === "SMT" ? "SMT" : "FPC";
    setBoardGate((current) => {
      const info = gates.find((gate) => gate.gate === current);
      if (info && (category === "ALL" || info.group === wanted)) return current;
      return (gates.find((gate) => gate.group === wanted) ?? gates[0]).gate;
    });
  }, [category, gates]);

  // Count arrivals using Summary Gate's process filter and distinct physical-lot rules.
  const grid = useMemo(() => (data ? buildGrid(data, lots, false, category) : []), [data, lots, category]);
  const requiredGrid = useMemo(() => (data ? buildGrid(data, lots, true, category) : []), [data, lots, category]);
  const plannedIndex = useMemo(() => plannedDateIndex(lots, data ?? undefined), [lots, data]);

  const rangeDates = useMemo(() => new Set(grid.map((day) => day.date)), [grid]);
  const savedBoardCardOrder = useMemo(() => readBoardCardOrder(data?.boardCardOrder), [data]);
  const effectiveBoardCardOrder = useMemo(
    () => new Map([...(requiredReset ? [] : savedBoardCardOrder), ...boardCardOrder]), [savedBoardCardOrder, boardCardOrder, requiredReset]
  );
  const allBoardLots = useMemo(
    () => data ? applyBoardCardOrder(buildBoardLots(data, lots, category), effectiveBoardCardOrder) : [],
    [data, lots, category, effectiveBoardCardOrder]
  );
  const gateLots = useMemo(
    () => allBoardLots.filter((lot) => lot.gate === boardGate && !lot.passedGate),
    [allBoardLots, boardGate]
  );
  const boardLots = useMemo(
    () => gateLots.filter((lot) => rangeDates.has(lot.plannedDate)),
    [gateLots, rangeDates]
  );
  const selectedLot = useMemo(
    () => allBoardLots.find((lot) => lot.id === selectedLotId) ?? null,
    [allBoardLots, selectedLotId]
  );

  const activeMovingLots = useMemo(() => {
    if (draggedLot) {
      return selectedLotIds.has(draggedLot.id)
        ? boardLots.filter((lot) => selectedLotIds.has(lot.id))
        : [draggedLot];
    }
    return pendingMove?.lots || [];
  }, [draggedLot, selectedLotIds, boardLots, pendingMove]);
  const activePreviewTargetDate = hoverTargetDate || pendingMove?.targetDate || null;

  const shiftAllocations = useMemo(() => {
    if (!data) return new Map();
    let projectedBoard = allBoardLots;
    if (activeMovingLots.length && activePreviewTargetDate) {
      const ids = new Set(activeMovingLots.flatMap((lot) => lot.sourceIds || [lot.id]));
      const projectedLots = lots.map((lot) => ids.has(lot.id) ? { ...lot, plannedDate: activePreviewTargetDate } : lot);
      // Rebuild to merge physical lots and apply priority at the destination before allocating shifts.
      projectedBoard = applyBoardCardOrder(buildBoardLots(data, projectedLots, category), effectiveBoardCardOrder);
    }
    return allocateBoardShifts(data, projectedBoard, { excludePassed: true });
  }, [data, allBoardLots, lots, category, effectiveBoardCardOrder, activeMovingLots, activePreviewTargetDate]);

  const displayGrid = useMemo(() => {
    if (data && activeMovingLots.length > 0 && activePreviewTargetDate) {
      return computeMovePreview(data, grid, lots, activeMovingLots, activePreviewTargetDate, category).previewGrid;
    }
    return grid;
  }, [data, activeMovingLots, activePreviewTargetDate, grid, lots, category]);

  const kpis = useMemo(() => calculateKpis(grid, requiredGrid, lots, data ?? undefined), [grid, requiredGrid, lots, data]);
  const isDraftModified = useMemo(() => {
    if (requiredReset) return true;
    if (lots.some((lot) => lot.plannedDate !== lot.savedDate)) return true;
    if (!data || boardCardOrder.size === 0) return false;
    const board = buildBoardLots(data, lots);
    const saved = applyBoardCardOrder(board, savedBoardCardOrder);
    return applyBoardCardOrder(board, effectiveBoardCardOrder).some((lot, index) => lot.id !== saved[index].id);
  }, [lots, data, boardCardOrder, savedBoardCardOrder, effectiveBoardCardOrder, requiredReset]);

  const editingScopes = useMemo(() => {
    const scopes: EditingScope[] = [...capacityEditingScopes];
    const planScope = (gate: string, date: string) => scopes.push({ kind: "plan", gate, date });
    for (const lot of lots) if (lot.plannedDate !== lot.savedDate) {
      planScope(lot.gate, lot.savedDate);
      planScope(lot.gate, lot.plannedDate);
    }
    if (isDraftModified) for (const key of boardCardOrder.keys()) {
      const [gate, date] = JSON.parse(key) as [string, string];
      planScope(gate, date);
    }
    for (const lot of pendingMove?.lots ?? []) {
      planScope(lot.gate, lot.plannedDate);
      planScope(lot.gate, pendingMove!.targetDate);
    }
    for (const lot of pendingReorder?.before ?? []) planScope(lot.gate, lot.plannedDate);
    if (draggedLot) {
      planScope(draggedLot.gate, draggedLot.plannedDate);
      if (hoverTargetDate) planScope(draggedLot.gate, hoverTargetDate);
    }
    return uniqueScopes(scopes);
  }, [capacityEditingScopes, lots, isDraftModified, boardCardOrder, pendingMove, pendingReorder, draggedLot, hoverTargetDate]);
  const presence = useEditingPresence(editingScopes, !readOnly && !preview);

  // A card can only land on a day from today on which its gate is open.
  const isValidMoveTarget = useCallback(
    (gate: string, targetDate: string) => {
      const day = data?.capacity[gate]?.[targetDate];
      return Boolean(day && !day.off && targetDate >= today);
    },
    [data, today]
  );

  const handleStageReorder = useCallback((movingIds: string[], targetId: string, position: "before" | "after") => {
    if (saving || loading || readOnly || !data) return;
    const board = buildBoardLots(data, lots);
    const next = reorderBoardCards(board, effectiveBoardCardOrder, movingIds, targetId, position);
    if (next === effectiveBoardCardOrder) return;
    const target = board.find((lot) => lot.id === targetId)!;
    const sameDay = (lot: LotItem) => lot.gate === target.gate && lot.plannedDate === target.plannedDate;
    setDraggedLot(null);
    setHoverTargetDate(null);
    setSelectedLotId(null);
    setPendingReorder({ movingIds, targetId, position,
      before: applyBoardCardOrder(board, effectiveBoardCardOrder).filter(sameDay),
      after: applyBoardCardOrder(board, next).filter(sameDay) });
  }, [saving, loading, readOnly, data, lots, effectiveBoardCardOrder]);

  const handleConfirmReorder = useCallback(() => {
    if (saving || loading || readOnly || !data || !pendingReorder) return;
    const { movingIds, targetId, position, before } = pendingReorder;
    const board = buildBoardLots(data, lots);
    const ordered = applyBoardCardOrder(board, effectiveBoardCardOrder);
    const currentDay = ordered.filter((lot) => lot.gate === before[0].gate && lot.plannedDate === before[0].plannedDate);
    // Do not apply a confirmation to cards whose order or merged source allocations have changed.
    if (currentDay.length !== before.length || currentDay.some((lot, index) =>
      lot.id !== before[index].id || JSON.stringify(lot.sourceIds) !== JSON.stringify(before[index].sourceIds))) {
      setPendingReorder(null);
      toast.error("The selected cards or their order have changed. Please try again.");
      return;
    }
    const next = reorderBoardCards(board, effectiveBoardCardOrder, movingIds, targetId, position);
    if (next === effectiveBoardCardOrder) {
      setPendingReorder(null);
      return;
    }
    const timestamp = Date.now();
    const history = reorderMoveHistory(ordered, applyBoardCardOrder(board, next), movingIds,
      { id: `mh-order-${timestamp}-${++moveSequenceRef.current}`, changedAt: new Date(timestamp).toISOString(),
        changedBy: `${user?.full_name || user?.username || "Planner"} · Draft` });
    setBoardCardOrder((current) => new Map([...current,
      ...[...next].filter(([key, ids]) => ids !== effectiveBoardCardOrder.get(key))]));
    setLots((current) => appendMoveHistory(current, history));
    setPendingReorder(null);
  }, [saving, loading, readOnly, data, lots, effectiveBoardCardOrder, pendingReorder, user]);

  // Stage the whole group without changing dates until the confirmation succeeds.
  const handleStageMoveLots = useCallback(
    (lotsToStage: LotItem[], targetDate: string) => {
      if (readOnly) return;
      setDraggedLot(null);
      setHoverTargetDate(null);
      const ids = new Set(lotsToStage.flatMap((lot) => lot.sourceIds || [lot.id]));
      const currentLots = expandBoardLots(lots, lotsToStage);
      if (currentLots.length !== ids.size || new Set(currentLots.map((lot) => lot.gate)).size > 1 ||
        currentLots.some((lot) => lotKind(lot) === "unidentified" || lot.loadMin === null || !isValidMoveTarget(lot.gate, targetDate) || !data || !occupancyWindow(data, lot, targetDate) || moveWarning(lot, targetDate, plannedIndex, data) === "order")) {
        toast.error("Choose an open arrival day with valid lead time and normal minutes, without overlapping the previous or next gate.");
        return;
      }
      const changedLots = lotsToStage.filter((lot) => lot.plannedDate !== targetDate);
      if (changedLots.length === 0) return;
      setSelectedLotId(null);
      setPendingMove({ lots: changedLots, targetDate });
    },
    [lots, isValidMoveTarget, data, plannedIndex, readOnly]
  );

  const handleStageMoveLot = useCallback((lot: LotItem, targetDate: string) => {
    handleStageMoveLots([lot], targetDate);
  }, [handleStageMoveLots]);

  const handleSelectGridCell = useCallback(
    (gateId: string | null, dateStr: string | null) => {
      setSelectedGridGate(gateId);
      setSelectedGridDate(dateStr);
      // The board shows one gate at a time; picking a gate in the grid switches it.
      if (gateId) {
        setBoardGate(gateId);
        setSelectedLotIds(new Set());
      }
      // Grid and board use the same arrival date and process filter.
      setFocusedBoardDate(dateStr);
      setViewMode("board");
      setGranularity("days");
    },
    []
  );

  // Clear Gate Load by Day focus when clicking any blank space or pressing Escape
  useEffect(() => {
    if (!selectedGridGate && !selectedGridDate && !focusedBoardDate) return;

    const handleDocumentPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-grid-focus-keep]")) return;
      if (target.closest("button, a, input, select, textarea, [role='dialog']")) return;

      setSelectedGridGate(null);
      setSelectedGridDate(null);
      setFocusedBoardDate(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedGridGate(null);
        setSelectedGridDate(null);
        setFocusedBoardDate(null);
      }
    };

    document.addEventListener("mousedown", handleDocumentPointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedGridGate, selectedGridDate, focusedBoardDate]);

  const handleMoveLots = useCallback(
    (lotsToMove: LotItem[], targetDate: string) => {
      if (readOnly) return;
      const ids = new Set(lotsToMove.flatMap((lot) => lot.sourceIds || [lot.id]));
      const stagedDates = new Map(lotsToMove.flatMap((lot) => (lot.sourceIds || [lot.id]).map((id) => [id, lot.plannedDate] as const)));
      const currentLots = expandBoardLots(lots, lotsToMove);
      if (currentLots.length !== ids.size || currentLots.some((lot) =>
        lot.plannedDate !== stagedDates.get(lot.id) || !isValidMoveTarget(lot.gate, targetDate) || !data || !occupancyWindow(data, lot, targetDate) || moveWarning(lot, targetDate, plannedIndex, data) === "order")) {
        toast.error("The selected cards or target date are no longer available.");
        return;
      }
      const moveTimestamp = Date.now();
      const eventId = `mh-${moveTimestamp}-${++moveSequenceRef.current}`;
      const boardIds = new Map(lotsToMove.flatMap((lot) => (lot.sourceIds ?? [lot.id]).map((id) => [id, lot.id] as const)));
      const changedAt = new Date(moveTimestamp).toISOString();
      const changedBy = `${user?.full_name || user?.username || "Planner"} · Draft`;
      setLots((prevLots) => prevLots.map((lot) => {
        if (!ids.has(lot.id) || lot.plannedDate === targetDate) return lot;
        const shiftDays = dayjs(targetDate).diff(dayjs(lot.plannedDate), "day");
        return {
          ...lot,
          plannedDate: targetDate,
          moveHistory: [{
            id: `${eventId}-${boardIds.get(lot.id) ?? lot.id}`,
            kind: "date" as const,
            fromDate: lot.plannedDate,
            toDate: targetDate,
            changedAt,
            changedBy,
            note: shiftDays < 0 ? `Pulled ${Math.abs(shiftDays)}d earlier` : `Pushed +${shiftDays}d later`,
          }, ...(lot.moveHistory || [])],
        };
      }));
      setSelectedLotIds(new Set());
      setPendingMove(null);
      toast.success(
        `${lotsToMove.length} arrival card(s) moved to ${dayjs(targetDate).format("DD/MM/YYYY")} at ${currentLots[0].gate}`,
        { id: "move-lots", duration: 2500 }
      );
    },
    [lots, isValidMoveTarget, user, data, plannedIndex, readOnly]
  );

  const handleConfirmSave = useCallback(
    async (reason: string) => {
      if (!data || saving || readOnly) return;
      await requirePlanner(async () => {
        setSaving(true);
        try {
          // Only moved cards are stored; unmoved cards keep following Summary Gate.
          const moves = lots.filter((lot) => isMoved(lot) && lot.plannedDate >= today).map((lot) => ({
            workKey: lot.workKey, gate: lot.gate, plannedDate: lot.plannedDate,
          }));
          const order = serializeBoardCardOrder(buildBoardLots(data, lots), effectiveBoardCardOrder, today);
          const { plan, movedCount, orderedGroupCount } = await savePlan(data.plan?.version ?? 0, moves, reason, order, requiredReset);
          draftRef.current = new Map();
          draftHistoryRef.current = new Map();
          setSaveModalOpen(false);
          toast.success(`Plan v${plan.version} saved: ${movedCount} moved card(s), ${orderedGroupCount} ordered gate/day group(s).`, { duration: 3500 });
          await load(true, "saved");
          setBoardCardOrder(new Map());
        } catch (error) {
          const failed = toApiFailure(error);
          toast.error(failed.message, { duration: 6000 });
          // Another planner saved first, or Summary Gate changed: show the latest data, keep the draft.
          if (failed.code === "PLAN_VERSION_CONFLICT" || failed.code === "WORK_NOT_FOUND") {
            setSaveModalOpen(false);
            void load(true);
          }
        } finally {
          setSaving(false);
        }
      });
    },
    [data, saving, requirePlanner, lots, today, load, effectiveBoardCardOrder, readOnly]
  );

  const dateRangeText = grid.length
    ? `${dayjs(grid[0].date).format("DD/MM")} - ${dayjs(grid[grid.length - 1].date).format("DD/MM/YYYY")}`
    : "-";

  // Keep the live editor mounted, including its unsaved dates, order and history.
  // A separate editor instance displays only the immutable server snapshot.
  if (preview) return <Capacity_Leveling key={preview.plan?.planId} snapshot={preview}
    activeVersion={data?.plan?.version ?? 0} onExitPreview={() => setPreview(null)} onViewSnapshot={setPreview} />;

  return (
    <div className="planning-summary-gate flex flex-col gap-3 w-full">
      {readOnly && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <span>Viewing Plan v{data?.plan?.version} · Read-only · Current Plan v{activeVersion}</span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span>Saved Date Range</span>
          <input aria-label="History start date" type="date" className="input input-sm w-auto" value={data?.days[0]?.date ?? ""}
            min={snapshot?.days[0]?.date} max={data?.days.at(-1)?.date}
            onChange={(event) => {
              const start = event.target.value;
              const end = data?.days.at(-1)?.date;
              if (snapshot && end && start >= snapshot.days[0].date && start <= end)
                setData({ ...snapshot, days: snapshot.days.filter((day) => day.date >= start && day.date <= end) });
            }} />
          <span>to</span>
          <input aria-label="History end date" type="date" className="input input-sm w-auto" value={data?.days.at(-1)?.date ?? ""}
            min={data?.days[0]?.date} max={snapshot?.days.at(-1)?.date}
            onChange={(event) => {
              const end = event.target.value;
              const start = data?.days[0]?.date;
              if (snapshot && start && end >= start && end <= snapshot.days.at(-1)!.date)
                setData({ ...snapshot, days: snapshot.days.filter((day) => day.date >= start && day.date <= end) });
            }} />
        </div>
        <button type="button" onClick={onExitPreview} className="btn btn-sm rounded-lg">Back to Current Plan</button>
      </div>}
      {/* 1. Header Bar matching GateFilterBar */}
      <LevelingHeader
        readOnly={readOnly}
        category={category}
        onCategoryChange={(next) => {
          setCategory(next);
          setSelectedLotIds(new Set());
          setSelectedLotId(null);
          setPendingMove(null);
          setDraggedLot(null);
          setHoverTargetDate(null);
          setSelectedGridGate(null);
          setSelectedGridDate(null);
        }}
        dateRangeText={dateRangeText}
        editingPresence={!readOnly && <EditingPresence {...presence} scopes={editingScopes} username={user?.username} />}
        onOpenCapacityModal={() => {
          setSelectedLotId(null);
          setCapacityModalOpen(true);
        }}
        onReload={() => void load(true)}
        isLoading={loading || saving}
        canReset={!readOnly && Boolean(data) && !loading && !saving}
        onResetRequired={() => {
          if (readOnly || loading || saving) return;
          void requirePlanner(() => {
            setSelectedLotId(null);
            setFailure(null);
            setResetModalOpen(true);
          });
        }}
        onSavePlan={() => {
          setSelectedLotId(null);
          setSaveModalOpen(true);
        }}
        canSave={!readOnly && Boolean(data) && !loading && !saving && kpis.missingPlanningCards === 0}
        planVersion={data?.plan?.version ?? 0}
        planSavedAt={data?.plan?.savedAt ?? null}
        isDraftModified={isDraftModified}
        onOpenPlanHistory={() => {
          setSelectedLotId(null);
          setHistoryModalOpen(true);
        }}
      />

      {requiredReset && !readOnly && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Reset to Required · Draft not saved. All process groups and gates were reset to source arrivals and default card order.
        Review any further changes, then save a new plan version.
      </div>}
      {resetModalOpen && !readOnly && <ResetRequiredModal busy={loading} error={failure?.message}
        onCancel={() => setResetModalOpen(false)} onConfirm={() => {
          void load(true, "reset").then(success => {
            if (success) {
              setResetModalOpen(false);
              toast.success("Reset to Required. Review the draft and save a new plan version.");
            }
          });
        }} />}

      {failure && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            <span>
              {failure.message}
              {data ? " Showing the last loaded data." : ""}
            </span>
          </div>
          <button type="button" onClick={() => void load(true)}
            className="btn btn-xs h-8 rounded-lg border border-rose-300 bg-base-100 px-3 text-xs font-semibold text-rose-800">
            <RefreshCw size={13} />
            Try again
          </button>
        </div>
      )}

      {!data && loading && (
        <div className="rounded-2xl border border-base-300 bg-base-100 p-8 text-center text-sm text-base-content/60">
          Loading gate capacity and work from Summary Gate...
        </div>
      )}

      {data && (
        <>
          {/* 2. Gate Load Grid matching GateMatrixTable (with inline KPI badges) */}
          <GateLoadGrid
            gates={visibleGridGates}
            category={category}
            gridData={displayGrid}
            requiredGridData={requiredGrid}
            planMode={planMode}
            onPlanModeChange={(mode) => {
              setPlanMode(mode);
              if (mode === "required") {
                setSelectedLotId(null);
                setSelectedLotIds(new Set());
                setPendingMove(null);
                setDraggedLot(null);
                setHoverTargetDate(null);
              }
            }}
            kpis={kpis}
            selectedGate={selectedGridGate}
            boardGate={boardGate}
            selectedDate={selectedGridDate}
            onSelectCell={handleSelectGridCell}
          />

          {/* 3. Gate Arrival Board / List — Planned mode only; Required mode is a read-only comparison */}
          {planMode === "planned" && (
            <div className="w-full min-w-0">
              <ReleaseBoard
                readOnly={readOnly}
                gates={gates}
                boardGate={boardGate}
                onBoardGateChange={(gate) => {
                  setBoardGate(gate);
                  setSelectedLotIds(new Set());
                }}
                lots={boardLots}
                shiftAllocations={shiftAllocations}
                data={data}
                beyondRangeCount={gateLots.filter((lot) => lot.plannedDate > (grid[grid.length - 1]?.date ?? today)).length}
                pastArrivalCount={gateLots.filter((lot) => lot.plannedDate < (grid[0]?.date ?? today)).length}
                gridData={grid}
                today={today}
                plannedIndex={plannedIndex}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                granularity={granularity}
                onGranularityChange={setGranularity}
                selectedLot={selectedLot}
                onSelectLot={(lot) => setSelectedLotId((prev) => (prev === lot.id ? null : lot.id))}
                onMoveLot={handleStageMoveLot}
                selectedLotIds={selectedLotIds}
                onSelectionChange={(ids) => setSelectedLotIds(new Set(ids))}
                onMoveLots={handleStageMoveLots}
                onReorderLots={handleStageReorder}
                draggedLot={draggedLot}
                onDragStart={setDraggedLot}
                onDragEnd={() => setDraggedLot(null)}
                onHoverTargetDate={setHoverTargetDate}
                hoverTargetDate={hoverTargetDate}
                activeMovingLots={activeMovingLots}
                activePreviewTargetDate={activePreviewTargetDate}
                focusedDate={focusedBoardDate}
              />
            </div>
          )}

          {/* 4. Right Navigation Drawer (details of one card) */}
          <LotDetailSidePanel
            readOnly={readOnly}
            data={data}
            allLots={lots}
            category={category}
            lot={selectedLot}
            gridData={grid}
            capacity={data.capacity}
            today={today}
            plannedIndex={plannedIndex}
            planVersion={data.plan?.version ?? 0}
            onApply={handleStageMoveLot}
            onCancel={() => setSelectedLotId(null)}
            onOpenCapacityModal={() => {
              setSelectedLotId(null);
              setCapacityModalOpen(true);
            }}
            isDraggingCard={Boolean(draggedLot)}
          />

          {/* Confirm popup when a card is dropped on another date */}
          {pendingReorder && <ConfirmReorderModal
            before={pendingReorder.before}
            after={pendingReorder.after}
            movingIds={pendingReorder.movingIds}
            onConfirm={handleConfirmReorder}
            onCancel={handleCancelReorder}
          />}
          <ConfirmMoveModal
            isOpen={Boolean(pendingMove)}
            data={data}
            category={category}
            lots={pendingMove?.lots || []}
            allLots={lots}
            targetDate={pendingMove?.targetDate || null}
            gridData={grid}
            plannedIndex={plannedIndex}
            onConfirm={handleMoveLots}
            onCancel={() => setPendingMove(null)}
          />

          <SavePlanModal
            isOpen={saveModalOpen}
            onClose={() => setSaveModalOpen(false)}
            onConfirmSave={(reason) => void handleConfirmSave(reason)}
            nextVersion={(data.plan?.version ?? 0) + 1}
            isSaving={saving}
            kpis={kpis}
            resetToRequired={requiredReset}
          />
        </>
      )}

      {/* Capacity settings (usable even when work data could not be loaded) */}
      {historyModalOpen && <PlanHistoryModal onClose={() => setHistoryModalOpen(false)} onPreview={(next) => {
        if (saving || loading) return;
        setHistoryModalOpen(false);
        setSelectedLotId(null);
        setSelectedLotIds(new Set());
        setPendingMove(null);
        setDraggedLot(null);
        setHoverTargetDate(null);
        (onViewSnapshot ?? setPreview)(next);
      }} />}
      <CapacityModal
        isOpen={capacityModalOpen}
        onEditingChange={setCapacityEditingScopes}
        onClose={() => setCapacityModalOpen(false)}
        onSaved={() => void load(true)}
      />
    </div>
  );
};

export default Capacity_Leveling;
