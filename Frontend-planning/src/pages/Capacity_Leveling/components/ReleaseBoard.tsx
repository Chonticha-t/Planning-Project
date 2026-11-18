import React, { useMemo, useRef, useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  AlertCircle,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Calendar,
  Clock3,
  GripVertical,
  LayoutGrid,
  Moon,
  Pencil,
  Search,
  Sun,
  Table,
  X,
} from "lucide-react";
import type { BoardShiftAllocation, LotItem, DayGateLoad, GateInfo, ViewMode, Granularity, LevelingData, BoardGateStateFilter } from "../types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { boardCountLabel, lotKind, cellPct, isMoved, loadStatus, moveWarning, occupancyWindow, WARNING_TEXT, ZERO_LOAD_TEXT, zeroLoadReason } from "../utils/levelingCalculations";
import { LotCard } from "./LotCard";
import { DatePickerPopover } from "./DatePickerPopover";

interface ReleaseBoardProps {
  readOnly?: boolean;
  data: LevelingData;
  gates: GateInfo[];
  /** The board shows the cards of one gate; a move changes that gate only */
  boardGate: string;
  onBoardGateChange: (gate: string) => void;
  /** Cards of this gate inside the visible date range */
  lots: LotItem[];
  shiftAllocations: ReadonlyMap<string, BoardShiftAllocation>;
  /** Cards of this gate planned after the visible date range */
  beyondRangeCount: number;
  pastArrivalCount: number;
  gridData: DayGateLoad[];
  today: string;
  plannedIndex: Map<string, string>;
  viewMode: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  granularity: Granularity;
  selectedLot: LotItem | null;
  onSelectLot: (lot: LotItem) => void;
  onMoveLot: (lot: LotItem, targetDate: string) => void;
  selectedLotIds: ReadonlySet<string>;
  onSelectionChange: (ids: string[]) => void;
  onMoveLots: (lots: LotItem[], targetDate: string) => void;
  onReorderLots: (movingIds: string[], targetId: string, position: "before" | "after") => void;
  draggedLot: LotItem | null;
  onDragStart: (lot: LotItem) => void;
  onDragEnd: () => void;
  onHoverTargetDate: (targetDate: string | null) => void;
  hoverTargetDate: string | null;
  activeMovingLots: LotItem[];
  activePreviewTargetDate: string | null;
  focusedDate?: string | null;
}

interface WeekGroup {
  id: string;
  title: string;
  rangeLabel: string;
  defaultTargetDate: string;
  days: DayGateLoad[];
  avgWorkPct: number | null;
  gateStatusDots: DayGateLoad["gateStatusDots"];
}

const STATUS_BAR: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-rose-500",
  off: "bg-slate-200",
  unset: "bg-slate-300",
};

const SHIFT_THEMES = {
  day: {
    label: "Day Shift",
    shortLabel: "Day",
    Icon: Sun,
    badge: "bg-yellow-100 text-yellow-950 border-yellow-300",
    background: undefined,
  },
  night: {
    label: "Night Shift",
    shortLabel: "Night",
    Icon: Moon,
    badge: "bg-indigo-100 text-indigo-950 border-indigo-200",
    background: undefined,
  },
  over: {
    label: "Overflow",
    shortLabel: "Over",
    Icon: Clock3,
    badge: "bg-rose-100 text-rose-950 border-rose-300",
    background: undefined,
  },
  unassigned: {
    label: "Shift pending",
    shortLabel: "Pending",
    Icon: Clock3,
    badge: "bg-base-200 text-base-content/70 border-base-300",
    background: undefined,
  },
  no_load: {
    label: "No load",
    shortLabel: "No load",
    Icon: Clock3,
    badge: "bg-base-200 text-base-content/50 border-base-300",
    background: undefined,
  },
  none: {
    label: "No shift",
    shortLabel: "None",
    Icon: Clock3,
    badge: "",
    background: undefined,
  },
} as const;

export const ReleaseBoard: React.FC<ReleaseBoardProps> = ({
  data,
  gates,
  boardGate,
  onBoardGateChange,
  lots: rawLots,
  shiftAllocations,
  beyondRangeCount,
  pastArrivalCount,
  gridData,
  today,
  plannedIndex,
  viewMode,
  onViewModeChange,
  granularity,
  selectedLot,
  onSelectLot,
  onMoveLot,
  selectedLotIds,
  onSelectionChange,
  onMoveLots,
  onReorderLots,
  draggedLot,
  onDragStart,
  onDragEnd,
  onHoverTargetDate,
  hoverTargetDate,
  activeMovingLots,
  activePreviewTargetDate,
  focusedDate = null,
  readOnly = false,
}) => {
  const lots = useMemo(() => rawLots.filter((lot) => !lot.passedGate), [rawLots]);
  const [searchQuery, setSearchQuery] = useState("");
  const [gateStateFilter, setGateStateFilter] = useState<BoardGateStateFilter>("ALL");

  const filteredLots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lots.filter((lot) => {
      if (q) {
        const matchLotNo = (lot.label || "").toLowerCase().includes(q);
        const matchProduct = (lot.product || "").toLowerCase().includes(q);
        const matchItem = lot.item ? lot.item.toLowerCase().includes(q) : false;
        if (!matchLotNo && !matchProduct && !matchItem) return false;
      }

      if (gateStateFilter === "in_gate") {
        return lot.gateState === "in_gate";
      }
      if (gateStateFilter === "coming") {
        return lot.gateState === "coming";
      }
      if (gateStateFilter === "need_wip") {
        return (
          lot.gateState === "need_wip" ||
          lot.label.trim().toUpperCase() === "NEED WIP" ||
          lotKind(lot) === "need"
        );
      }

      return true;
    });
  }, [lots, searchQuery, gateStateFilter]);

  const isFiltered = searchQuery.trim() !== "" || gateStateFilter !== "ALL";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [hideOffDays, setHideOffDays] = useState(true);
  const [batchTargetDate, setBatchTargetDate] = useState("");
  const [internalViewMode, setInternalViewMode] = useState<ViewMode>(viewMode);
  useEffect(() => {
    setInternalViewMode(viewMode);
  }, [viewMode]);
  const activeViewMode = onViewModeChange ? viewMode : internalViewMode;
  const handleViewModeChange = (mode: ViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const toggleDayCollapse = (date: string) => {
    setCollapsedDays((prev) => ({ ...prev, [date]: !prev[date] }));
  };
  const [reorderTarget, setReorderTarget] = useState<{
    lotId: string;
    position: "before" | "after";
  } | null>(null);
  const [listDatePicker, setListDatePicker] = useState<{
    lot: LotItem;
    anchorEl: HTMLElement;
  } | null>(null);
  const [expandedDayCols, setExpandedDayCols] = useState<
    Record<string, boolean>
  >({});
  const maxVisibleCardsPerDay = isCompact ? 8 : 5;

  // Scroll the day column into view when a cell/day is clicked in Gate Load by Day
  useEffect(() => {
    if (!focusedDate || !scrollContainerRef.current) return;
    setExpandedDayCols((previous) => ({ ...previous, [focusedDate]: true }));
    const colEl = scrollContainerRef.current.querySelector<HTMLElement>(
      `[data-day-col="${focusedDate}"]`
    );
    if (colEl) {
      colEl.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [focusedDate]);

  const visibleDays = useMemo(() => gridData.filter((day) => day.date >= today), [gridData, today]);

  // Days on which this gate is open; a card cannot be planned on a closed day.
  const planningDays = useMemo(
    () => gridData.filter((d) => d.date >= today && !d.gates[boardGate]?.off),
    [gridData, today, boardGate]
  );

  // Columns shown on the daily board: optionally hide off days / holidays (unless lots are planned on them)
  const boardDays = useMemo(() => {
    if (!hideOffDays) return visibleDays;
    return visibleDays.filter(
      (col) => !col.gates[boardGate]?.off || filteredLots.some((l) => l.plannedDate === col.date)
    );
  }, [visibleDays, hideOffDays, boardGate, filteredLots]);

  const expandAllDays = () => setCollapsedDays({});
  const collapseAllDays = () => {
    const all: Record<string, boolean> = {};
    for (const d of boardDays) all[d.date] = true;
    setCollapsedDays(all);
  };
  const areAllDaysCollapsed =
    boardDays.length > 0 &&
    boardDays.every((d) => Boolean(collapsedDays[d.date]));
  const toggleAllDays = () => {
    if (areAllDaysCollapsed) {
      expandAllDays();
    } else {
      collapseAllDays();
    }
  };

  // Calendar weeks (Monday start) across the visible range, for the Weeks view.
  const weekGroups = useMemo<WeekGroup[]>(() => {
    const groups = new Map<string, DayGateLoad[]>();
    for (const day of visibleDays) {
      const d = dayjs(day.date);
      const monday = d.subtract((d.day() + 6) % 7, "day").format("YYYY-MM-DD");
      groups.set(monday, [...(groups.get(monday) ?? []), day]);
    }
    return [...groups.entries()].map(([monday, days], index) => {
      const pcts = days.map((d) => cellPct(d.gates[boardGate])).filter((pct): pct is number => pct !== null);
      const gateStatusDots: WeekGroup["gateStatusDots"] = {};
      for (const { gate } of gates) {
        const statuses = days.map((d) => d.gateStatusDots[gate]);
        gateStatusDots[gate] = statuses.includes("red") ? "red"
          : statuses.includes("yellow") ? "yellow"
          : statuses.includes("green") ? "green"
          : statuses.includes("unset") ? "unset" : "off";
      }
      return {
        id: monday,
        title: `WEEK ${index + 1}`,
        rangeLabel: `${dayjs(days[0].date).format("DD/MM")} – ${dayjs(days[days.length - 1].date).format("DD/MM")}`,
        // A card dropped on a week lands on its first open day.
        defaultTargetDate: days.find((day) => !day.gates[boardGate]?.off)?.date ?? "",
        days,
        avgWorkPct: pcts.length ? Math.round(pcts.reduce((sum, pct) => sum + pct, 0) / pcts.length) : null,
        gateStatusDots,
      };
    });
  }, [visibleDays, boardGate, gates]);

  const selectedLots = filteredLots.filter((lot) => selectedLotIds.has(lot.id));
  const movingIds = new Set(activeMovingLots.map((lot) => lot.id));
  const planningDates = new Set(planningDays.map((day) => day.date));
  const selectableLots = filteredLots;
  const toggleLotSelection = (lot: LotItem) => {
    const next = new Set(selectedLotIds);
    if (next.has(lot.id)) next.delete(lot.id);
    else next.add(lot.id);
    onSelectionChange([...next]);
  };
  const currentTargetDate = hoverTargetDate || activePreviewTargetDate;

  const scrollBoard = (dir: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const offset = dir === "left" ? -420 : 420;
    scrollContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  const handleCardDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    lot: LotItem
  ) => {
    if (readOnly) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", lot.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart(lot);
  };

  const handleCardDragEnd = () => {
    setReorderTarget(null);
    onDragEnd();
    onHoverTargetDate(null);
  };

  const getSameDayMovingLots = (target: LotItem) => {
    if (!draggedLot) return [];
    const moving = selectedLotIds.has(draggedLot.id) ? selectedLots : [draggedLot];
    return moving.length > 0 && moving.every((lot) => lot.gate === target.gate && lot.plannedDate === target.plannedDate)
      ? moving : [];
  };

  const getDropPosition = (e: React.DragEvent<HTMLElement>): "before" | "after" => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return e.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
  };

  const handleCardDragOver = (e: React.DragEvent<HTMLElement>, target: LotItem) => {
    const moving = getSameDayMovingLots(target);
    if (!moving.length) return;
    e.preventDefault();
    e.stopPropagation();
    onHoverTargetDate(null);
    if (moving.some((lot) => lot.id === target.id)) {
      e.dataTransfer.dropEffect = "none";
      setReorderTarget(null);
      return;
    }
    e.dataTransfer.dropEffect = "move";
    const position = getDropPosition(e);
    setReorderTarget((current) => current?.lotId === target.id && current.position === position
      ? current : { lotId: target.id, position });
  };

  const handleCardDrop = (e: React.DragEvent<HTMLElement>, target: LotItem) => {
    const moving = getSameDayMovingLots(target);
    if (!moving.length) return;
    e.preventDefault();
    e.stopPropagation();
    onReorderLots(moving.map((lot) => lot.id), target.id, getDropPosition(e));
    handleCardDragEnd();
  };

  const renderReorderIndicator = (lot: LotItem) => reorderTarget?.lotId === lot.id ? (
    <div aria-hidden="true" data-reorder-position={reorderTarget.position}
      className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-primary ${reorderTarget.position === "before" ? "-top-1" : "-bottom-1"}`} />
  ) : null;

  const handleColDragOver = (
    e: React.DragEvent<HTMLElement>,
    dayDate: string
  ) => {
    setReorderTarget(null);
    if (!planningDates.has(dayDate)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverTargetDate !== dayDate) {
      onHoverTargetDate(dayDate);
    }
  };

  const handleColDrop = (
    e: React.DragEvent<HTMLElement>,
    dayDate: string
  ) => {
    e.preventDefault();
    if (draggedLot && planningDates.has(dayDate)) {
      onMoveLots(selectedLotIds.has(draggedLot.id) ? selectedLots : [draggedLot], dayDate);
    }
    handleCardDragEnd();
  };

  const handleRowDragOver = (e: React.DragEvent<HTMLElement>, target: LotItem) => {
    if (!draggedLot) return;
    if (draggedLot.plannedDate === target.plannedDate) {
      handleCardDragOver(e, target);
    } else {
      handleColDragOver(e, target.plannedDate);
    }
  };

  const handleRowDrop = (e: React.DragEvent<HTMLElement>, target: LotItem) => {
    if (!draggedLot) return;
    e.preventDefault();
    e.stopPropagation();
    if (draggedLot.plannedDate === target.plannedDate) {
      const moving = getSameDayMovingLots(target);
      if (moving.length) {
        onReorderLots(moving.map((lot) => lot.id), target.id, getDropPosition(e));
      }
    } else {
      if (planningDates.has(target.plannedDate)) {
        onMoveLots(selectedLotIds.has(draggedLot.id) ? selectedLots : [draggedLot], target.plannedDate);
      }
    }
    handleCardDragEnd();
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Persistent Header Bar with Board Controls, Search/Filter & Actions (Guaranteed Single Row) */}
      <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto pb-0.5">
        {/* Left: Title + Gate Switcher + Divider + Search + Status Dropdown */}
        <div className="flex flex-nowrap items-center gap-2 shrink-0">
          <h3 className="font-bold text-sm tracking-wide text-base-content uppercase shrink-0">
            Gate Arrival Board
          </h3>

          {/* One gate at a time: moving a card changes this gate's date only */}
          <div
            role="group"
            aria-label="Gate shown on the board"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5"
          >
            {gates.map(({ gate }) => (
              <button
                key={gate}
                type="button"
                aria-pressed={boardGate === gate}
                onClick={() => onBoardGateChange(gate)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                  boardGate === gate
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-base-content/70 hover:text-base-content hover:bg-base-100"
                }`}
              >
                {gate}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-base-300 shrink-0 mx-0.5" />

          {/* Compact Search Input (w-36 sm:w-40) */}
          <div className="relative w-36 sm:w-40 shrink-0">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search Lot / Product"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input input-xs input-bordered w-full pl-7 pr-6 rounded-lg h-7 text-xs bg-base-200/40 focus:bg-base-100 placeholder:text-base-content/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Compact Status Dropdown (fixed width w-28) */}
          <select
            aria-label="Filter by status"
            value={gateStateFilter}
            onChange={(e) => setGateStateFilter(e.target.value as BoardGateStateFilter)}
            className={`select select-xs h-7 min-h-0 w-28 shrink-0 pl-2.5 pr-6 text-xs font-semibold rounded-lg border focus:outline-none cursor-pointer ${
              gateStateFilter !== "ALL"
                ? "bg-[#eef2ff] border-primary text-primary"
                : "bg-base-200/40 border-base-300 text-base-content/75"
            }`}
          >
            <option value="ALL">All Status</option>
            <option value="in_gate">In Gate</option>
            <option value="coming">Coming</option>
            <option value="need_wip">Need WIP</option>
          </select>

          {/* Count Badge / Reset */}
          {isFiltered ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setGateStateFilter("ALL");
              }}
              className="badge badge-sm bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[11px] font-semibold gap-1 cursor-pointer shrink-0"
              title="Click to reset filters"
            >
              <span>{filteredLots.length} cards</span>
              <X size={10} />
            </button>
          ) : (
            <span
              className="badge badge-sm bg-base-200 text-base-content/60 border-base-300 font-semibold tabular-nums text-[11px] shrink-0"
              title={`${pastArrivalCount > 0 ? `${pastArrivalCount} earlier arrivals. ` : ""}${beyondRangeCount > 0 ? `+${beyondRangeCount} after this period.` : ""}`}
            >
              {boardCountLabel(lots)}
            </span>
          )}

          {isEditMode && (
            <button
              type="button"
              onClick={() => onSelectionChange(selectableLots.map((lot) => lot.id))}
              disabled={selectableLots.length === 0}
              className="btn btn-xs btn-ghost text-xs text-primary font-semibold shrink-0"
            >
              Select all ({selectableLots.length})
            </button>
          )}
        </div>

        {/* Right Switchers & Scroll Controls */}
        <div className="flex flex-nowrap items-center gap-2 shrink-0">
          {/* View Mode Switcher: Board vs Table */}
          <div
            role="group"
            aria-label="View mode"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5"
          >
            <button
              type="button"
              aria-pressed={activeViewMode === "board"}
              onClick={() => handleViewModeChange("board")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                activeViewMode === "board"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/70 hover:text-base-content hover:bg-base-100"
              }`}
              title="Board View (Card columns by day)"
            >
              <LayoutGrid size={13} />
              <span>Board</span>
            </button>
            <button
              type="button"
              aria-pressed={activeViewMode === "list"}
              onClick={() => handleViewModeChange("list")}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                activeViewMode === "list"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/70 hover:text-base-content hover:bg-base-100"
              }`}
              title="Table View (Grouped by day)"
            >
              <Table size={13} />
              <span>Table</span>
            </button>
          </div>

          {activeViewMode === "board" && granularity === "days" && (
            <div className="inline-flex items-center gap-1 mr-1 shrink-0">
              <button
                type="button"
                onClick={() => scrollBoard("left")}
                className="btn btn-xs btn-square h-7 w-7 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-base-content/70 cursor-pointer"
                title="Scroll board left"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => scrollBoard("right")}
                className="btn btn-xs btn-square h-7 w-7 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-base-content/70 cursor-pointer"
                title="Scroll board right"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}



          {granularity === "days" && (
            <button
              type="button"
              aria-pressed={hideOffDays}
              onClick={() => setHideOffDays((prev) => !prev)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                hideOffDays
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                  : "border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200"
              }`}
              title={hideOffDays ? "Hiding holidays (click to show all days)" : "Showing all days (click to hide holidays)"}
            >
              <CalendarOff size={13} />
              <span>{hideOffDays ? "Hide Holidays" : "Show All Days"}</span>
            </button>
          )}

          <button
            type="button"
            disabled={readOnly}
            aria-pressed={isEditMode}
            onClick={() => {
              if (isEditMode) {
                onSelectionChange([]);
                setBatchTargetDate("");
              }
              setIsEditMode((prev) => !prev);
            }}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              isEditMode
                ? "border-primary bg-primary text-primary-content"
                : "border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200"
            }`}
          >
            <Pencil size={13} />
            Edit
          </button>

          {activeViewMode === "board" && (
            <div
              role="group"
              aria-label="Board size"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5"
            >
              {([
                { label: "Normal", compact: false },
                { label: "Compact", compact: true },
              ] as const).map((option) => (
                <button
                  key={option.label}
                  type="button"
                  aria-pressed={isCompact === option.compact}
                  onClick={() => setIsCompact(option.compact)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                    isCompact === option.compact
                      ? "bg-primary text-primary-content shadow-xs"
                      : "text-base-content/70 hover:text-base-content hover:bg-base-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isEditMode && selectedLots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
          <span className="text-xs font-bold text-primary" role="status">
            {selectedLots.length} card(s) selected
          </span>
          <span className="text-xs text-base-content/60">Drag a selected card or choose a date:</span>
          <select aria-label="Move selected lots to date" value={batchTargetDate}
            onChange={(e) => setBatchTargetDate(e.target.value)}
            className="select select-sm h-8 w-auto rounded-lg border-base-300 bg-base-100 text-xs">
            <option value="">Select target date</option>
            {planningDays.map((day) => <option key={day.date} value={day.date}>
              {dayjs(day.date).format("ddd DD/MM/YYYY")}
            </option>)}
          </select>
          <button type="button" disabled={!planningDates.has(batchTargetDate)}
            onClick={() => onMoveLots(selectedLots, batchTargetDate)}
            className="btn btn-sm btn-primary h-8 rounded-lg text-xs">
            Move {selectedLots.length} card(s)
          </button>
          <button type="button" onClick={() => onSelectionChange([])}
            className="btn btn-sm btn-ghost h-8 rounded-lg text-xs">Clear selection</button>
        </div>
      )}

      {/* =========================================================
          VIEW 1: BOARD VIEW — DAYS (Horizontally Scrollable across ALL planning days)
         ========================================================= */}
      {activeViewMode === "board" && granularity === "days" && (
        <div
          ref={scrollContainerRef}
          className={`flex overflow-x-auto pb-2 scroll-smooth ${isCompact ? "gap-1.5 min-h-[400px]" : "gap-2 min-h-[480px]"}`}
        >
          {/* Scrollable Day Columns for ALL planning days */}
          {boardDays.map((col) => {
            const colLots = filteredLots.filter((l) => l.plannedDate === col.date);
            const colPct = cellPct(col.gates[boardGate]);
            const colCap = data.capacity?.[boardGate]?.[col.date];
            const colHasOt = Boolean(colCap?.hasOt);
            const isDayExpanded = Boolean(expandedDayCols[col.date]);
            const visibleLots = isDayExpanded
              ? colLots
              : colLots.slice(0, maxVisibleCardsPerDay);
            const hiddenLotsCount = Math.max(
              0,
              colLots.length - visibleLots.length
            );

            const isTargetCol =
              activeMovingLots.some((lot) => lot.plannedDate !== col.date) &&
              currentTargetDate === col.date &&
              activeMovingLots.length > 0;
            const isAfterMustStart = activeMovingLots.some((lot) => ["late", "order"].includes(moveWarning(lot, col.date, plannedIndex, data)));

            const isFocusedCol = focusedDate === col.date;

            return (
              <div
                key={col.date}
                data-day-col={col.date}
                onDragOver={(e) => handleColDragOver(e, col.date)}
                onDrop={(e) => handleColDrop(e, col.date)}
                className={`shrink-0 flex flex-col max-h-[580px] rounded-xl transition-all ${isCompact ? "w-[140px] p-1.5" : "w-[162px] p-2"} ${
                  isTargetCol
                    ? "border-[1.5px] border-dashed border-[#4f46e5] bg-[#eef2ff]/30"
                    : isFocusedCol
                    ? "border-2 border-[#4f46e5] bg-[#eef2ff]/25 shadow-xs"
                    : isAfterMustStart
                    ? "border border-rose-200 bg-[repeating-linear-gradient(-45deg,#fff8f8,#fff8f8_7px,#fee2e2_7px,#fee2e2_14px)]"
                    : "border border-base-300/80 bg-base-200/35"
                }`}
              >
                {/* Sticky Column Header */}
                <div className="px-0.5 pb-2 border-b border-base-300/60 mb-2 shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="leading-tight">
                      <div className="flex items-center gap-1">
                        <span className="text-[10.5px] font-semibold uppercase text-base-content/50">
                          {col.dayLabel}
                        </span>
                        {colHasOt && (
                          <span
                            title="Overtime active"
                            className="px-1 py-0.5 rounded border border-base-300 bg-base-200/90 text-[9.5px] font-bold text-base-content/75 leading-none"
                          >
                            OT
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-bold text-base-content tabular-nums mt-0.5 flex flex-col items-start gap-1">
                        <span>{col.displayDate}</span>
                        {colLots.length > 0 && (
                          <span className="px-1.5 py-0 rounded bg-base-200 text-[10px] font-semibold text-base-content/60 whitespace-normal">
                            {boardCountLabel(colLots)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      title={colPct === null ? `Arrival load is unavailable for ${boardGate}` : `${boardGate} arrival load on this day; cards below use the same arrivals`}
                      className={`text-xs font-bold tabular-nums ${
                        colPct === null
                          ? "text-base-content/40"
                          : loadStatus(colPct) === "red"
                          ? "text-rose-600"
                          : loadStatus(colPct) === "yellow"
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {colPct === null ? "—" : `${colPct}%`}
                    </span>
                  </div>

                  {/* Status of every gate on this day; the board's gate is taller */}
                  <div className="flex items-end gap-1 mt-2">
                    {gates.map(({ gate }) => (
                      <span
                        key={gate}
                        title={`${gate}: ${col.gateStatusDots[gate]}`}
                        className={`flex-1 rounded-full ${gate === boardGate ? "h-[6px]" : "h-[4px] opacity-70"} ${STATUS_BAR[col.gateStatusDots[gate]]}`}
                      />
                    ))}
                  </div>
                </div>

                {/* Internally Scrollable Column Cards Body */}
                <div className={`flex-1 flex flex-col overflow-y-auto pr-0.5 min-h-0 ${isCompact ? "gap-1.5" : "gap-2"}`}>
                  {visibleLots.map((lot, index) => {
                    const isThisMovingPreview =
                      movingIds.has(lot.id) &&
                      Boolean(currentTargetDate) &&
                      currentTargetDate !== lot.plannedDate;

                    return (
                      <React.Fragment key={lot.id}>
                      {(index === 0 || lotKind(visibleLots[index - 1]) !== lotKind(lot)) && (
                        <div className="text-[10px] font-bold text-base-content/60 uppercase">{lotKind(lot) === "lot" ? "Actual lots" : lotKind(lot) === "need" ? "Need WIP (no load)" : "Missing lot ID"}</div>
                      )}
                      <div className="relative shrink-0"
                        onDragOver={(e) => handleCardDragOver(e, lot)}
                        onDrop={(e) => handleCardDrop(e, lot)}>
                      {renderReorderIndicator(lot)}
                      <LotCard
                        readOnly={readOnly}
                        lot={lot}
                        shiftAllocation={shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id)}
                        showSelection={isEditMode}
                        compact={isCompact}
                        isBatchSelected={selectedLotIds.has(lot.id)}
                        onToggleSelection={toggleLotSelection}
                        isSelected={selectedLot?.id === lot.id}
                        isBeingDragged={Boolean(draggedLot) && movingIds.has(lot.id)}
                        isMovingPreview={isThisMovingPreview}
                        previewTargetDate={
                          isThisMovingPreview ? currentTargetDate : null
                        }
                        warning={moveWarning(lot, lot.plannedDate, plannedIndex, data)}
                        days={planningDays}
                        onSelect={onSelectLot}
                        onDragStart={handleCardDragStart}
                        onDragEnd={handleCardDragEnd}
                        onDateChange={onMoveLot}
                      />
                      </div>
                      </React.Fragment>
                    );
                  })}

                  {/* Expand days that exceed the visible-card limit for the current size. */}
                  {colLots.length > maxVisibleCardsPerDay && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDayCols((prev) => ({
                          ...prev,
                          [col.date]: !prev[col.date],
                        }))
                      }
                      className="mt-0.5 w-full py-1.5 px-2 rounded-lg border border-dashed border-indigo-200 bg-[#eef2ff]/70 hover:bg-[#eef2ff] text-[#4f46e5] text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer shrink-0 tabular-nums"
                    >
                      {isDayExpanded ? (
                        <>
                          <ChevronUp size={12} />
                          <span>Show less</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown size={12} />
                          <span>+{hiddenLotsCount} more card(s)</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Dashed Drop Zone Placeholder */}
                  {isTargetCol && (
                    <button type="button"
                      onClick={() => onMoveLots(activeMovingLots, col.date)}
                      className="mt-0.5 rounded-xl border-[1.5px] border-dashed border-[#4f46e5] bg-[#eef2ff] px-2 py-3 text-center text-xs font-semibold text-[#4f46e5] leading-snug cursor-pointer hover:bg-indigo-100/80 transition-colors shrink-0"
                    >
                      <div>Move {activeMovingLots.length} card(s) here</div>
                      <div className="tabular-nums mt-0.5">
                        {dayjs(col.date).format("DD/MM/YYYY")}
                      </div>
                    </button>
                  )}

                  {/* After Must Out Warning Text */}
                  {isAfterMustStart && (
                    <div className="mt-2 px-1 text-center text-[11px] font-semibold text-rose-700 leading-snug shrink-0">
                      Projected completion is after must-out or overlaps another gate
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================
          VIEW 2: BOARD VIEW — WEEKS GRANULARITY
         ========================================================= */}
      {activeViewMode === "board" && granularity === "weeks" && (
        <div className="flex gap-3 overflow-x-auto min-h-[480px]">
          {/* One column per calendar week */}
          <div className={`grid grid-cols-1 gap-3 flex-1 ${isCompact ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {weekGroups.map((wg) => {
              const weekDates = new Set(wg.days.map((d) => d.date));
              const weekLots = filteredLots.filter((l) => weekDates.has(l.plannedDate));
              const isWeekHovered =
                hoverTargetDate !== null && weekDates.has(hoverTargetDate);

              return (
                <div
                  key={wg.id}
                  onDragOver={(e) =>
                    handleColDragOver(e, wg.defaultTargetDate)
                  }
                  onDrop={(e) => handleColDrop(e, wg.defaultTargetDate)}
                  className={`flex flex-col rounded-xl p-3 border transition-all ${
                    isWeekHovered
                      ? "border-[1.5px] border-dashed border-[#4f46e5] bg-[#eef2ff]/30"
                      : "border-base-300/80 bg-base-200/35"
                  }`}
                >
                  {/* Week Column Header */}
                  <div className="pb-2.5 mb-2.5 border-b border-base-300/70">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold uppercase text-primary tracking-wide">
                          {wg.title}
                        </div>
                        <div className="text-sm font-bold text-base-content tabular-nums">
                          {wg.rangeLabel}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs font-bold tabular-nums px-2 py-0.5 rounded-md ${
                            wg.avgWorkPct === null
                              ? "bg-base-200 text-base-content/50"
                              : loadStatus(wg.avgWorkPct) === "red"
                              ? "bg-rose-100 text-rose-800"
                              : loadStatus(wg.avgWorkPct) === "yellow"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {wg.avgWorkPct === null ? "MC not set" : `Avg ${wg.avgWorkPct}%`}
                        </span>
                        <div className="text-[11px] text-base-content/50 mt-0.5 tabular-nums">
                          {boardCountLabel(weekLots)}
                        </div>
                      </div>
                    </div>

                    {/* Worst status of every gate in this week */}
                    <div className="flex gap-1.5 mt-2">
                      {gates.map(({ gate }) => (
                        <div key={gate} className="flex flex-1 flex-col gap-0.5">
                          <span className={`h-[4px] rounded-full ${STATUS_BAR[wg.gateStatusDots[gate]]}`} />
                          <span className={`text-[9.5px] font-semibold text-center ${
                            gate === boardGate ? "text-primary" : "text-base-content/45"}`}>
                            {gate}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Week Lots Grid (2 columns of cards per week) */}
                  <div className="grid grid-cols-2 gap-2">
                    {weekLots.map((lot) => (
                      <div key={lot.id} className="relative"
                        onDragOver={(e) => handleCardDragOver(e, lot)}
                        onDrop={(e) => handleCardDrop(e, lot)}>
                      {renderReorderIndicator(lot)}
                      <LotCard
                        readOnly={readOnly}
                        lot={lot}
                        shiftAllocation={shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id)}
                        showSelection={isEditMode}
                        compact={isCompact}
                        isBatchSelected={selectedLotIds.has(lot.id)}
                        onToggleSelection={toggleLotSelection}
                        isSelected={selectedLot?.id === lot.id}
                        isBeingDragged={Boolean(draggedLot) && movingIds.has(lot.id)}
                        isMovingPreview={movingIds.has(lot.id) && Boolean(currentTargetDate) && currentTargetDate !== lot.plannedDate}
                        previewTargetDate={movingIds.has(lot.id) ? currentTargetDate : null}
                        warning={moveWarning(lot, lot.plannedDate, plannedIndex, data)}
                        days={planningDays}
                        onSelect={onSelectLot}
                        onDragStart={handleCardDragStart}
                        onDragEnd={handleCardDragEnd}
                        onDateChange={onMoveLot}
                      />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW 3: LIST / TABLE VIEW (Grouped by Date or Weeks)
         ========================================================= */}
      {activeViewMode === "list" && (
        <div className="overflow-x-auto rounded-xl border border-base-300">
          <table className="table table-sm table-fixed w-full min-w-[980px] text-center border-collapse [&_th]:text-center [&_td]:text-center [&_td:nth-child(2)]:text-left [&_th:nth-child(2)]:text-left [&_th]:px-2.5 [&_th]:py-2.5 [&_th]:whitespace-nowrap [&_td]:px-2.5 [&_td]:py-2 [&_td]:align-middle [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-base-300 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-base-300/60">
            <colgroup>
              <col style={{ width: "42px" }} />
              <col style={{ width: "160px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "105px" }} />
              <col style={{ width: "95px" }} />
              <col style={{ width: "105px" }} />
              <col style={{ width: "115px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "135px" }} />
              <col style={{ width: "110px" }} />
            </colgroup>
            <thead>
              <tr className="bg-base-200/80 border-b border-base-300 text-[11.5px] font-bold tracking-[0.03em] text-base-content">
                <th className="text-center px-1 py-1">
                  {granularity === "days" ? (
                    <button
                      type="button"
                      onClick={toggleAllDays}
                      className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-base-300/80 text-base-content/65 hover:text-primary transition-colors cursor-pointer"
                      title={areAllDaysCollapsed ? "Expand all days" : "Collapse all days"}
                      aria-label={areAllDaysCollapsed ? "Expand all days" : "Collapse all days"}
                    >
                      {areAllDaysCollapsed ? (
                        <ChevronsDown size={15} className="text-primary" />
                      ) : (
                        <ChevronsUp size={15} />
                      )}
                    </button>
                  ) : isEditMode ? (
                    "SEL"
                  ) : null}
                </th>
                <th>PRODUCT NAME</th>
                <th>LOT</th>
                <th>PCS</th>
                <th>SHEET</th>
                <th>STATUS</th>
                <th>SHIFT</th>
                <th>MUST OUT</th>
                <th>{boardGate} DATE</th>
                <th>SO DUE</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(granularity === "weeks"
                ? weekGroups.flatMap((wg) => {
                    const weekDates = new Set(wg.days.map((d) => d.date));
                    const weekLots = filteredLots.filter((l) =>
                      weekDates.has(l.plannedDate)
                    );
                    if (weekLots.length === 0) return [];
                    const totalPcs = weekLots.some((lot) => lot.qty === null)
                      ? null
                      : weekLots.reduce((sum, lot) => sum + (lot.qty ?? 0), 0);
                    return [
                      {
                        type: "week-header" as const,
                        wg,
                        count: boardCountLabel(weekLots),
                        totalPcs,
                      },
                      ...weekLots.map((lot, idx) => ({
                        type: "row" as const,
                        lot,
                        priority: idx + 1,
                        alloc: shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id),
                      })),
                    ];
                  })
                : boardDays.flatMap((col) => {
                    const colLots = filteredLots.filter((l) => l.plannedDate === col.date);
                    const colPct = cellPct(col.gates[boardGate]);
                    const totalPcs = colLots.some((lot) => lot.qty === null)
                      ? null
                      : colLots.reduce((sum, lot) => sum + (lot.qty ?? 0), 0);
                    const isCollapsed = Boolean(collapsedDays[col.date]);

                    const colCap = data.capacity?.[boardGate]?.[col.date];
                    const colReqCap = data.requiredCapacity?.[boardGate]?.[col.date];
                    const hasOt = Boolean(colCap?.hasOt);
                    const totalOtMin = hasOt && colCap && colReqCap
                      ? Math.max(0, (colCap.capacityMin ?? 0) - (colReqCap.capacityMin ?? 0))
                      : 0;

                    const dayShiftHasOt = Boolean(colCap?.shifts?.day?.otOn);
                    const dayShiftOtMin = dayShiftHasOt && colCap && colReqCap
                      ? Math.max(0, (colCap.shifts?.day?.capacityMin ?? 0) - (colReqCap.shifts?.day?.capacityMin ?? 0))
                      : 0;

                    const nightShiftHasOt = Boolean(colCap?.shifts?.night?.otOn);
                    const nightShiftOtMin = nightShiftHasOt && colCap && colReqCap
                      ? Math.max(0, (colCap.shifts?.night?.capacityMin ?? 0) - (colReqCap.shifts?.night?.capacityMin ?? 0))
                      : 0;

                    const headerItem = {
                      type: "day-header" as const,
                      col,
                      colLots,
                      colPct,
                      totalPcs,
                      isCollapsed,
                      hasOt,
                      totalOtMin,
                      dayShiftHasOt,
                      dayShiftOtMin,
                      nightShiftHasOt,
                      nightShiftOtMin,
                    };

                    if (isCollapsed) {
                      return [headerItem];
                    }

                    if (colLots.length === 0) {
                      return [headerItem, { type: "empty-day" as const, col }];
                    }

                    // colLots is already ordered by Board Priority sequence!
                    const mappedLots = colLots.map((lot, idx) => {
                      const alloc = shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id);
                      const status = alloc?.status ?? "unassigned";
                      return {
                        lot,
                        col,
                        priority: idx + 1,
                        alloc,
                        status,
                      };
                    });

                    // Segment into Day Shift, Night Shift, and Others (Overflow / Unassigned)
                    const dayLots = mappedLots.filter((m) => m.status === "day");
                    const nightLots = mappedLots.filter((m) => m.status === "night");
                    const otherLots = mappedLots.filter(
                      (m) => m.status !== "day" && m.status !== "night"
                    );

                    const dayPcs = dayLots.some((m) => m.lot.qty === null)
                      ? null
                      : dayLots.reduce((sum, m) => sum + (m.lot.qty ?? 0), 0);
                    const nightPcs = nightLots.some((m) => m.lot.qty === null)
                      ? null
                      : nightLots.reduce((sum, m) => sum + (m.lot.qty ?? 0), 0);
                    const otherPcs = otherLots.some((m) => m.lot.qty === null)
                      ? null
                      : otherLots.reduce((sum, m) => sum + (m.lot.qty ?? 0), 0);

                    const rows: Array<
                      | typeof headerItem
                      | { type: "empty-day"; col: typeof col }
                      | {
                          type: "shift-header";
                          col: typeof col;
                          shiftKey: string;
                          theme: (typeof SHIFT_THEMES)[keyof typeof SHIFT_THEMES];
                          lotsCount: number;
                          totalPcs: number | null;
                          shiftHasOt: boolean;
                          shiftOtMin: number;
                        }
                      | {
                          type: "row";
                          lot: LotItem;
                          col: typeof col;
                          priority: number;
                          alloc?: BoardShiftAllocation;
                        }
                    > = [headerItem];

                    if (dayLots.length > 0) {
                      rows.push({
                        type: "shift-header",
                        col,
                        shiftKey: "day",
                        theme: SHIFT_THEMES.day,
                        lotsCount: dayLots.length,
                        totalPcs: dayPcs,
                        shiftHasOt: dayShiftHasOt,
                        shiftOtMin: dayShiftOtMin,
                      });
                      for (const item of dayLots) {
                        rows.push({
                          type: "row",
                          lot: item.lot,
                          col: item.col,
                          priority: item.priority,
                          alloc: item.alloc,
                        });
                      }
                    }

                    if (nightLots.length > 0) {
                      rows.push({
                        type: "shift-header",
                        col,
                        shiftKey: "night",
                        theme: SHIFT_THEMES.night,
                        lotsCount: nightLots.length,
                        totalPcs: nightPcs,
                        shiftHasOt: nightShiftHasOt,
                        shiftOtMin: nightShiftOtMin,
                      });
                      for (const item of nightLots) {
                        rows.push({
                          type: "row",
                          lot: item.lot,
                          col: item.col,
                          priority: item.priority,
                          alloc: item.alloc,
                        });
                      }
                    }

                    if (otherLots.length > 0) {
                      const isOver = otherLots.some((m) => m.status === "over");
                      rows.push({
                        type: "shift-header",
                        col,
                        shiftKey: isOver ? "over" : "unassigned",
                        theme: isOver ? SHIFT_THEMES.over : SHIFT_THEMES.unassigned,
                        lotsCount: otherLots.length,
                        totalPcs: otherPcs,
                        shiftHasOt: false,
                        shiftOtMin: 0,
                      });
                      for (const item of otherLots) {
                        rows.push({
                          type: "row",
                          lot: item.lot,
                          col: item.col,
                          priority: item.priority,
                          alloc: item.alloc,
                        });
                      }
                    }

                    return rows;
                  })
              ).map((item) => {
                if (item.type === "week-header") {
                  return (
                    <tr
                      key={`hdr-${item.wg.id}`}
                      className="bg-base-200/50 border-b border-base-300"
                    >
                      <td colSpan={10} className="!text-left px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-primary font-bold text-xs tracking-wide">
                              {item.wg.title}
                            </span>
                            <span className="font-bold text-xs text-base-content tabular-nums">
                              {item.wg.rangeLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-base-content/70 font-medium tabular-nums">
                            <span>
                              <strong className="font-bold text-base-content">
                                {item.count}
                              </strong>{" "}
                              arrivals
                            </span>
                            <span className="text-base-content/30">·</span>
                            <span>
                              <strong className="font-bold text-base-content">
                                {formatGateQuantity(item.totalPcs, "piece")}
                              </strong>{" "}
                              pcs
                            </span>
                            <span className="text-base-content/30">·</span>
                            <span>
                              Avg load{" "}
                              <strong className="font-bold text-base-content">
                                {item.wg.avgWorkPct === null ? "—" : `${item.wg.avgWorkPct}%`}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (item.type === "day-header") {
                  const isTargetDay = currentTargetDate === item.col.date;
                  return (
                    <tr
                      key={`day-hdr-${item.col.date}`}
                      onDragOver={(e) => handleColDragOver(e, item.col.date)}
                      onDrop={(e) => handleColDrop(e, item.col.date)}
                      onClick={() => toggleDayCollapse(item.col.date)}
                      className={`border-b-2 border-base-300 cursor-pointer select-none transition-colors ${
                        isTargetDay
                          ? "bg-[#eef2ff] border-primary"
                          : item.col.isToday
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "bg-base-200/70 hover:bg-base-200"
                      }`}
                    >
                      <td colSpan={10} className="!text-left px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDayCollapse(item.col.date);
                              }}
                              className="text-base-content/60 hover:text-base-content cursor-pointer"
                              title={item.isCollapsed ? "Expand day" : "Collapse day"}
                            >
                              {item.isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs tracking-wide uppercase ${
                              item.col.isToday ? "bg-primary text-primary-content" : "bg-base-300 text-base-content"
                            }`}>
                              {item.col.dayLabel} {item.col.displayDate}
                            </span>
                            {item.col.isToday && (
                              <span className="badge badge-xs badge-primary font-semibold">Today</span>
                            )}
                            {item.hasOt && (
                              <span
                                className="px-1.5 py-0.5 rounded border border-base-300 bg-base-200/90 text-[10.5px] font-bold text-base-content/75 leading-none"
                                title="Overtime active"
                              >
                                OT
                              </span>
                            )}
                            <span className="text-xs font-semibold text-base-content/75 tabular-nums">
                              {item.colLots.length > 0 ? boardCountLabel(item.colLots) : "0 lots"}
                            </span>
                            {item.totalPcs !== null && item.colLots.length > 0 && (
                              <>
                                <span className="text-base-content/30">·</span>
                                <span className="text-xs font-medium text-base-content/70 tabular-nums">
                                  {formatGateQuantity(item.totalPcs, "piece")} pcs
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-base-content/60">Load:</span>
                              <span className={`text-xs font-bold tabular-nums ${
                                item.colPct === null
                                  ? "text-base-content/40"
                                  : loadStatus(item.colPct) === "red"
                                  ? "text-rose-600"
                                  : loadStatus(item.colPct) === "yellow"
                                  ? "text-amber-600"
                                  : "text-emerald-600"
                              }`}>
                                {item.colPct === null ? "—" : `${item.colPct}%`}
                              </span>
                              <div className="flex items-center gap-1 w-20">
                                {gates.map(({ gate }) => (
                                  <span
                                    key={gate}
                                    title={`${gate}: ${item.col.gateStatusDots[gate]}`}
                                    className={`flex-1 rounded-full ${gate === boardGate ? "h-[5px]" : "h-[3px] opacity-70"} ${STATUS_BAR[item.col.gateStatusDots[gate]]}`}
                                  />
                                ))}
                              </div>
                            </div>

                            {isTargetDay && (
                              <span className="badge badge-sm badge-primary text-[10px] font-semibold animate-pulse">
                                Drop here to schedule
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (item.type === "shift-header") {
                  const ShiftIcon = item.theme.Icon;
                  return (
                    <tr
                      key={`shift-hdr-${item.col.date}-${item.shiftKey}`}
                      onDragOver={(e) => handleColDragOver(e, item.col.date)}
                      onDrop={(e) => handleColDrop(e, item.col.date)}
                      className="bg-base-200/40 border-b border-base-300/80"
                    >
                      <td colSpan={10} className="!text-left px-4 py-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-bold leading-none ${item.theme.badge}`}
                            >
                              <ShiftIcon size={12} className="shrink-0" />
                              <span>{item.theme.label}</span>
                            </span>
                            {item.shiftHasOt && (
                              <span
                                className="px-1.5 py-0.5 rounded border border-base-300 bg-base-200/90 text-[10px] font-bold text-base-content/70 leading-none"
                                title="Overtime active for this shift"
                              >
                                OT
                              </span>
                            )}
                            <span className="text-xs font-semibold text-base-content/75 tabular-nums">
                              {item.lotsCount} {item.lotsCount === 1 ? "lot" : "lots"}
                            </span>
                            {item.totalPcs !== null && (
                              <>
                                <span className="text-base-content/30">·</span>
                                <span className="text-xs font-medium text-base-content/65 tabular-nums">
                                  {formatGateQuantity(item.totalPcs, "piece")} pcs
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }

                if (item.type === "empty-day") {
                  const isTargetDay = currentTargetDate === item.col.date;
                  return (
                    <tr
                      key={`empty-${item.col.date}`}
                      onDragOver={(e) => handleColDragOver(e, item.col.date)}
                      onDrop={(e) => handleColDrop(e, item.col.date)}
                      className={`transition-colors ${isTargetDay ? "bg-[#eef2ff]/50" : ""}`}
                    >
                      <td colSpan={10} className="py-2.5 px-4 text-center">
                        <div className={`py-2 px-3 rounded-lg border-2 border-dashed text-xs text-base-content/50 transition-colors ${
                          isTargetDay ? "border-primary bg-primary/10 text-primary font-semibold" : "border-base-300/80 bg-base-100/40"
                        }`}>
                          {isTargetDay ? `Drop here to move to ${item.col.dayLabel} ${item.col.displayDate}` : `No lots planned on ${item.col.dayLabel} ${item.col.displayDate} · Drag lots here to schedule`}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const { lot } = item;
                const isSelected = selectedLot?.id === lot.id;
                const isPickerOpen = listDatePicker?.lot.id === lot.id;
                const isDragging = draggedLot?.id === lot.id;
                const alloc = item.alloc ?? shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id);
                const shiftTheme = SHIFT_THEMES[alloc?.status ?? "unassigned"] ?? SHIFT_THEMES.unassigned;
                const ShiftIcon = shiftTheme.Icon;
                const isReorderTargetBefore = reorderTarget?.lotId === lot.id && reorderTarget.position === "before";
                const isReorderTargetAfter = reorderTarget?.lotId === lot.id && reorderTarget.position === "after";

                const moved = isMoved(lot);
                const originalDateDisplay = lot.baseDate ? dayjs(lot.baseDate).format("DD/MM/YYYY") : null;
                const originalDateShort = lot.baseDate ? dayjs(lot.baseDate).format("DD/MM") : null;
                const moveDiffDays = lot.baseDate ? dayjs(lot.plannedDate).diff(dayjs(lot.baseDate), "day") : 0;

                return (
                  <tr
                    key={lot.id}
                    draggable={!readOnly}
                    onDragStart={(e) => handleCardDragStart(e, lot)}
                    onDragEnd={handleCardDragEnd}
                    onDragOver={(e) => handleRowDragOver(e, lot)}
                    onDrop={(e) => handleRowDrop(e, lot)}
                    onClick={() => onSelectLot(lot)}
                    className={`border-b border-base-300/50 hover:bg-base-200/40 text-[13px] leading-5 cursor-pointer transition-colors relative ${
                      isSelected ? "bg-[#eef2ff]/80 ring-1 ring-inset ring-[#4f46e5]/40" : ""
                    } ${isDragging ? "opacity-35" : ""} ${
                      isReorderTargetBefore ? "!border-t-2 !border-t-primary" : ""
                    } ${isReorderTargetAfter ? "!border-b-2 !border-b-primary" : ""}`}
                  >
                    {/* Drag Grip + Selection Checkbox */}
                    <td
                      className={`px-2 relative transition-all ${
                        moved ? "border-l-[3.5px] !border-l-indigo-600 bg-indigo-50/20" : ""
                      }`}
                      title={
                        moved
                          ? `Moved from ${originalDateDisplay} (${moveDiffDays > 0 ? `+${moveDiffDays}d` : `${moveDiffDays}d`})`
                          : undefined
                      }
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        {!readOnly && (
                          <GripVertical
                            size={13}
                            className="cursor-grab text-base-content/40 hover:text-primary active:cursor-grabbing shrink-0"
                            title="Drag to reorder or move to another day"
                          />
                        )}
                        {isEditMode && (
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-primary"
                            aria-label={`Select ${lot.label} ${lot.product}`}
                            checked={selectedLotIds.has(lot.id)}
                            onChange={() => toggleLotSelection(lot)}
                          />
                        )}
                      </div>
                    </td>

                    {/* PRODUCT NAME */}
                    <td>
                      <span className="font-semibold text-[13.5px] text-base-content">
                        {lot.product}
                      </span>
                    </td>

                    {/* LOT */}
                    <td>
                      <span className="font-mono font-bold text-[12.5px] tracking-wide tabular-nums text-base-content select-all">
                        {lot.label}
                      </span>
                    </td>

                    {/* PCS */}
                    <td className="font-bold text-[13px] text-base-content tabular-nums">
                      {formatGateQuantity(lot.qty, "piece")}
                    </td>

                    {/* SHEET */}
                    <td className="font-medium text-[12.5px] text-base-content/80 tabular-nums">
                      {lot.sheets !== null ? formatGateQuantity(lot.sheets, "sheet") : "-"}
                    </td>

                    {/* STATUS (In Gate / Coming / Need WIP) */}
                    <td>
                      {lot.gateState === "in_gate" ? (
                        <span className="font-semibold text-xs text-emerald-600">
                          In Gate
                        </span>
                      ) : lot.gateState === "coming" ? (
                        <span className="font-semibold text-xs text-sky-600">
                          Coming
                        </span>
                      ) : lot.gateState === "need_wip" ? (
                        <span className="font-semibold text-xs text-amber-600">
                          Need WIP
                        </span>
                      ) : (
                        <span className="text-xs text-base-content/40">-</span>
                      )}
                    </td>

                    {/* SHIFT */}
                    <td>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-none ${shiftTheme.badge}`}
                      >
                        <ShiftIcon size={11} className="shrink-0" />
                        <span>{shiftTheme.shortLabel}</span>
                      </span>
                    </td>

                    {/* MUST OUT */}
                    <td className="font-medium text-[12.5px] text-base-content/80">
                      {dayjs(lot.mustOut).format("DD/MM/YYYY")}
                    </td>

                    {/* DATE AT THIS GATE (opens the date picker) */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-center justify-center">
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={(e) => {
                            if (readOnly) return;
                            if (isPickerOpen) {
                              setListDatePicker(null);
                            } else {
                              setListDatePicker({
                                lot,
                                anchorEl: e.currentTarget,
                              });
                            }
                          }}
                          className={`inline-flex items-center justify-between gap-1.5 h-7 px-2 rounded-lg border text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                            isPickerOpen
                              ? "border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
                              : moved
                              ? "border-indigo-300 bg-indigo-50/50 hover:bg-indigo-100/60 text-indigo-950 shadow-2xs"
                              : "border-base-300 bg-base-100 hover:border-primary/50 hover:bg-base-200/40 text-base-content"
                          }`}
                        >
                          <span>
                            {dayjs(lot.plannedDate).format("DD/MM/YYYY")}
                          </span>
                          <Calendar
                            size={12}
                            className="text-base-content/45 shrink-0"
                          />
                        </button>
                        {moved && (
                          <span
                            className="mt-0.5 text-[10.5px] font-semibold text-indigo-700/90 tabular-nums leading-tight cursor-default"
                            title={`Moved from ${originalDateDisplay} (${moveDiffDays > 0 ? `+${moveDiffDays}d` : `${moveDiffDays}d`})`}
                          >
                            <span className="text-base-content/40 font-normal">Orig </span>
                            <span>{originalDateShort}</span>
                            <span className="font-bold text-indigo-600 ml-0.5">
                              ({moveDiffDays > 0 ? `+${moveDiffDays}d` : `${moveDiffDays}d`})
                            </span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* SO DUE */}
                    <td className="font-medium text-[12.5px] text-base-content/80">
                      {dayjs(lot.dueDate).format("DD/MM/YYYY")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {listDatePicker && (
            <DatePickerPopover
              lot={listDatePicker.lot}
              days={planningDays}
              anchorEl={listDatePicker.anchorEl}
              onSelectDate={(newDate) => {
                onMoveLot(listDatePicker.lot, newDate);
                setListDatePicker(null);
              }}
              onClose={() => setListDatePicker(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};
