import React, { useCallback, useMemo, useRef, useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  ArrowUpDown,
  CalendarOff,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Calendar,
  Clock3,
  GripVertical,
  LayoutGrid,
  Moon,
  Pencil,
  Redo2,
  Search,
  Sun,
  Table,
  Undo2,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import type { BoardShiftAllocation, LotItem, DayGateLoad, GateInfo, ViewMode, Granularity, LevelingData, BoardGateStateFilter } from "../types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { boardCountLabel, lotKind, cellPct, isMoved, loadStatus, moveWarning } from "../utils/levelingCalculations";
import { ShiftBoardView } from "./ShiftBoardView";
import { DatePickerPopover } from "./DatePickerPopover";
import { MovePositionModal } from "./MovePositionModal";

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
  /** Adds or removes one card from the batch selection; must be stable for memoized cards. */
  onToggleSelection: (id: string) => void;
  onMoveLots: (lots: LotItem[], targetDate: string) => void;
  onReorderLots: (movingIds: string[], targetId: string, position: "before" | "after") => void;
  dayPositions?: ReadonlyMap<string, { position: number; total: number }>;
  onReorderToPosition?: (lot: LotItem, targetPosition: number) => void;
  draggedLot: LotItem | null;
  onDragStart: (lot: LotItem) => void;
  onDragEnd: () => void;
  onHoverTargetDate: (targetDate: string | null) => void;
  hoverTargetDate: string | null;
  activeMovingLots: LotItem[];
  activePreviewTargetDate: string | null;
  focusedDate?: string | null;
  isDraftModified?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  undoLabel?: string | null;
  redoLabel?: string | null;
  onUndo?: () => void;
  onRedo?: () => void;
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

const SHIFT_THEMES = {
  day: {
    label: "Day Shift",
    shortLabel: "D/S",
    Icon: Sun,
    badge: "bg-yellow-100 text-yellow-950 border-yellow-300",
    background: undefined,
  },
  night: {
    label: "Night Shift",
    shortLabel: "N/S",
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

const EMPTY_LOTS: LotItem[] = [];

const ReleaseBoardView: React.FC<ReleaseBoardProps> = ({
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
  onToggleSelection,
  onMoveLots,
  onReorderLots,
  dayPositions,
  onReorderToPosition,
  draggedLot,
  onDragStart,
  onDragEnd,
  onHoverTargetDate,
  hoverTargetDate,
  activeMovingLots,
  activePreviewTargetDate,
  focusedDate = null,
  readOnly = false,
  isDraftModified = false,
  canUndo = false,
  canRedo = false,
  undoLabel = null,
  redoLabel = null,
  onUndo,
  onRedo,
}) => {
  const lots = useMemo(() => rawLots.filter((lot) => !lot.passedGate), [rawLots]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const [gateStateFilter, setGateStateFilter] = useState<BoardGateStateFilter>("ALL");
  const [shiftFilter, setShiftFilter] = useState<"ALL" | BoardShiftAllocation["status"]>("ALL");

  useEffect(() => {
    if (!searchDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setSearchDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [searchDropdownOpen]);

  const searchOptions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const productCounts = new Map<string, number>();
    for (const lot of lots) {
      if (!lot.product) continue;
      productCounts.set(lot.product, (productCounts.get(lot.product) ?? 0) + 1);
    }
    const products = [...productCounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .filter(([prd]) => !q || prd.toLowerCase().includes(q))
      .map(([product, count]) => ({ product, count }));

    const matchingLots = q
      ? lots.filter((lot) => {
          const isNeedWip =
            lotKind(lot) === "need" ||
            lot.label.trim().toUpperCase() === "NEED WIP";
          return !isNeedWip && (lot.label || "").toLowerCase().includes(q);
        })
      : [];

    return { products, matchingLots };
  }, [lots, searchQuery]);

  const filteredLots = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lots.filter((lot) => {
      if (q) {
        const matchLotNo = (lot.label || "").toLowerCase().includes(q);
        const matchProduct = (lot.product || "").toLowerCase().includes(q);
        const matchItem = lot.item ? lot.item.toLowerCase().includes(q) : false;
        if (!matchLotNo && !matchProduct && !matchItem) return false;
      }

      if (gateStateFilter === "in_gate" && lot.gateState !== "in_gate") {
        return false;
      }
      if (gateStateFilter === "coming" && lot.gateState !== "coming") {
        return false;
      }
      if (gateStateFilter === "need_wip") {
        const isNeed =
          lot.gateState === "need_wip" ||
          lot.label.trim().toUpperCase() === "NEED WIP" ||
          lotKind(lot) === "need";
        if (!isNeed) return false;
      }

      if (shiftFilter !== "ALL") {
        const shiftStatus = shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id)?.status ?? "none";
        if (shiftStatus !== shiftFilter) return false;
      }

      return true;
    });
  }, [lots, searchQuery, gateStateFilter, shiftFilter, shiftAllocations]);

  const isFiltered = searchQuery.trim() !== "" || gateStateFilter !== "ALL" || shiftFilter !== "ALL";
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [hasFocusedLot, setHasFocusedLot] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hideOffDays, setHideOffDays] = useState(true);
  const [batchTargetDate, setBatchTargetDate] = useState("");
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);

  const exitEditMode = useCallback(() => {
    onSelectionChange([]);
    setBatchTargetDate("");
    setDateDropdownOpen(false);
    setIsEditMode(false);
  }, [onSelectionChange]);

  useEffect(() => {
    if (!isEditMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !dateDropdownOpen && !searchDropdownOpen) {
        exitEditMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditMode, dateDropdownOpen, searchDropdownOpen, exitEditMode]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !searchDropdownOpen && !isEditMode) setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, searchDropdownOpen, isEditMode]);

  useEffect(() => {
    if (!dateDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(e.target as Node)) {
        setDateDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDateDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [dateDropdownOpen]);
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
  const [listPositionLot, setListPositionLot] = useState<LotItem | null>(null);

  // Scroll the day column into view when a cell/day is clicked in Gate Load by Day
  useEffect(() => {
    if (!focusedDate || !scrollContainerRef.current) return;
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
    const plannedDates = new Set(filteredLots.map((lot) => lot.plannedDate));
    return visibleDays.filter(
      (col) => !col.gates[boardGate]?.off || plannedDates.has(col.date)
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

  // Cards per day and per week, built once instead of filtering every column on each render.
  const lotsByDate = useMemo(() => {
    const byDate = new Map<string, LotItem[]>();
    for (const lot of filteredLots) {
      const list = byDate.get(lot.plannedDate);
      if (list) list.push(lot);
      else byDate.set(lot.plannedDate, [lot]);
    }
    return byDate;
  }, [filteredLots]);
  const lotsByWeek = useMemo(() => {
    const weekOfDate = new Map(weekGroups.flatMap((wg) => wg.days.map((day) => [day.date, wg.id] as const)));
    const byWeek = new Map<string, LotItem[]>();
    for (const lot of filteredLots) {
      const week = weekOfDate.get(lot.plannedDate);
      if (!week) continue;
      const list = byWeek.get(week);
      if (list) list.push(lot);
      else byWeek.set(week, [lot]);
    }
    return byWeek;
  }, [filteredLots, weekGroups]);
  const warnings = useMemo(
    () => new Map(filteredLots.map((lot) => [lot.id, moveWarning(lot, lot.plannedDate, plannedIndex, data)])),
    [filteredLots, plannedIndex, data]
  );
  // Days on which a moving card would finish after must-out or overlap another gate.
  const afterMustStartDates = useMemo(() => new Set(activeMovingLots.length ? boardDays.filter((col) =>
    activeMovingLots.some((lot) => ["late", "order"].includes(moveWarning(lot, col.date, plannedIndex, data)))
  ).map((col) => col.date) : []), [activeMovingLots, boardDays, plannedIndex, data]);

  const selectedLots = useMemo(() => filteredLots.filter((lot) => selectedLotIds.has(lot.id)), [filteredLots, selectedLotIds]);
  const movingIds = useMemo(() => new Set(activeMovingLots.map((lot) => lot.id)), [activeMovingLots]);
  const planningDates = useMemo(() => new Set(planningDays.map((day) => day.date)), [planningDays]);
  const selectableLots = filteredLots;
  // Stable across selection changes so memoized cards re-render only when their own state changes.
  const toggleLotSelection = useCallback((lot: LotItem) => onToggleSelection(lot.id), [onToggleSelection]);
  const currentTargetDate = hoverTargetDate || activePreviewTargetDate;

  const scrollBoard = (dir: "left" | "right") => {
    if (!scrollContainerRef.current) return;
    const offset = dir === "left" ? -420 : 420;
    scrollContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  const handleCardDragStart = useCallback((
    e: React.DragEvent<HTMLElement>,
    lot: LotItem
  ) => {
    if (readOnly) { e.preventDefault(); return; }
    e.dataTransfer.setData("text/plain", lot.id);
    e.dataTransfer.effectAllowed = "move";

    const dragCount = selectedLotIds.has(lot.id) ? selectedLots.length : 1;
    if (dragCount > 1 && typeof document !== "undefined") {
      const wrapper = document.createElement("div");
      wrapper.style.position = "fixed";
      wrapper.style.top = "-9999px";
      wrapper.style.left = "-9999px";
      wrapper.style.padding = "12px";
      wrapper.style.pointerEvents = "none";

      const card = document.createElement("div");
      card.style.position = "relative";
      card.style.display = "flex";
      card.style.alignItems = "center";
      card.style.justifyContent = "space-between";
      card.style.gap = "10px";
      card.style.minWidth = "190px";
      card.style.maxWidth = "240px";
      card.style.padding = "6px 10px";
      card.style.borderRadius = "8px";
      card.style.border = "1.5px solid #4f46e5";
      card.style.background = "#eef2ff";
      card.style.color = "#0f172a";
      card.style.fontFamily = "system-ui, -apple-system, sans-serif";
      card.style.fontSize = "11.5px";
      card.style.fontWeight = "600";
      card.style.boxShadow = "0 6px 16px rgba(79, 70, 229, 0.22)";

      const prdSpan = document.createElement("span");
      prdSpan.textContent = lot.product;
      prdSpan.style.overflow = "hidden";
      prdSpan.style.textOverflow = "ellipsis";
      prdSpan.style.whiteSpace = "nowrap";

      const lotSpan = document.createElement("span");
      lotSpan.textContent = lot.label;
      lotSpan.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
      lotSpan.style.fontSize = "10.5px";
      lotSpan.style.color = "#475569";
      lotSpan.style.flexShrink = "0";

      const badge = document.createElement("div");
      badge.textContent = String(dragCount);
      badge.style.position = "absolute";
      badge.style.top = "-10px";
      badge.style.right = "-10px";
      badge.style.minWidth = "22px";
      badge.style.height = "22px";
      badge.style.padding = "0 6px";
      badge.style.borderRadius = "9999px";
      badge.style.background = "#4f46e5";
      badge.style.color = "#ffffff";
      badge.style.fontSize = "11px";
      badge.style.fontWeight = "700";
      badge.style.display = "flex";
      badge.style.alignItems = "center";
      badge.style.justifyContent = "center";
      badge.style.border = "2px solid #ffffff";
      badge.style.boxShadow = "0 2px 6px rgba(79, 70, 229, 0.45)";

      card.appendChild(prdSpan);
      card.appendChild(lotSpan);
      card.appendChild(badge);
      wrapper.appendChild(card);
      document.body.appendChild(wrapper);

      e.dataTransfer.setDragImage(wrapper, 28, 24);
      requestAnimationFrame(() => wrapper.remove());
    }

    onDragStart(lot);
  }, [readOnly, onDragStart, selectedLotIds, selectedLots.length]);

  const handleCardDragEnd = useCallback(() => {
    setReorderTarget(null);
    onDragEnd();
    onHoverTargetDate(null);
  }, [onDragEnd, onHoverTargetDate]);

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

  const filterControls = (
    <div className="flex items-center gap-2 min-w-0 flex-wrap sm:flex-nowrap">
      {/* Search Input with Product & Lot Dropdown */}
      <div
        ref={searchDropdownRef}
        className={`relative shrink-0 ${isFullscreen ? "w-44 2xl:w-52" : "w-48 sm:w-56"}`}
      >
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search Product / Lot..."
          value={searchQuery}
          onFocus={() => setSearchDropdownOpen(true)}
          onClick={() => setSearchDropdownOpen(true)}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setSearchDropdownOpen(true);
          }}
          className={`input input-xs input-bordered w-full pl-7 pr-7 rounded-lg h-7 text-xs placeholder:text-base-content/40 ${
            searchQuery
              ? "bg-[#eef2ff] border-indigo-300 text-[#4f46e5] font-semibold focus:bg-base-100 focus:text-base-content"
              : "bg-base-200/40 focus:bg-base-100"
          }`}
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSearchDropdownOpen(false);
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-base-content/45 hover:text-base-content cursor-pointer"
            title="Clear search"
          >
            <X size={12} />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setSearchDropdownOpen((prev) => !prev)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
            aria-label="Toggle product and lot list"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${searchDropdownOpen ? "rotate-180" : ""}`}
            />
          </button>
        )}

        {searchDropdownOpen && (
          <div className="absolute left-0 top-full z-[110] mt-1 w-64 sm:w-72 rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden">
            <ul className="max-h-80 overflow-y-auto py-1 text-xs thin-scrollbar">
              {searchOptions.products.length === 0 &&
              searchOptions.matchingLots.length === 0 ? (
                <li className="px-3 py-3 text-center text-base-content/40">
                  No matching product or lot
                </li>
              ) : (
                <>
                  {searchOptions.products.map(({ product, count }) => {
                    const isActive =
                      searchQuery.trim().toLowerCase() === product.toLowerCase();
                    return (
                      <li key={`prd-${product}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery(product);
                            setSearchDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-base-200 transition-colors cursor-pointer ${
                            isActive
                              ? "font-bold text-[#4f46e5] bg-[#eef2ff]/60"
                              : "text-base-content font-medium"
                          }`}
                        >
                          <span className="truncate">{product}</span>
                          <span className="inline-flex items-center gap-1 shrink-0">
                            <span className="text-[11px] tabular-nums text-base-content/45">
                              {count}
                            </span>
                            {isActive && (
                              <Check size={13} className="text-[#4f46e5] shrink-0" />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {searchOptions.matchingLots.slice(0, 200).map((lot) => {
                    const isNeedWip =
                      lotKind(lot) === "need" ||
                      lot.label.trim().toUpperCase() === "NEED WIP";
                    if (isNeedWip) return null;
                    const isActive =
                      searchQuery.trim().toLowerCase() === lot.label.toLowerCase();
                    return (
                      <li key={`lot-${lot.id}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery(lot.label);
                            setSearchDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-base-200 transition-colors cursor-pointer ${
                            isActive
                              ? "font-bold text-[#4f46e5] bg-[#eef2ff]/60"
                              : "text-base-content"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono font-semibold text-[11.5px] tabular-nums shrink-0">
                              {lot.label}
                            </span>
                            <span className="text-[11px] text-base-content/50 truncate">
                              {lot.product}
                            </span>
                          </div>
                          {isActive && (
                            <Check size={13} className="text-[#4f46e5] shrink-0" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </>
              )}
            </ul>
          </div>
        )}
      </div>

      {/* Status Filter */}
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

      {/* Shift Filter */}
      <select
        aria-label="Filter by shift"
        value={shiftFilter}
        onChange={(e) => setShiftFilter(e.target.value as "ALL" | BoardShiftAllocation["status"])}
        className={`select select-xs h-7 min-h-0 w-28 shrink-0 pl-2.5 pr-6 text-xs font-semibold rounded-lg border focus:outline-none cursor-pointer ${
          shiftFilter !== "ALL"
            ? "bg-[#eef2ff] border-primary text-primary"
            : "bg-base-200/40 border-base-300 text-base-content/75"
        }`}
      >
        <option value="ALL">All Shift</option>
        <option value="day">D/S (Day)</option>
        <option value="night">N/S (Night)</option>
        <option value="over">Over</option>
      </select>

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
  );

  const displayControls = (
    <div className="flex items-center gap-2 shrink-0">
      {/* Scroll Board Left/Right */}
      {activeViewMode === "board" && (
        <div className="inline-flex items-center gap-1 shrink-0">
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

      {/* Hide / Show Holidays */}
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
    </div>
  );

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[100] flex flex-col gap-2.5 p-3.5 bg-base-100 overflow-hidden shadow-2xl animate-in fade-in duration-150"
          : "flex flex-col gap-3 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs"
      }
    >
      {/* ── ROW 1: Title, Gate Switcher, Total Badge (& Filters in Fullscreen) & Primary Actions ── */}
      <div className={`flex items-center justify-between gap-2.5 pb-2.5 border-b border-base-200/80 ${isFullscreen ? "flex-wrap xl:flex-nowrap" : ""}`}>
        {/* Left: Title + Gate Switcher + Count Badge (+ Filters when Fullscreen) */}
        <div className="flex items-center gap-2.5 min-w-0 flex-wrap xl:flex-nowrap">
          {!isFullscreen && (
            <h3 className="font-bold text-sm tracking-wide text-base-content uppercase shrink-0">
              Gate Arrival Board
            </h3>
          )}

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
                    ? "bg-[#4f46e5] text-white shadow-xs"
                    : "text-base-content/70 hover:text-base-content hover:bg-base-100"
                }`}
              >
                {gate}
              </button>
            ))}
          </div>

          {/* Count Badge / Reset */}
          {isFiltered ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setGateStateFilter("ALL");
                setShiftFilter("ALL");
              }}
              className="badge badge-sm bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 text-[11px] font-semibold gap-1 cursor-pointer shrink-0"
              title="Click to reset filters"
            >
              <span>{filteredLots.length} cards</span>
              <X size={10} />
            </button>
          ) : (
            <span
              className="badge badge-sm bg-base-200 text-base-content/65 border-base-300 font-semibold tabular-nums text-[11px] shrink-0"
              title={`${pastArrivalCount > 0 ? `${pastArrivalCount} earlier arrivals. ` : ""}${beyondRangeCount > 0 ? `+${beyondRangeCount} after this period.` : ""}`}
            >
              {boardCountLabel(lots)}
            </span>
          )}

          {isFullscreen && (
            <>
              <div className="hidden xl:block h-5 w-px bg-base-300/80 shrink-0" />
              {filterControls}
            </>
          )}
        </div>

        {/* Right: (Display Controls when Fullscreen) + View Mode (Board/Table) + Edit Mode + Maximize */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap xl:flex-nowrap">
          {isFullscreen && (
            <>
              {displayControls}
              <div className="hidden xl:block h-5 w-px bg-base-300/80 shrink-0" />
            </>
          )}

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
              title="Board View (Day / Night / Overflow by day)"
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

          <button
            type="button"
            disabled={readOnly}
            aria-pressed={isEditMode}
            onClick={() => {
              if (isEditMode) {
                exitEditMode();
              } else {
                setIsEditMode(true);
              }
            }}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              isEditMode
                ? "border-primary bg-primary text-primary-content"
                : "border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200"
            }`}
          >
            {isEditMode ? <Check size={13} /> : <Pencil size={13} />}
            <span>{isEditMode ? "Done" : "Edit"}</span>
          </button>

          {/* Expand / Maximize Board Toggle */}
          <button
            type="button"
            aria-pressed={isFullscreen}
            onClick={() => setIsFullscreen((prev) => !prev)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
              isFullscreen
                ? "border-primary bg-primary text-primary-content shadow-xs"
                : "border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200"
            }`}
            title={isFullscreen ? "Exit full view (Esc)" : "Expand board to full view"}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? "Exit" : "Full"}</span>
          </button>
        </div>
      </div>

      {/* ── ROW 2: Search, Filters & Display Controls (merged into Row 1 when Fullscreen) ── */}
      {!isFullscreen && (
        <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
          {filterControls}
          {displayControls}
        </div>
      )}

      {/* Floating Bottom Bar for Edit Mode (always visible while editing, with clear exit button) */}
      {isEditMode && (
        <div
          role="region"
          aria-label="Edit mode actions"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2.5 rounded-2xl border border-slate-300 bg-base-100/95 backdrop-blur-sm px-3.5 py-2 shadow-xl text-xs max-w-[95vw]"
        >
          {/* Left: Mode / Count Badge */}
          {selectedLots.length > 0 ? (
            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-bold bg-[#4f46e5] text-white tabular-nums shadow-2xs shrink-0">
              {selectedLots.length} {selectedLots.length === 1 ? "lot" : "lots"} selected
            </span>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-block h-2 w-2 rounded-full bg-[#4f46e5]" />
              <span className="font-semibold text-base-content">Edit mode</span>
              <span className="text-base-content/55 hidden sm:inline">
                Select cards to move
              </span>
            </div>
          )}

          {/* Middle: Batch Move Controls (when cards are selected) */}
          {selectedLots.length > 0 && (
            <>
              <div className="h-5 w-px bg-base-300 shrink-0" />

              {/* Custom Aligned Date Dropdown (opens upward) */}
              <div className="relative" ref={dateDropdownRef}>
                <button
                  type="button"
                  onClick={() => setDateDropdownOpen((prev) => !prev)}
                  className="h-8 px-3 rounded-lg border border-base-300 bg-base-100 text-xs font-medium text-base-content hover:bg-base-200/60 inline-flex items-center gap-2 cursor-pointer shadow-2xs transition-colors whitespace-nowrap"
                >
                  <Calendar size={13} className="text-[#4f46e5] shrink-0" />
                  <span className="tabular-nums">
                    {batchTargetDate ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span className="font-bold text-[#4f46e5] uppercase text-[11px]">
                          {dayjs(batchTargetDate).format("ddd")}
                        </span>
                        <span>{dayjs(batchTargetDate).format("DD/MM/YYYY")}</span>
                      </span>
                    ) : (
                      "Choose target date"
                    )}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`text-base-content/40 transition-transform shrink-0 ${
                      dateDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {dateDropdownOpen && (
                  <div className="absolute right-0 bottom-full mb-2 z-[120] w-52 max-h-64 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl thin-scrollbar">
                    {planningDays.map((day) => {
                      const isSelected = batchTargetDate === day.date;
                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => {
                            setBatchTargetDate(day.date);
                            setDateDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer text-left ${
                            isSelected
                              ? "bg-[#eef2ff] text-[#4f46e5] font-bold"
                              : "text-base-content hover:bg-base-200/70"
                          }`}
                        >
                          <div className="flex items-center gap-2 tabular-nums">
                            <span
                              className={`w-9 text-[11px] font-bold uppercase shrink-0 ${
                                isSelected ? "text-[#4f46e5]" : "text-base-content/50"
                              }`}
                            >
                              {dayjs(day.date).format("ddd")}
                            </span>
                            <span className="font-mono text-xs font-semibold tracking-wide">
                              {dayjs(day.date).format("DD/MM/YYYY")}
                            </span>
                          </div>
                          {isSelected && <Check size={14} className="text-[#4f46e5] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!planningDates.has(batchTargetDate)}
                onClick={() => onMoveLots(selectedLots, batchTargetDate)}
                className="btn btn-xs h-8 px-3.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] text-white border-none text-xs font-semibold disabled:bg-base-200 disabled:text-base-content/30 cursor-pointer shadow-2xs shrink-0"
              >
                Move {selectedLots.length > 1 ? `(${selectedLots.length})` : ""}
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectionChange([]);
                  setBatchTargetDate("");
                  setDateDropdownOpen(false);
                }}
                className="btn btn-xs btn-ghost h-8 px-2.5 rounded-lg text-xs font-medium text-base-content/60 hover:text-base-content hover:bg-base-200 cursor-pointer shrink-0"
              >
                Clear
              </button>
            </>
          )}

          {isDraftModified && canUndo && (
            <>
              <div className="h-5 w-px bg-base-300 shrink-0" />

              {/* Undo / Redo curved arrow buttons */}
              <div className="inline-flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  disabled={!canUndo}
                  onClick={() => onUndo?.()}
                  title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
                  aria-label="Undo"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 text-base-content disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <Undo2 size={14} />
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  onClick={() => onRedo?.()}
                  title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)"}
                  aria-label="Redo"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 text-base-content disabled:opacity-35 disabled:pointer-events-none transition-colors cursor-pointer"
                >
                  <Redo2 size={14} />
                </button>
              </div>
            </>
          )}

          <div className="h-5 w-px bg-base-300 shrink-0" />

          {/* Right: Clear Exit Edit Mode button */}
          <button
            type="button"
            onClick={exitEditMode}
            title="Exit edit mode (Esc)"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-base-100 hover:bg-base-200 px-3 text-xs font-semibold text-base-content transition-colors cursor-pointer shrink-0"
          >
            <X size={13} />
            <span>Exit Edit</span>
          </button>
        </div>
      )}

      {/* Standalone Floating Undo / Redo Pill (when not in Edit mode, no highlight bar, and draft still has changes) */}
      {!isEditMode && !hasFocusedLot && !readOnly && isDraftModified && canUndo && (
        <div
          role="region"
          aria-label="Undo and redo actions"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[110] inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-base-100/95 backdrop-blur-sm pl-1.5 pr-3.5 py-1.5 shadow-xl max-w-[92vw]"
        >
          <div className="inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              disabled={!canUndo}
              onClick={() => onUndo?.()}
              title={undoLabel ? `Undo: ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"}
              aria-label="Undo"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-base-200 text-base-content disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Undo2 size={14} />
            </button>
            <button
              type="button"
              disabled={!canRedo}
              onClick={() => onRedo?.()}
              title={redoLabel ? `Redo: ${redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)"}
              aria-label="Redo"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-base-200 text-base-content disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
            >
              <Redo2 size={14} />
            </button>
          </div>
          {(undoLabel || redoLabel) && (
            <>
              <div className="h-4 w-px bg-base-300 shrink-0" />
              <div className="flex items-center gap-1.5 text-xs whitespace-nowrap truncate">
                <span className="text-[11px] font-medium text-base-content/55 shrink-0">
                  {canUndo ? "Undo:" : "Redo:"}
                </span>
                <span className="font-semibold text-base-content tabular-nums truncate">
                  {canUndo ? undoLabel : redoLabel}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================================================
          VIEW 1: BOARD VIEW (Day / Night / Overflow per day)
         ========================================================= */}
      {activeViewMode === "board" && (
        <ShiftBoardView
          data={data}
          boardGate={boardGate}
          boardDays={boardDays}
          lotsByDate={lotsByDate}
          shiftAllocations={shiftAllocations}
          warnings={warnings}
          selectedLot={selectedLot}
          onSelectLot={onSelectLot}
          isEditMode={isEditMode}
          selectedLotIds={selectedLotIds}
          onToggleSelection={onToggleSelection}
          onSelectionChange={onSelectionChange}
          dayPositions={dayPositions}
          readOnly={readOnly}
          isFullscreen={isFullscreen}
          focusedDate={focusedDate}
          scrollContainerRef={scrollContainerRef}
          draggedLot={draggedLot}
          activeMovingLots={activeMovingLots}
          movingIds={movingIds}
          currentTargetDate={currentTargetDate}
          afterMustStartDates={afterMustStartDates}
          onDragStart={handleCardDragStart}
          onDragEnd={handleCardDragEnd}
          onCardDragOver={handleCardDragOver}
          onCardDrop={handleCardDrop}
          renderReorderIndicator={renderReorderIndicator}
          onColDragOver={handleColDragOver}
          onColDrop={handleColDrop}
          onMoveLots={onMoveLots}
          isDraftModified={isDraftModified}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onUndo={onUndo}
          onRedo={onRedo}
          onFocusedLotChange={setHasFocusedLot}
        />
      )}

      {/* =========================================================
          VIEW 3: LIST / TABLE VIEW (Grouped by Date or Weeks)
         ========================================================= */}
      {activeViewMode === "list" && (
        <div className={`overflow-x-auto rounded-xl border border-base-300 ${isFullscreen ? "flex-1 overflow-y-auto" : ""}`}>
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
              <col style={{ width: "72px" }} />
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
                <th className="text-center">ORDER</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(granularity === "weeks"
                ? weekGroups.flatMap((wg) => {
                    const weekLots = lotsByWeek.get(wg.id) ?? EMPTY_LOTS;
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
                    const colLots = lotsByDate.get(col.date) ?? EMPTY_LOTS;
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
                      <td colSpan={11} className="!text-left px-3 py-2">
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
                      <td colSpan={11} className="!text-left px-3 py-2">
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
                      <td colSpan={11} className="!text-left px-4 py-1.5">
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
                      <td colSpan={11} className="py-2.5 px-4 text-center">
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
                    className={`group border-b border-base-300/50 hover:bg-base-200/40 text-[13px] leading-5 cursor-pointer transition-colors relative ${
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
                            className="w-3.5 h-3.5 rounded border border-base-300 text-[#4f46e5] accent-[#4f46e5] cursor-pointer"
                            aria-label={`Select ${lot.product} ${lot.label}`}
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

                    {/* ORDER */}
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      {!readOnly && onReorderToPosition && (dayPositions?.get(lot.id)?.total ?? 0) > 1 ? (
                        <button
                          type="button"
                          title={`Move position (${dayPositions?.get(lot.id)?.position}/${dayPositions?.get(lot.id)?.total})`}
                          aria-label={`Change queue position for ${lot.label}`}
                          onClick={() => setListPositionLot(lot)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-base-300 bg-base-100 text-base-content shadow-2xs hover:border-[#4f46e5] hover:bg-[#eef2ff] hover:text-[#4f46e5] transition-colors cursor-pointer"
                        >
                          <ArrowUpDown size={12} strokeWidth={2.25} />
                        </button>
                      ) : (
                        <span className="text-xs text-base-content/35">-</span>
                      )}
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
              data={data}
              plannedIndex={plannedIndex}
              anchorEl={listDatePicker.anchorEl}
              onSelectDate={(newDate) => {
                onMoveLot(listDatePicker.lot, newDate);
                setListDatePicker(null);
              }}
              onClose={() => setListDatePicker(null)}
            />
          )}

          {listPositionLot && onReorderToPosition && dayPositions?.get(listPositionLot.id) && (
            <MovePositionModal
              lot={listPositionLot}
              position={dayPositions.get(listPositionLot.id)!.position}
              total={dayPositions.get(listPositionLot.id)!.total}
              onMove={onReorderToPosition}
              onClose={() => setListPositionLot(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export const ReleaseBoard = React.memo(ReleaseBoardView);
