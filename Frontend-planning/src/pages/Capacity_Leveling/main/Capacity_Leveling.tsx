import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Info, RefreshCw } from "lucide-react";

import "../../Planning_Summary_Gate/gateTheme.css";
import type {
  ProcessCategory,
  ViewMode,
  Granularity,
  PlanMode,
  LotItem,
  LevelingData,
} from "../types";
import {
  buildGrid,
  calculateKpis,
  computeMovePreview,
  isMoved,
  matchesCategory,
  occupancyWindow,
  plannedDateIndex,
  toLotItem,
} from "../utils/levelingCalculations";
import { fetchLevelingData, savePlan, toApiFailure, type ApiFailure } from "../hooks/api";

import { LevelingHeader } from "../components/LevelingHeader";
import { GateLoadGrid } from "../components/GateLoadGrid";
import { ReleaseBoard } from "../components/ReleaseBoard";
import { LotDetailSidePanel } from "../components/LotDetailSidePanel";
import { ConfirmMoveModal } from "../components/ConfirmMoveModal";
import { CapacityModal } from "../components/CapacityModal";
import { SavePlanModal } from "../components/SavePlanModal";
import { useAuth } from "@/context/AuthContext";
import {
  groupsForCategory,
  savePlanForGroups,
} from "../../Planning_In_Gate/planStore";

/** Days shown from today, inclusive. */
const RANGE_DAYS = 28;

const Capacity_Leveling: React.FC = () => {
  const navigate = useNavigate();
  const { user, requireAdmin } = useAuth();
  const [category, setCategory] = useState<ProcessCategory>("EFPC_GEN");
  const [planMode, setPlanMode] = useState<PlanMode>("planned");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [granularity, setGranularity] = useState<Granularity>("days");

  const [data, setData] = useState<LevelingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [lots, setLots] = useState<LotItem[]>([]);
  const [saving, setSaving] = useState(false);
  // Unsaved moves survive a reload (for example after capacity settings change).
  const draftRef = useRef(new Map<string, string>());
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
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    lots: LotItem[];
    targetDate: string;
  } | null>(null);

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const start = dayjs().format("YYYY-MM-DD");
      const stop = dayjs().add(RANGE_DAYS - 1, "day").format("YYYY-MM-DD");
      const next = await fetchLevelingData(start, stop, controller.signal);
      const draft = draftRef.current;
      setData(next);
      setLots(next.cards.map(toLotItem).map((lot) => {
        const draftDate = draft.get(lot.id);
        return draftDate && draftDate >= next.today ? { ...lot, plannedDate: draftDate } : lot;
      }));
      setFailure(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure(toApiFailure(error));
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => requestRef.current?.abort();
  }, [load]);

  useEffect(() => {
    draftRef.current = new Map(
      lots.filter((lot) => lot.plannedDate !== lot.savedDate).map((lot) => [lot.id, lot.plannedDate])
    );
  }, [lots]);

  const today = data?.today ?? dayjs().format("YYYY-MM-DD");
  const gates = useMemo(() => data?.gates ?? [], [data]);

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

  // Planned occupancy follows each draft release, preserving the gate's master duration.
  // Capacity is shared by all process groups on the gate.
  const grid = useMemo(() => (data ? buildGrid(data, lots) : []), [data, lots]);
  // Required occupancy follows the source release dates.
  const requiredGrid = useMemo(() => (data ? buildGrid(data, lots, true) : []), [data, lots]);
  const plannedIndex = useMemo(() => plannedDateIndex(lots, data ?? undefined), [lots, data]);

  const rangeDates = useMemo(() => new Set(grid.map((day) => day.date)), [grid]);
  const gateLots = useMemo(
    () => lots.filter((lot) => lot.gate === boardGate && matchesCategory(lot, category)),
    [lots, boardGate, category]
  );
  const boardLots = useMemo(
    () => gateLots.filter((lot) => rangeDates.has(lot.plannedDate)),
    [gateLots, rangeDates]
  );
  const selectedLot = useMemo(
    () => lots.find((lot) => lot.id === selectedLotId) ?? null,
    [lots, selectedLotId]
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

  const displayGrid = useMemo(() => {
    if (data && activeMovingLots.length > 0 && activePreviewTargetDate) {
      return computeMovePreview(data, grid, lots, activeMovingLots, activePreviewTargetDate).previewGrid;
    }
    return grid;
  }, [data, activeMovingLots, activePreviewTargetDate, grid, lots]);

  const kpis = useMemo(() => calculateKpis(grid, requiredGrid, lots, data ?? undefined), [grid, requiredGrid, lots, data]);
  const isDraftModified = useMemo(() => lots.some((lot) => lot.plannedDate !== lot.savedDate), [lots]);
  const sourceChangedCount = useMemo(() => lots.filter((lot) => lot.sourceChanged).length, [lots]);

  // A card can only land on a day from today on which its gate is open.
  const isValidMoveTarget = useCallback(
    (gate: string, targetDate: string) => {
      const day = data?.capacity[gate]?.[targetDate];
      return Boolean(day && !day.off && targetDate >= today);
    },
    [data, today]
  );

  // Stage the whole group without changing dates until the confirmation succeeds.
  const handleStageMoveLots = useCallback(
    (lotsToStage: LotItem[], targetDate: string) => {
      setDraggedLot(null);
      setHoverTargetDate(null);
      const ids = new Set(lotsToStage.map((lot) => lot.id));
      const currentLots = lots.filter((lot) => ids.has(lot.id));
      if (currentLots.length !== ids.size || new Set(currentLots.map((lot) => lot.gate)).size > 1 ||
        currentLots.some((lot) => !isValidMoveTarget(lot.gate, targetDate) || !data || !occupancyWindow(data, lot, targetDate))) {
        toast.error("Choose an open day from today with a complete planning window. Check gate lead time and normal shift minutes.");
        return;
      }
      const changedLots = currentLots.filter((lot) => lot.plannedDate !== targetDate);
      if (changedLots.length === 0) return;
      setSelectedLotId(null);
      setPendingMove({ lots: changedLots, targetDate });
    },
    [lots, isValidMoveTarget, data]
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
      // Highlight the exact same day column in Release Board
      setFocusedBoardDate(dateStr);
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
      const ids = new Set(lotsToMove.map((lot) => lot.id));
      const stagedDates = new Map(lotsToMove.map((lot) => [lot.id, lot.plannedDate]));
      const currentLots = lots.filter((lot) => ids.has(lot.id));
      if (currentLots.length !== ids.size || currentLots.some((lot) =>
        lot.plannedDate !== stagedDates.get(lot.id) || !isValidMoveTarget(lot.gate, targetDate) || !data || !occupancyWindow(data, lot, targetDate))) {
        toast.error("The selected cards or target date are no longer available.");
        return;
      }
      const moveTimestamp = Date.now();
      const changedAt = dayjs().format("DD/MM/YYYY HH:mm");
      const changedBy = `${user?.full_name || user?.username || "Planner"} · Draft`;
      setLots((prevLots) => prevLots.map((lot) => {
        if (!ids.has(lot.id) || lot.plannedDate === targetDate) return lot;
        const shiftDays = dayjs(targetDate).diff(dayjs(lot.plannedDate), "day");
        return {
          ...lot,
          plannedDate: targetDate,
          moveHistory: [{
            id: `mh-${moveTimestamp}-${lot.id}`,
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
        `${currentLots.length} card(s) moved to ${dayjs(targetDate).format("DD/MM/YYYY")} at ${currentLots[0].gate}`,
        { id: "move-lots", duration: 2500 }
      );
    },
    [lots, isValidMoveTarget, user, data]
  );

  const handleConfirmSave = useCallback(
    async (reason: string) => {
      if (!data || saving) return;
      await requireAdmin(async () => {
        setSaving(true);
        try {
          // Only moved cards are stored; unmoved cards keep following Summary Gate.
          const moves = lots.filter(isMoved).map((lot) => ({
            workKey: lot.workKey, gate: lot.gate, plannedDate: lot.plannedDate,
          }));
          const { plan, movedCount } = await savePlan(data.plan?.version ?? 0, moves, reason);
          draftRef.current = new Map();
          const groups = groupsForCategory(category);
          savePlanForGroups(groups, {
            version: plan.version,
            savedAt: new Date().toISOString(),
            savedBy: user?.full_name || user?.username || "Planner",
            reason: reason || undefined,
            sourceCategory: category,
          });
          setSaveModalOpen(false);
          toast.success(`Plan v${plan.version} saved with ${movedCount} moved card(s).`, { duration: 3500 });
          navigate(`/planning/planning_in_gate?cat=${category}`);
        } catch (error) {
          const failed = toApiFailure(error);
          toast.error(failed.message, { duration: 6000 });
          // Another planner saved first, or Summary Gate changed: show the latest data, keep the draft.
          if (failed.code === "PLAN_VERSION_CONFLICT" || failed.code === "WORK_NOT_FOUND") {
            setSaveModalOpen(false);
            void load();
          }
        } finally {
          setSaving(false);
        }
      });
    },
    [data, saving, requireAdmin, lots, category, user, navigate, load]
  );

  const dateRangeText = grid.length
    ? `${dayjs(grid[0].date).format("DD/MM")} - ${dayjs(grid[grid.length - 1].date).format("DD/MM/YYYY")}`
    : "-";

  return (
    <div className="planning-summary-gate flex flex-col gap-3 w-full">
      {/* 1. Header Bar matching GateFilterBar */}
      <LevelingHeader
        category={category}
        onCategoryChange={(next) => {
          setCategory(next);
          setSelectedLotIds(new Set());
        }}
        dateRangeText={dateRangeText}
        onOpenCapacityModal={() => {
          setSelectedLotId(null);
          setCapacityModalOpen(true);
        }}
        onReload={() => void load()}
        isLoading={loading}
        onSavePlan={() => {
          setSelectedLotId(null);
          setSaveModalOpen(true);
        }}
        canSave={Boolean(data) && !loading && kpis.missingPlanningCards === 0}
        planVersion={data?.plan?.version ?? 0}
        planSavedAt={data?.plan?.savedAt ?? null}
        isDraftModified={isDraftModified}
      />

      {failure && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0 text-rose-600" />
            <span>
              {failure.message}
              {data ? " Showing the last loaded data." : ""}
            </span>
          </div>
          <button type="button" onClick={() => void load()}
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
          {/* What the numbers mean and what is missing from them */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-base-300 bg-base-100 px-4 py-2.5 text-xs text-base-content/70">
            <span className="inline-flex items-center gap-1.5">
              <Info size={13} className="text-primary" />
              Max Target: 1 lot reserves 1 machine throughout its gate window, including closed dates. OT adds capacity only.
            </span>
            {kpis.unsetCapacityGates.length > 0 && (
              <span className="font-semibold text-amber-700">
                MC not set: {kpis.unsetCapacityGates.join(", ")}
              </span>
            )}
            {kpis.missingPlanningCards > 0 && (
              <span className="font-semibold text-amber-700"
                title="A positive gate lead time (up to 366 planning days), normal shift minutes and a complete planning calendar are required. Resolve these before saving.">
                {kpis.missingPlanningCards.toLocaleString()} card(s) need planning data; saving is disabled
              </span>
            )}
            {sourceChangedCount > 0 && (
              <span className="font-semibold text-amber-700"
                title="Must-out changed in Summary Gate after these cards were moved and saved.">
                {sourceChangedCount} moved card(s) have a changed must-out
              </span>
            )}
            {data.orphanMoves.length > 0 && (
              <span className="font-semibold text-amber-700"
                title={data.orphanMoves.slice(0, 12).map((move) =>
                  `${move.lotNo || move.prdName || move.workKey} @ ${move.gate} → ${dayjs(move.plannedDate).format("DD/MM")}`).join("\n")}>
                {data.orphanMoves.length} saved move(s) no longer match any work and will be dropped on the next save
              </span>
            )}
            {data.undatedCount > 0 && (
              <span className="text-base-content/55">
                {data.undatedCount} row(s) without a must-out date are not shown
              </span>
            )}
            {data.duplicateWorkCount > 0 && (
              <span className="font-semibold text-amber-700">{data.duplicateWorkCount} duplicate work row(s) counted once</span>
            )}
            {data.legacyPlanAvailable && (
              <span className="text-base-content/65">An earlier UPH plan is retained. This Max Target plan starts from Summary Gate.</span>
            )}
          </div>

          {/* 2. Gate Load Grid matching GateMatrixTable (with inline KPI badges) */}
          <GateLoadGrid
            gates={gates}
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

          {/* 3. Release Board / List — Planned mode only; Required mode is a read-only comparison */}
          {planMode === "planned" && (
            <div className="w-full min-w-0">
              <ReleaseBoard
                gates={gates}
                boardGate={boardGate}
                onBoardGateChange={(gate) => {
                  setBoardGate(gate);
                  setSelectedLotIds(new Set());
                }}
                lots={boardLots}
                data={data}
                beyondRangeCount={gateLots.length - boardLots.length}
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
            data={data}
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
          <ConfirmMoveModal
            isOpen={Boolean(pendingMove)}
            data={data}
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
          />
        </>
      )}

      {/* Capacity settings (usable even when work data could not be loaded) */}
      <CapacityModal
        isOpen={capacityModalOpen}
        onClose={() => setCapacityModalOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
};

export default Capacity_Leveling;
