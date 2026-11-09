import React, { useState, useMemo, useCallback, useEffect } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";

import "../../Planning_Summary_Gate/gateTheme.css";
import type {
  ProcessCategory,
  ViewMode,
  Granularity,
  PlanMode,
  LotItem,
  DayGateLoad,
} from "../types";
import { INITIAL_LOTS, BASELINE_GRID_DATA } from "../mock/levelingMockData";
import {
  recalculateGridLoads,
  calculateKpis,
  computeDragPreview,
} from "../utils/levelingCalculations";

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

const Capacity_Leveling: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState<ProcessCategory>("EFPC_GEN");
  const [frozenDays] = useState<number>(0);
  const [planVersion, setPlanVersion] = useState<number>(3);
  const [isDraftModified, setIsDraftModified] = useState<boolean>(true);
  const [planMode, setPlanMode] = useState<PlanMode>("planned");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [granularity, setGranularity] = useState<Granularity>("days");

  const [lots, setLots] = useState<LotItem[]>(INITIAL_LOTS);
  const [baseGrid] = useState<DayGateLoad[]>(BASELINE_GRID_DATA);

  // Start with no lot selected so Release Board spans 100% full width; opens as side popup when a lot is clicked
  const [selectedLot, setSelectedLot] = useState<LotItem | null>(null);
  const [previewDate, setPreviewDate] = useState<string>("2026-11-13");

  const [draggedLot, setDraggedLot] = useState<LotItem | null>(null);
  const [hoverTargetDate, setHoverTargetDate] = useState<string | null>(null);

  const [selectedGridGate, setSelectedGridGate] = useState<string | null>(null);
  const [selectedGridDate, setSelectedGridDate] = useState<string | null>(null);
  const [focusedBoardDate, setFocusedBoardDate] = useState<string | null>(null);

  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [pendingMove, setPendingMove] = useState<{
    lot: LotItem;
    targetDate: string;
  } | null>(null);

  const frozenUntilDate = useMemo(() => {
    if (frozenDays <= 0) return "2026-11-02";
    return dayjs("2026-11-03").add(frozenDays - 1, "day").format("YYYY-MM-DD");
  }, [frozenDays]);

  const gridWithCurrentLots = useMemo(() => {
    return recalculateGridLoads(
      baseGrid,
      lots,
      frozenUntilDate,
      planMode === "required"
    );
  }, [baseGrid, lots, frozenUntilDate, planMode]);

  const activeMovingLot = draggedLot || pendingMove?.lot || null;
  const activePreviewTargetDate =
    hoverTargetDate || pendingMove?.targetDate || null;

  const displayGrid = useMemo(() => {
    if (activeMovingLot && activePreviewTargetDate) {
      const preview = computeDragPreview(
        gridWithCurrentLots,
        activeMovingLot,
        activePreviewTargetDate
      );
      return preview.previewGrid;
    }
    return gridWithCurrentLots;
  }, [activeMovingLot, activePreviewTargetDate, gridWithCurrentLots]);

  const kpis = useMemo(() => {
    return calculateKpis(gridWithCurrentLots, lots, 5, 3);
  }, [gridWithCurrentLots, lots]);

  const movedLotsCount = useMemo(() => {
    return lots.filter(
      (l) => l.releaseDate !== l.initialReleaseDate || Boolean(l.wasDate)
    ).length;
  }, [lots]);

  const handleSelectLot = useCallback((lot: LotItem) => {
    setSelectedLot((prev) => (prev?.id === lot.id ? null : lot));
    setPreviewDate(lot.releaseDate);
  }, []);

  // Open separate ConfirmMoveModal popup when user drops a card onto a new day or picks a new date
  const handleStageMoveLot = useCallback(
    (lotToStage: LotItem, targetDate: string) => {
      setDraggedLot(null);
      setHoverTargetDate(null);
      if (targetDate === lotToStage.releaseDate) return;
      setSelectedLot(null);
      setPendingMove({ lot: lotToStage, targetDate });
    },
    []
  );

  const handleSelectGridCell = useCallback(
    (gateId: string | null, dateStr: string | null) => {
      setSelectedGridGate(gateId);
      setSelectedGridDate(dateStr);

      if (!dateStr) {
        setFocusedBoardDate(null);
        return;
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
      // Ignore clicks on GateLoadGrid interactive cells/headers/pill or interactive buttons/inputs
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

  const handleMoveLot = useCallback(
    (lotToMove: LotItem, targetDate: string) => {
      const shiftDays = dayjs(targetDate).diff(
        dayjs(lotToMove.releaseDate),
        "day"
      );
      const newEntry = {
        id: `mh-${Date.now()}`,
        fromDate: lotToMove.releaseDate,
        toDate: targetDate,
        changedAt: dayjs().format("DD/MM/YYYY HH:mm"),
        changedBy: `Planner · Draft v${planVersion}`,
        note:
          shiftDays < 0
            ? `Pulled ${Math.abs(shiftDays)}d earlier`
            : `Pushed +${shiftDays}d later`,
      };

      setLots((prevLots) =>
        prevLots.map((l) => {
          if (l.id === lotToMove.id) {
            const was =
              l.releaseDate !== targetDate
                ? dayjs(l.releaseDate).format("DD/MM")
                : l.wasDate;
            return {
              ...l,
              releaseDate: targetDate,
              wasDate: was,
              moveHistory: [newEntry, ...(l.moveHistory || [])],
            };
          }
          return l;
        })
      );
      setSelectedLot((prev) =>
        prev?.id === lotToMove.id
          ? {
              ...prev,
              releaseDate: targetDate,
              wasDate:
                prev.releaseDate !== targetDate
                  ? dayjs(prev.releaseDate).format("DD/MM")
                  : prev.wasDate,
              moveHistory: [newEntry, ...(prev.moveHistory || [])],
            }
          : prev
      );
      setPreviewDate(targetDate);
      setIsDraftModified(true);
      toast.success(
        `Lot ${lotToMove.id} moved to ${dayjs(targetDate).format("DD/MM/YYYY")}`,
        { id: `move-${lotToMove.id}`, duration: 2500 }
      );
    },
    [planVersion]
  );

  const handleAutoLevel = useCallback(() => {
    toast.loading("Running auto-level optimizer...", { id: "autolevel" });
    setTimeout(() => {
      setLots((prevLots) =>
        prevLots.map((lot) => {
          if (lot.id === "4500125") {
            return { ...lot, releaseDate: "2026-11-13", wasDate: "16/11" };
          }
          return lot;
        })
      );
      setPreviewDate("2026-11-13");
      setIsDraftModified(true);
      toast.success("Auto-level applied! Overloaded planning gates balanced.", {
        id: "autolevel",
        duration: 3000,
      });
    }, 450);
  }, []);

  const handleConfirmSave = useCallback(
    (reason: string) => {
      const nextVersion = planVersion + 1;
      const groups = groupsForCategory(category);
      // Send the plan to Planning In Gate (FPC and/or SMT)
      savePlanForGroups(groups, {
        version: nextVersion,
        savedAt: new Date().toISOString(),
        savedBy: user?.full_name || user?.username || "Planner",
        reason: reason || undefined,
        sourceCategory: category,
      });
      setPlanVersion(nextVersion);
      setIsDraftModified(false);
      setSaveModalOpen(false);
      toast.success(
        `Plan v${nextVersion} saved and sent to Planning In Gate (${groups.join(" + ")}).`,
        { duration: 3500 }
      );
      navigate(`/planning/planning_in_gate?cat=${category}`);
    },
    [planVersion, category, user, navigate]
  );

  return (
    <div className="planning-summary-gate flex flex-col gap-3 w-full">
      {/* 1. Header Bar matching GateFilterBar */}
      <LevelingHeader
        category={category}
        onCategoryChange={setCategory}
        dateRangeText="03/11 - 26/11/2026"
        onOpenCapacityModal={() => {
          setSelectedLot(null);
          setCapacityModalOpen(true);
        }}
        onAutoLevel={handleAutoLevel}
        onSavePlan={() => {
          setSelectedLot(null);
          setSaveModalOpen(true);
        }}
        planVersion={planVersion}
        isDraftModified={isDraftModified}
      />

      {/* 2. Gate Load Grid matching GateMatrixTable (with inline KPI badges) */}
      <GateLoadGrid
        gridData={displayGrid}
        planMode={planMode}
        onPlanModeChange={setPlanMode}
        kpis={kpis}
        isDragging={Boolean(draggedLot)}
        selectedGate={selectedGridGate}
        selectedDate={selectedGridDate}
        onSelectCell={handleSelectGridCell}
      />

      {/* 4. Release Board / List (Full width 100%) + Floating Side Popup when a Lot is selected */}
      <div className="w-full min-w-0">
        <ReleaseBoard
          lots={lots}
          gridData={gridWithCurrentLots}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          granularity={granularity}
          onGranularityChange={setGranularity}
          selectedLot={selectedLot}
          onSelectLot={handleSelectLot}
          onMoveLot={handleStageMoveLot}
          draggedLot={draggedLot}
          onDragStart={(lot) => {
            setDraggedLot(lot);
          }}
          onDragEnd={() => setDraggedLot(null)}
          onHoverTargetDate={(d) => {
            setHoverTargetDate(d);
            if (d) setPreviewDate(d);
          }}
          hoverTargetDate={hoverTargetDate}
          activeMovingLot={activeMovingLot}
          activePreviewTargetDate={activePreviewTargetDate}
          frozenUntilDate={frozenUntilDate}
          frozenDays={frozenDays}
          focusedDate={focusedBoardDate}
        />
      </div>

      {/* 5. Right Navigation Drawer (Details & Edit Capacity only) */}
      <LotDetailSidePanel
        lot={selectedLot}
        previewDate={previewDate}
        onPreviewDateChange={setPreviewDate}
        gridData={gridWithCurrentLots}
        onApply={(lotToMove, targetDate) => {
          handleStageMoveLot(lotToMove, targetDate);
        }}
        onCancel={() => {
          setSelectedLot(null);
        }}
        onOpenCapacityModal={() => {
          setSelectedLot(null);
          setCapacityModalOpen(true);
        }}
        isDraggingCard={Boolean(draggedLot)}
        frozenUntilDate={frozenUntilDate}
      />

      {/* Separate Confirm Move Popup Modal when dragging/moving to another date */}
      <ConfirmMoveModal
        isOpen={Boolean(pendingMove)}
        lot={pendingMove?.lot || null}
        targetDate={pendingMove?.targetDate || null}
        gridData={gridWithCurrentLots}
        onConfirm={(lotToMove, targetDate) => {
          handleMoveLot(lotToMove, targetDate);
          setPendingMove(null);
        }}
        onCancel={() => setPendingMove(null)}
      />

      {/* Capacity Master Modal */}
      <CapacityModal
        isOpen={capacityModalOpen}
        onClose={() => setCapacityModalOpen(false)}
        onSave={() => {
          toast.success("Capacity settings saved!");
        }}
      />

      {/* Save Plan Modal */}
      <SavePlanModal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        onConfirmSave={handleConfirmSave}
        planVersion={planVersion}
        kpis={kpis}
        movedCount={movedLotsCount}
      />
    </div>
  );
};

export default Capacity_Leveling;
