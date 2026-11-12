import React, { useMemo, useRef, useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  LayoutGrid,
  List,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
  Pencil,
} from "lucide-react";
import type { BoardShiftAllocation, LotItem, DayGateLoad, GateInfo, ViewMode, Granularity, LevelingData } from "../types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { boardCountLabel, lotKind, cellPct, isMoved, loadStatus, moveWarning, occupancyWindow, WARNING_TEXT } from "../utils/levelingCalculations";
import { LotCard } from "./LotCard";
import { DatePickerPopover } from "./DatePickerPopover";

interface ReleaseBoardProps {
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
  onViewModeChange: (vm: ViewMode) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  selectedLot: LotItem | null;
  onSelectLot: (lot: LotItem) => void;
  onMoveLot: (lot: LotItem, targetDate: string) => void;
  selectedLotIds: ReadonlySet<string>;
  onSelectionChange: (ids: string[]) => void;
  onMoveLots: (lots: LotItem[], targetDate: string) => void;
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

export const ReleaseBoard: React.FC<ReleaseBoardProps> = ({
  data,
  gates,
  boardGate,
  onBoardGateChange,
  lots,
  shiftAllocations,
  beyondRangeCount,
  pastArrivalCount,
  gridData,
  today,
  plannedIndex,
  viewMode,
  onViewModeChange,
  granularity,
  onGranularityChange,
  selectedLot,
  onSelectLot,
  onMoveLot,
  selectedLotIds,
  onSelectionChange,
  onMoveLots,
  draggedLot,
  onDragStart,
  onDragEnd,
  onHoverTargetDate,
  hoverTargetDate,
  activeMovingLots,
  activePreviewTargetDate,
  focusedDate = null,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [batchTargetDate, setBatchTargetDate] = useState("");
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

  const selectedLots = lots.filter((lot) => selectedLotIds.has(lot.id));
  const movingIds = new Set(activeMovingLots.map((lot) => lot.id));
  const planningDates = new Set(planningDays.map((day) => day.date));
  const selectableLots = lots;
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
    e.dataTransfer.setData("text/plain", lot.id);
    e.dataTransfer.effectAllowed = "move";
    onDragStart(lot);
  };

  const handleCardDragEnd = () => {
    onDragEnd();
    onHoverTargetDate(null);
  };

  const handleColDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    dayDate: string
  ) => {
    if (!planningDates.has(dayDate)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverTargetDate !== dayDate) {
      onHoverTargetDate(dayDate);
    }
  };

  const handleColDrop = (
    e: React.DragEvent<HTMLDivElement>,
    dayDate: string
  ) => {
    e.preventDefault();
    if (draggedLot && planningDates.has(dayDate)) {
      onMoveLots(selectedLotIds.has(draggedLot.id) ? selectedLots : [draggedLot], dayDate);
    }
    onDragEnd();
    onHoverTargetDate(null);
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Persistent Header Bar with List/Board, Days/Weeks & Horizontal Scroll Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">
            Gate Arrival Board
          </h3>
          {/* One gate at a time: moving a card changes this gate's date only */}
          <div role="group" aria-label="Gate shown on the board"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5">
            {gates.map(({ gate }) => (
              <button key={gate} type="button" aria-pressed={boardGate === gate}
                onClick={() => onBoardGateChange(gate)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer ${
                  boardGate === gate
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-base-content/70 hover:text-base-content hover:bg-base-100"
                }`}>
                {gate}
              </button>
            ))}
          </div>
          <span className="badge badge-sm bg-base-200 text-base-content/70 border-base-300 font-semibold tabular-nums">
            {boardCountLabel(lots)}
          </span>
          {pastArrivalCount > 0 && (
            <span className="text-[11px] text-base-content/50" title="Historical arrivals remain on their source dates and are not moved to today.">{pastArrivalCount} earlier arrival card(s)</span>
          )}
          {beyondRangeCount > 0 && (
            <span className="text-[11px] text-base-content/50 tabular-nums"
              title="These cards are planned after the last day shown.">
              +{beyondRangeCount} after this period
            </span>
          )}
          {isEditMode && <button type="button"
            onClick={() => onSelectionChange(selectableLots.map((lot) => lot.id))}
            disabled={selectableLots.length === 0}
            className="btn btn-xs btn-ghost text-xs">
            Select all cards
          </button>}
        </div>

        {/* Right Switchers & Scroll Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {viewMode === "board" && granularity === "days" && (
            <div className="inline-flex items-center gap-1 mr-1">
              <button
                type="button"
                onClick={() => scrollBoard("left")}
                className="btn btn-xs btn-square h-7 w-7 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-base-content/70"
                title="Scroll board left"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => scrollBoard("right")}
                className="btn btn-xs btn-square h-7 w-7 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-base-content/70"
                title="Scroll board right"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}

          <button type="button" aria-pressed={isEditMode}
            onClick={() => {
              if (isEditMode) {
                onSelectionChange([]);
                setBatchTargetDate("");
              }
              setIsEditMode((prev) => !prev);
            }}
            className={`inline-flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors cursor-pointer ${
              isEditMode ? "border-primary bg-primary text-primary-content" : "border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200"
            }`}>
            <Pencil size={13} />
            Edit
          </button>

          {/* List / Board Toggle */}
          <div
            role="group"
            aria-label="View mode"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5"
          >
            <button
              type="button"
              aria-pressed={viewMode === "list"}
              onClick={() => onViewModeChange("list")}
              className={`rounded-md px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "list"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/70 hover:text-base-content hover:bg-base-100"
              }`}
            >
              <List size={13} />
              <span>List</span>
            </button>
            <button
              type="button"
              aria-pressed={viewMode === "board"}
              onClick={() => onViewModeChange("board")}
              className={`rounded-md px-3 py-1 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                viewMode === "board"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/70 hover:text-base-content hover:bg-base-100"
              }`}
            >
              <LayoutGrid size={13} />
              <span>Board</span>
            </button>
          </div>

          {viewMode === "board" && (
            <div role="group" aria-label="Board size"
              className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5">
              {([
                { label: "Normal", compact: false },
                { label: "Compact", compact: true },
              ] as const).map((option) => (
                <button key={option.label} type="button"
                  aria-pressed={isCompact === option.compact}
                  onClick={() => setIsCompact(option.compact)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                    isCompact === option.compact
                      ? "bg-primary text-primary-content shadow-xs"
                      : "text-base-content/70 hover:text-base-content hover:bg-base-100"
                  }`}>
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Days / Weeks Toggle */}
          <div
            role="group"
            aria-label="Granularity"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/70 p-0.5"
          >
            <button
              type="button"
              aria-pressed={granularity === "days"}
              onClick={() => onGranularityChange("days")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                granularity === "days"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/70 hover:text-base-content hover:bg-base-100"
              }`}
            >
              Days
            </button>
            <button
              type="button"
              aria-pressed={granularity === "weeks"}
              onClick={() => onGranularityChange("weeks")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all cursor-pointer ${
                granularity === "weeks"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/70 hover:text-base-content hover:bg-base-100"
              }`}
            >
              Weeks
            </button>
          </div>
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
      {viewMode === "board" && granularity === "days" && (
        <div
          ref={scrollContainerRef}
          className={`flex overflow-x-auto pb-2 scroll-smooth ${isCompact ? "gap-1.5 min-h-[400px]" : "gap-2 min-h-[480px]"}`}
        >
          {/* Scrollable Day Columns for ALL planning days */}
          {visibleDays.map((col) => {
            const colLots = lots.filter((l) => l.plannedDate === col.date);
            const colPct = cellPct(col.gates[boardGate]);
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
                      <div className="text-[10.5px] font-semibold uppercase text-base-content/50">
                        {col.dayLabel}
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
                      <LotCard
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
      {viewMode === "board" && granularity === "weeks" && (
        <div className="flex gap-3 overflow-x-auto min-h-[480px]">
          {/* One column per calendar week */}
          <div className={`grid grid-cols-1 gap-3 flex-1 ${isCompact ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2 xl:grid-cols-3"}`}>
            {weekGroups.map((wg) => {
              const weekDates = new Set(wg.days.map((d) => d.date));
              const weekLots = lots.filter((l) => weekDates.has(l.plannedDate));
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
                      <LotCard
                        key={lot.id}
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
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================
          VIEW 3: LIST VIEW (Days or Weeks) — Styled like GateActionTable
         ========================================================= */}
      {viewMode === "list" && (
        <div className="overflow-x-auto rounded-xl border border-base-300">
          <table className="table table-sm table-fixed w-full min-w-[980px] text-center border-collapse [&_th]:text-center [&_td]:text-center [&_td:first-child:not([colspan])]:text-left [&_th:first-child]:text-left [&_th]:px-3 [&_th]:py-2.5 [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2 [&_td]:align-middle [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-base-300 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-base-300/60">
            <colgroup>
              <col style={{ width: "128px" }} />
              <col style={{ width: "105px" }} />
              <col style={{ width: "126px" }} />
              <col style={{ width: "118px" }} />
              <col style={{ width: "102px" }} />
              <col style={{ width: "102px" }} />
              <col style={{ width: "136px" }} />
              <col style={{ width: "74px" }} />
              <col style={{ width: "134px" }} />
              <col style={{ width: "86px" }} />
            </colgroup>
            <thead>
              <tr className="bg-base-200/70 border-b border-base-300 text-[12px] font-bold tracking-[0.04em] text-base-content">
                <th>PRODUCT NAME</th>
                <th>LOT</th>
                <th>QUANTITY</th>
                <th>EST. LOAD</th>
                <th>ARRIVE BY</th>
                <th>MUST OUT</th>
                <th>{boardGate} DATE</th>
                <th>SLACK</th>
                <th>STATUS</th>
                <th>PO DUE</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(granularity === "weeks"
                ? weekGroups.flatMap((wg) => {
                    const weekDates = new Set(wg.days.map((d) => d.date));
                    const weekLots = lots.filter((l) =>
                      weekDates.has(l.plannedDate)
                    );
                    if (weekLots.length === 0) return [];
                    const totalPcs = weekLots.some((lot) => lot.qty === null) ? null : weekLots.reduce((sum, lot) => sum + (lot.qty ?? 0), 0);
                    return [
                      {
                        type: "header" as const,
                        wg,
                        count: boardCountLabel(weekLots),
                        totalPcs,
                      },
                      ...weekLots.map((lot) => ({ type: "row" as const, lot })),
                    ];
                  })
                : lots.map((lot) => ({ type: "row" as const, lot }))
              ).map((item) => {
                if (item.type === "header") {
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

                const { lot } = item;
                const isSelected = selectedLot?.id === lot.id;
                const warning = moveWarning(lot, lot.plannedDate, plannedIndex, data);
                const isLate = warning === "late" || warning === "order";
                const moved = isMoved(lot);
                const projectedEnd = occupancyWindow(data, lot)?.endDate;
                const slackDays = projectedEnd && lot.mustOut ? dayjs(lot.mustOut).diff(dayjs(projectedEnd), "day") : null;
                const isPickerOpen = listDatePicker?.lot.id === lot.id;

                return (
                  <tr
                    key={lot.id}
                    onClick={() => onSelectLot(lot)}
                    className={`border-b border-base-300/50 hover:bg-base-200/40 text-[13.5px] leading-5 cursor-pointer transition-colors ${
                      isSelected ? "bg-[#eef2ff]/60" : ""
                    }`}
                  >
                    {/* PRODUCT NAME */}
                    <td>
                      <div className="flex items-center gap-2">
                        {isEditMode && <input type="checkbox" className="checkbox checkbox-xs checkbox-primary"
                          aria-label={`Select ${lot.label} ${lot.product}`} checked={selectedLotIds.has(lot.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleLotSelection(lot)} />}
                      <span className="font-semibold text-[14px] text-base-content">
                        {lot.product}
                      </span>
                      </div>
                    </td>

                    {/* LOT */}
                    <td>
                      <span className="font-mono font-bold text-[13px] tracking-wide tabular-nums text-base-content select-all">
                        {lot.label}
                      </span>
                    </td>

                    {/* QUANTITY (pcs + sheets) */}
                    <td>
                      <div className="flex flex-col items-center leading-tight">
                        <span className="font-bold text-[13.5px] text-base-content">
                          {formatGateQuantity(lot.qty, "piece")} pcs
                        </span>
                        {lot.sheets !== null && (
                          <span className="text-[11px] font-medium text-base-content/50">
                            {formatGateQuantity(lot.sheets, "sheet")} sheets
                          </span>
                        )}
                      </div>
                    </td>

                    {/* EST. LOAD */}
                    <td>
                      {lot.loadMin === null ? (
                        <span className="text-[11.5px] font-semibold text-amber-700" title="Check gate lead time and normal shift minutes">
                          Check plan
                        </span>
                      ) : (
                        <span className="font-medium text-[13px] text-base-content/80"
                          title={`${lot.leadDays} planning day(s), arrival ${occupancyWindow(data, lot)?.startDate ?? "unknown"}; normal minutes exclude OT`}>
                          {Math.round(lot.loadMin).toLocaleString()} min/arrival lot
                        </span>
                      )}
                    </td>

                    {/* ARRIVE BY */}
                    <td className="font-medium text-[13px] text-base-content/80">
                      {lot.arriveBy ? dayjs(lot.arriveBy).format("DD/MM/YYYY") : "-"}
                    </td>

                    {/* MUST OUT */}
                    <td className="font-medium text-[13px] text-base-content/80">
                      {dayjs(lot.mustOut).format("DD/MM/YYYY")}
                    </td>

                    {/* DATE AT THIS GATE (opens the date picker) */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => {
                          if (isPickerOpen) {
                            setListDatePicker(null);
                          } else {
                            setListDatePicker({
                              lot,
                              anchorEl: e.currentTarget,
                            });
                          }
                        }}
                        className={`inline-flex items-center justify-between gap-2 h-7 px-2.5 rounded-lg border text-xs font-semibold tabular-nums transition-colors cursor-pointer ${
                          isPickerOpen
                            ? "border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
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
                    </td>

                    {/* SLACK */}
                    <td>
                      <span
                        className={`font-bold text-[13px] ${
                          slackDays !== null && slackDays < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {slackDays === null ? "N/A" : slackDays >= 0 ? `+${slackDays}d` : `${slackDays}d`}
                      </span>
                    </td>

                    {/* STATUS (Rectangular badge matching GateActionTable) */}
                    <td>
                      {isLate ? (
                        <span title={WARNING_TEXT[warning as "late" | "order"]}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px] font-semibold leading-none ${
                            warning === "order" ? "border-rose-400 bg-rose-100 text-rose-800" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                          <AlertCircle size={11} />
                          {warning === "order" ? "Gate order" : "Late"}
                        </span>
                      ) : warning === "early" ? (
                        <span title={WARNING_TEXT.early}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11.5px] font-semibold text-amber-800 leading-none">
                          <AlertCircle size={11} />
                          Early
                        </span>
                      ) : moved ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-[#eef2ff] px-2 py-1 text-[11.5px] font-semibold text-[#4f46e5] leading-none">
                          Moved (was {dayjs(lot.baseDate).format("DD/MM")})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11.5px] font-semibold text-emerald-700 leading-none">
                          <CheckCircle2 size={11} />
                          Fits
                        </span>
                      )}
                    </td>

                    {/* PO DUE */}
                    <td className="font-medium text-[13px] text-base-content/80">
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
