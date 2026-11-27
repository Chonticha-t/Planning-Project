import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Info, Moon, Sun, X } from "lucide-react";
import type {
  BoardShiftAllocation,
  DayGateLoad,
  LevelingData,
  LotItem,
  MoveWarning,
} from "../types";
import {
  cellPct,
  formatMinutes,
  isMoved,
  loadStatus,
  lotKind,
} from "../utils/levelingCalculations";

interface ShiftBoardViewProps {
  data: LevelingData;
  boardGate: string;
  boardDays: DayGateLoad[];
  lotsByDate: Map<string, LotItem[]>;
  shiftAllocations: ReadonlyMap<string, BoardShiftAllocation>;
  warnings: Map<string, MoveWarning>;
  selectedLot: LotItem | null;
  onSelectLot: (lot: LotItem) => void;
  isEditMode: boolean;
  selectedLotIds: ReadonlySet<string>;
  onToggleSelection: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
  readOnly?: boolean;
  isFullscreen: boolean;
  focusedDate: string | null;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  draggedLot: LotItem | null;
  activeMovingLots: LotItem[];
  movingIds: ReadonlySet<string>;
  currentTargetDate: string | null;
  afterMustStartDates: ReadonlySet<string>;
  onDragStart: (e: React.DragEvent<HTMLElement>, lot: LotItem) => void;
  onDragEnd: () => void;
  onCardDragOver: (e: React.DragEvent<HTMLElement>, target: LotItem) => void;
  onCardDrop: (e: React.DragEvent<HTMLElement>, target: LotItem) => void;
  renderReorderIndicator: (lot: LotItem) => React.ReactNode;
  onColDragOver: (e: React.DragEvent<HTMLElement>, dayDate: string) => void;
  onColDrop: (e: React.DragEvent<HTMLElement>, dayDate: string) => void;
  onMoveLots: (lots: LotItem[], targetDate: string) => void;
}

const EMPTY_LOTS: LotItem[] = [];

const GroupCheckbox: React.FC<{
  lots: LotItem[];
  selectedLotIds: ReadonlySet<string>;
  onToggle: (lots: LotItem[]) => void;
  ariaLabel: string;
}> = ({ lots, selectedLotIds, onToggle, ariaLabel }) => {
  const allSelected =
    lots.length > 0 && lots.every((lot) => selectedLotIds.has(lot.id));

  return (
    <input
      type="checkbox"
      aria-label={ariaLabel}
      checked={allSelected}
      onClick={(e) => e.stopPropagation()}
      onChange={() => onToggle(lots)}
      className="w-3.5 h-3.5 rounded border border-base-300 text-[#4f46e5] accent-[#4f46e5] shrink-0 cursor-pointer"
    />
  );
};

const ShiftBoardViewComponent: React.FC<ShiftBoardViewProps> = ({
  data,
  boardGate,
  boardDays,
  lotsByDate,
  shiftAllocations,
  warnings,
  selectedLot,
  onSelectLot,
  isEditMode,
  selectedLotIds,
  onToggleSelection,
  onSelectionChange,
  readOnly = false,
  isFullscreen,
  focusedDate,
  scrollContainerRef,
  draggedLot,
  activeMovingLots,
  movingIds,
  currentTargetDate,
  afterMustStartDates,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onCardDrop,
  renderReorderIndicator,
  onColDragOver,
  onColDrop,
  onMoveLots,
}) => {
  const [focusedLot, setFocusedLot] = useState<{ id: string; product: string } | null>(null);

  // Clear highlight when switching gates or entering Edit mode.
  useEffect(() => {
    setFocusedLot(null);
  }, [boardGate, isEditMode]);

  // Clear highlight on Escape or clicking blank space (when detail panel is closed).
  useEffect(() => {
    if (!focusedLot || selectedLot) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-lot-id], button, a, input, select, textarea, [role='dialog']")) {
        return;
      }
      // Do not clear highlight when grabbing a horizontal or vertical scrollbar.
      const rect = target.getBoundingClientRect();
      const onHorizontalScrollbar =
        target.scrollWidth > target.clientWidth &&
        e.clientY >= rect.top + target.clientTop + target.clientHeight;
      const onVerticalScrollbar =
        target.scrollHeight > target.clientHeight &&
        e.clientX >= rect.left + target.clientLeft + target.clientWidth;
      if (onHorizontalScrollbar || onVerticalScrollbar) {
        return;
      }
      setFocusedLot(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedLot(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [focusedLot, selectedLot]);

  const highlightedProduct = isEditMode ? null : (selectedLot?.product ?? focusedLot?.product ?? null);
  const activeCardId = isEditMode ? null : (selectedLot?.id ?? focusedLot?.id ?? null);

  const focusedLotItem = useMemo(() => {
    if (isEditMode || !focusedLot || selectedLot) return null;
    for (const dayLots of lotsByDate.values()) {
      for (const lot of dayLots) {
        if (lot.id === focusedLot.id) return lot;
      }
    }
    return null;
  }, [isEditMode, focusedLot, selectedLot, lotsByDate]);

  const toggleGroupSelection = (groupLots: LotItem[]) => {
    if (groupLots.length === 0) return;
    const allSelected = groupLots.every((lot) => selectedLotIds.has(lot.id));
    const next = new Set(selectedLotIds);
    if (allSelected) {
      for (const lot of groupLots) next.delete(lot.id);
    } else {
      for (const lot of groupLots) next.add(lot.id);
    }
    onSelectionChange([...next]);
  };

  const renderLotRow = (
    lot: LotItem,
    variant: "day" | "night" | "over" | "other"
  ) => {
    const isExactSelected = activeCardId === lot.id;
    const isSameProduct =
      highlightedProduct !== null && lot.product === highlightedProduct;
    const isBatchSelected = selectedLotIds.has(lot.id);
    const moved = isMoved(lot);
    const warning = warnings.get(lot.id) ?? "none";
    const isLate = warning === "late" || warning === "order";
    const isDragging = Boolean(draggedLot) && movingIds.has(lot.id);
    const alloc = shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id);

    const shiftLeftBorder =
      variant === "day"
        ? "border-l-2 border-l-amber-400"
        : variant === "night"
        ? "border-l-2 border-l-indigo-500"
        : variant === "over"
        ? "border-l-2 border-l-rose-500"
        : "border-l-2 border-l-slate-500";

    let cardStyle = `border border-slate-300 ${shiftLeftBorder} bg-base-100 text-base-content hover:border-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`;
    if (isExactSelected) {
      cardStyle =
        "border-2 border-[#1e1b4b] bg-[#4f46e5] text-white shadow-sm";
    } else if (isSameProduct) {
      cardStyle =
        "border border-[#4f46e5] bg-[#4f46e5] text-white shadow-xs";
    } else if (isBatchSelected) {
      cardStyle =
        "border-[1.5px] border-[#4f46e5] bg-[#eef2ff] text-base-content";
    } else if (variant === "over") {
      cardStyle = `border border-slate-300 ${shiftLeftBorder} bg-base-100 text-base-content hover:border-rose-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`;
    } else if (variant === "other") {
      cardStyle = `border border-slate-300 ${shiftLeftBorder} bg-base-100 text-base-content hover:border-slate-400 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`;
    } else if (moved) {
      cardStyle = `border border-indigo-300 ${shiftLeftBorder} bg-[#eef2ff]/55 text-base-content hover:border-indigo-400`;
    } else if (isLate) {
      cardStyle = `border border-rose-300 ${shiftLeftBorder} bg-base-100 text-base-content hover:border-rose-400`;
    }

    const tooltipParts = [
      `${lot.product} · ${lot.label}`,
      lot.loadMin !== null ? `Load: ${formatMinutes(lot.loadMin)}` : null,
      alloc?.reason ? alloc.reason : null,
      moved
        ? `Moved from ${dayjs(lot.baseDate).format("DD/MM/YYYY")}`
        : null,
      isEditMode
        ? "Click to select / deselect"
        : "Click to highlight · Double-click for details",
    ].filter(Boolean);

    return (
      <div
        key={lot.id}
        className="relative shrink-0"
        onDragOver={(e) => onCardDragOver(e, lot)}
        onDrop={(e) => onCardDrop(e, lot)}
      >
        {renderReorderIndicator(lot)}
        <div
          data-lot-id={lot.id}
          data-planned-shift={alloc?.status}
          draggable={!readOnly}
          onDragStart={(e) => onDragStart(e, lot)}
          onDragEnd={onDragEnd}
          onClick={() => {
            if (isEditMode) {
              onToggleSelection(lot.id);
              return;
            }
            if (selectedLot) {
              setFocusedLot({ id: lot.id, product: lot.product });
              if (selectedLot.id !== lot.id) {
                onSelectLot(lot);
              }
              return;
            }
            setFocusedLot((prev) =>
              prev?.id === lot.id ? null : { id: lot.id, product: lot.product }
            );
          }}
          onDoubleClick={() => {
            if (isEditMode) return;
            setFocusedLot({ id: lot.id, product: lot.product });
            onSelectLot(lot);
          }}
          title={tooltipParts.join(" | ")}
          className={`group flex items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-all select-none ${
            readOnly ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
          } ${isDragging ? "opacity-45 border-dashed" : ""} ${cardStyle}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {isEditMode && (
              <input
                type="checkbox"
                aria-label={`Select ${lot.product} ${lot.label}`}
                checked={isBatchSelected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onToggleSelection(lot.id)}
                className="w-3.5 h-3.5 rounded border border-base-300 text-[#4f46e5] accent-[#4f46e5] shrink-0 cursor-pointer"
              />
            )}
            <span className="font-semibold text-[11.5px] leading-tight truncate">
              {lot.product}
            </span>
          </div>
          <span
            className={`text-[10.5px] font-mono tabular-nums shrink-0 ${
              isExactSelected
                ? "text-white font-semibold"
                : isSameProduct
                ? "text-white/85"
                : variant === "other"
                ? "text-base-content/75 font-medium"
                : "text-base-content/60"
            }`}
          >
            {lot.label}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={scrollContainerRef}
      className={`flex overflow-x-auto gap-2 pb-2 scroll-smooth min-h-[480px] ${
        isFullscreen ? "flex-1 min-h-0" : ""
      }`}
    >
      {boardDays.map((col) => {
        const colLots = lotsByDate.get(col.date) ?? EMPTY_LOTS;
        const cell = col.gates[boardGate];
        const colPct = cellPct(cell);
        const colCap = data.capacity?.[boardGate]?.[col.date];
        const colHasOt = Boolean(colCap?.hasOt);
        const isOffDay = Boolean(cell?.off) && colLots.length === 0;

        // Render holidays / closed days as a slim vertical strip
        if (isOffDay) {
          return (
            <div
              key={col.date}
              data-day-col={col.date}
              className="w-[44px] shrink-0 flex flex-col items-center py-2.5 px-1 rounded-xl border border-slate-300 bg-base-200/50 text-base-content/45 select-none"
              title={`${col.dayLabel} ${col.displayDate} — Holiday / Off`}
            >
              <span className="text-[11px] font-semibold leading-tight">
                {col.dayLabel}
              </span>
              <span className="text-[10.5px] font-medium tabular-nums mt-0.5">
                {col.displayDate}
              </span>
              <div
                className="mt-5 text-[11px] font-medium tracking-wider text-base-content/35"
                style={{ writingMode: "vertical-rl" }}
              >
                Holiday
              </div>
            </div>
          );
        }

        const status = colPct !== null ? loadStatus(colPct) : null;

        const isTargetCol =
          activeMovingLots.some((lot) => lot.plannedDate !== col.date) &&
          currentTargetDate === col.date &&
          activeMovingLots.length > 0;
        const isAfterMustStart = afterMustStartDates.has(col.date);
        const isFocusedCol = focusedDate === col.date;

        const dayLots: LotItem[] = [];
        const nightLots: LotItem[] = [];
        const overLots: LotItem[] = [];
        const otherLots: LotItem[] = [];

        let dayUsedMin = 0;
        let nightUsedMin = 0;

        for (const lot of colLots) {
          const alloc = shiftAllocations.get(lot.sourceIds?.[0] ?? lot.id);
          const shiftStatus = alloc?.status ?? "unassigned";
          if (shiftStatus === "day") {
            dayLots.push(lot);
            dayUsedMin += alloc?.dayMin ?? 0;
          } else if (shiftStatus === "night") {
            nightLots.push(lot);
            nightUsedMin += alloc?.nightMin ?? 0;
          } else if (shiftStatus === "over") {
            overLots.push(lot);
          } else {
            otherLots.push(lot);
          }
        }

        const dayCapMin = colCap?.shifts?.day?.open
          ? colCap.shifts.day.capacityMin
          : 0;
        const nightCapMin = colCap?.shifts?.night?.open
          ? colCap.shifts.night.capacityMin
          : 0;

        const actualLotCount = colLots.filter(
          (lot) => lotKind(lot) === "lot"
        ).length;
        const loadMinText = Math.round(cell?.loadMin ?? 0).toLocaleString();
        const capMinText =
          cell?.capacityMin !== null && cell?.capacityMin !== undefined
            ? Math.round(cell.capacityMin).toLocaleString()
            : "Set MC";

        const pctColorClass =
          colPct === null
            ? "text-base-content/40"
            : status === "red"
            ? "text-rose-600"
            : status === "yellow"
            ? "text-amber-600"
            : "text-emerald-600";

        const barColorClass =
          colPct === null
            ? "bg-base-300"
            : status === "red"
            ? "bg-rose-500"
            : status === "yellow"
            ? "bg-amber-500"
            : "bg-emerald-500";

        return (
          <div
            key={col.date}
            data-day-col={col.date}
            onDragOver={(e) => onColDragOver(e, col.date)}
            onDrop={(e) => onColDrop(e, col.date)}
            className={`w-[228px] shrink-0 flex flex-col rounded-xl p-2.5 transition-all ${
              isFullscreen ? "h-full" : "max-h-[680px]"
            } ${
              isTargetCol
                ? "border-[1.5px] border-dashed border-[#4f46e5] bg-[#eef2ff]/30"
                : isFocusedCol
                ? "border-2 border-[#4f46e5] bg-[#eef2ff]/20 shadow-xs"
                : isAfterMustStart
                ? "border border-rose-200 bg-[repeating-linear-gradient(-45deg,#fff8f8,#fff8f8_7px,#fee2e2_7px,#fee2e2_14px)]"
                : "border border-slate-300 bg-base-100 shadow-2xs"
            }`}
          >
            {/* Column Header */}
            <div className="pb-2 mb-2 border-b border-slate-200 shrink-0">
              <div className="flex items-center justify-between gap-1">
                <div
                  className={`flex items-center gap-1.5 min-w-0 ${
                    isEditMode && colLots.length > 0 ? "cursor-pointer select-none" : ""
                  }`}
                  onClick={() => {
                    if (isEditMode && colLots.length > 0) toggleGroupSelection(colLots);
                  }}
                  title={
                    isEditMode && colLots.length > 0
                      ? `Select all lots on ${col.dayLabel} ${col.displayDate}`
                      : undefined
                  }
                >
                  {isEditMode && colLots.length > 0 && (
                    <GroupCheckbox
                      lots={colLots}
                      selectedLotIds={selectedLotIds}
                      onToggle={toggleGroupSelection}
                      ariaLabel={`Select all lots on ${col.dayLabel} ${col.displayDate}`}
                    />
                  )}
                  <span className="text-xs font-bold text-base-content tabular-nums">
                    {col.dayLabel} {col.displayDate}
                  </span>
                  {colHasOt && (
                    <span
                      title="Overtime active"
                      className="px-1 py-0.5 rounded border border-slate-300 bg-base-200/90 text-[9.5px] font-bold text-base-content/75 leading-none"
                    >
                      OT
                    </span>
                  )}
                </div>
                <span className={`text-xs font-bold tabular-nums ${pctColorClass}`}>
                  {colPct === null ? "—" : `${colPct}%`}
                </span>
              </div>

              {/* Capacity Progress Bar */}
              <div className="h-[3px] w-full rounded-full bg-base-200 overflow-hidden mt-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                  style={{
                    width: `${colPct === null ? 0 : Math.min(100, Math.max(0, colPct))}%`,
                  }}
                />
              </div>

              {/* Lot Count & Minutes Summary */}
              <div className="text-[11px] text-base-content/55 tabular-nums mt-1.5 truncate">
                {actualLotCount} Lot · {loadMinText} / {capMinText} min
              </div>
            </div>

            {/* Scrollable Shift Sections */}
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-0.5 min-h-0 thin-scrollbar">
              {/* Day Shift Section */}
              <div className="flex flex-col gap-1">
                <div
                  onClick={() => {
                    if (isEditMode && dayLots.length > 0) toggleGroupSelection(dayLots);
                  }}
                  className={`flex items-center justify-between text-[11px] px-0.5 text-base-content/75 ${
                    isEditMode && dayLots.length > 0
                      ? "cursor-pointer select-none rounded hover:bg-base-200/60 py-0.5"
                      : ""
                  }`}
                  title={
                    isEditMode && dayLots.length > 0
                      ? `Select all Day Shift lots (${dayLots.length})`
                      : dayCapMin !== null
                      ? `Day Shift: ${Math.round(dayUsedMin).toLocaleString()} / ${Math.round(dayCapMin).toLocaleString()} min`
                      : "Day Shift capacity not set"
                  }
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {isEditMode && dayLots.length > 0 && (
                      <GroupCheckbox
                        lots={dayLots}
                        selectedLotIds={selectedLotIds}
                        onToggle={toggleGroupSelection}
                        ariaLabel={`Select all Day Shift lots on ${col.displayDate}`}
                      />
                    )}
                    <Sun size={11} className="text-amber-500 shrink-0" />
                    <span>Day Shift</span>
                  </span>
                  <span className="font-semibold tabular-nums text-base-content/55">
                    {dayLots.length} lot
                  </span>
                </div>
                {dayLots.map((lot) => renderLotRow(lot, "day"))}
              </div>

              {/* Night Shift Section */}
              <div className="flex flex-col gap-1 pt-2 border-t border-slate-200">
                <div
                  onClick={() => {
                    if (isEditMode && nightLots.length > 0) toggleGroupSelection(nightLots);
                  }}
                  className={`flex items-center justify-between text-[11px] px-0.5 text-base-content/75 ${
                    isEditMode && nightLots.length > 0
                      ? "cursor-pointer select-none rounded hover:bg-base-200/60 py-0.5"
                      : ""
                  }`}
                  title={
                    isEditMode && nightLots.length > 0
                      ? `Select all Night Shift lots (${nightLots.length})`
                      : nightCapMin !== null
                      ? `Night Shift: ${Math.round(nightUsedMin).toLocaleString()} / ${Math.round(nightCapMin).toLocaleString()} min`
                      : "Night Shift capacity not set"
                  }
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    {isEditMode && nightLots.length > 0 && (
                      <GroupCheckbox
                        lots={nightLots}
                        selectedLotIds={selectedLotIds}
                        onToggle={toggleGroupSelection}
                        ariaLabel={`Select all Night Shift lots on ${col.displayDate}`}
                      />
                    )}
                    <Moon size={11} className="text-indigo-500 shrink-0" />
                    <span>Night Shift</span>
                  </span>
                  <span className="font-semibold tabular-nums text-base-content/55">
                    {nightLots.length} lot
                  </span>
                </div>
                {nightLots.map((lot) => renderLotRow(lot, "night"))}
              </div>

              {/* Overflow Section */}
              {overLots.length > 0 && (
                <div className="flex flex-col gap-1 pt-2 border-t border-slate-200">
                  <div
                    onClick={() => {
                      if (isEditMode) toggleGroupSelection(overLots);
                    }}
                    className={`flex items-center justify-between text-[11px] px-0.5 text-rose-600 ${
                      isEditMode
                        ? "cursor-pointer select-none rounded hover:bg-rose-50/70 py-0.5"
                        : ""
                    }`}
                    title={
                      isEditMode
                        ? `Select all Overflow lots (${overLots.length})`
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      {isEditMode && (
                        <GroupCheckbox
                          lots={overLots}
                          selectedLotIds={selectedLotIds}
                          onToggle={toggleGroupSelection}
                          ariaLabel={`Select all Overflow lots on ${col.displayDate}`}
                        />
                      )}
                      <span>Overflow</span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {overLots.length} lot
                    </span>
                  </div>
                  {overLots.map((lot) => renderLotRow(lot, "over"))}
                </div>
              )}

              {/* Other / Need WIP / Pending Section */}
              {otherLots.length > 0 && (
                <div className="flex flex-col gap-1 pt-2 border-t border-slate-200">
                  <div
                    onClick={() => {
                      if (isEditMode) toggleGroupSelection(otherLots);
                    }}
                    className={`flex items-center justify-between text-[11px] px-0.5 text-base-content/75 ${
                      isEditMode
                        ? "cursor-pointer select-none rounded hover:bg-base-200/60 py-0.5"
                        : ""
                    }`}
                    title={
                      isEditMode
                        ? `Select all Other / Need WIP lots (${otherLots.length})`
                        : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold">
                      {isEditMode && (
                        <GroupCheckbox
                          lots={otherLots}
                          selectedLotIds={selectedLotIds}
                          onToggle={toggleGroupSelection}
                          ariaLabel={`Select all Other / Need WIP lots on ${col.displayDate}`}
                        />
                      )}
                      <span>Other / Need WIP</span>
                    </span>
                    <span className="font-semibold tabular-nums text-base-content/55">
                      {otherLots.length}
                    </span>
                  </div>
                  {otherLots.map((lot) => renderLotRow(lot, "other"))}
                </div>
              )}

              {/* Drop Zone Placeholder */}
              {isTargetCol && (
                <button
                  type="button"
                  onClick={() => onMoveLots(activeMovingLots, col.date)}
                  className="mt-0.5 rounded-xl border-[1.5px] border-dashed border-[#4f46e5] bg-[#eef2ff] px-2 py-2.5 text-center text-xs font-semibold text-[#4f46e5] leading-snug cursor-pointer hover:bg-indigo-100/80 transition-colors shrink-0"
                >
                  <div>Move {activeMovingLots.length} card(s) here</div>
                  <div className="tabular-nums mt-0.5">
                    {dayjs(col.date).format("DD/MM/YYYY")}
                  </div>
                </button>
              )}

              {/* After Must Out Warning */}
              {isAfterMustStart && (
                <div className="mt-1 px-1 text-center text-[11px] font-semibold text-rose-700 leading-snug shrink-0">
                  Projected completion is after must-out or overlaps another gate
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Floating action bar when a card is highlighted (makes "View Details" immediately obvious) */}
      {focusedLotItem && (
        <div
          role="region"
          aria-label="Highlighted lot actions"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2.5 rounded-full border border-slate-300 bg-base-100/95 backdrop-blur-sm pl-3.5 pr-2 py-1.5 shadow-xl text-xs"
        >
          <span className="inline-block h-2 w-2 rounded-full bg-[#4f46e5] shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-base-content truncate max-w-[180px]">
              {focusedLotItem.product}
            </span>
            <span className="rounded-md border border-slate-300 bg-base-200/80 px-2 py-0.5 font-mono text-xs font-bold tracking-wide text-base-content tabular-nums shrink-0">
              {focusedLotItem.label}
            </span>
          </div>
          <div className="h-4 w-px bg-base-300 shrink-0" />
          <button
            type="button"
            onClick={() => onSelectLot(focusedLotItem)}
            className="inline-flex items-center gap-1 rounded-full bg-[#4f46e5] hover:bg-[#4338ca] px-3 py-1 text-[11.5px] font-semibold text-white shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <Info size={12} />
            <span>View Details</span>
          </button>
          <button
            type="button"
            onClick={() => setFocusedLot(null)}
            title="Clear highlight (Esc)"
            aria-label="Clear highlight"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors cursor-pointer shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
};

export const ShiftBoardView = React.memo(ShiftBoardViewComponent);
