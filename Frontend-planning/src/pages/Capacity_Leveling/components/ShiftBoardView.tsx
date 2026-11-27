import React from "react";
import dayjs from "dayjs";
import { Moon, Sun } from "lucide-react";
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
  const highlightedProduct = selectedLot?.product ?? null;

  const renderLotRow = (
    lot: LotItem,
    variant: "day" | "night" | "over" | "other"
  ) => {
    const isExactSelected = selectedLot?.id === lot.id;
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
    if (isSameProduct) {
      cardStyle = isExactSelected
        ? "border border-[#4f46e5] bg-[#4f46e5] text-white shadow-sm ring-2 ring-[#4f46e5]/30"
        : "border border-[#4f46e5] bg-[#4f46e5] text-white shadow-xs";
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
          onClick={() => onSelectLot(lot)}
          title={tooltipParts.join(" | ")}
          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all select-none ${
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
              isSameProduct
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
                <div className="flex items-center gap-1.5 min-w-0">
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
                  className="flex items-center justify-between text-[11px] px-0.5 text-base-content/75"
                  title={
                    dayCapMin !== null
                      ? `Day Shift: ${Math.round(dayUsedMin).toLocaleString()} / ${Math.round(dayCapMin).toLocaleString()} min`
                      : "Day Shift capacity not set"
                  }
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
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
                  className="flex items-center justify-between text-[11px] px-0.5 text-base-content/75"
                  title={
                    nightCapMin !== null
                      ? `Night Shift: ${Math.round(nightUsedMin).toLocaleString()} / ${Math.round(nightCapMin).toLocaleString()} min`
                      : "Night Shift capacity not set"
                  }
                >
                  <span className="inline-flex items-center gap-1.5 font-semibold">
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
                  <div className="flex items-center justify-between text-[11px] px-0.5 text-rose-600">
                    <span className="font-semibold">Overflow</span>
                    <span className="font-semibold tabular-nums">
                      +{overLots.length}
                    </span>
                  </div>
                  {overLots.map((lot) => renderLotRow(lot, "over"))}
                </div>
              )}

              {/* Other / Need WIP / Pending Section */}
              {otherLots.length > 0 && (
                <div className="flex flex-col gap-1 pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between text-[11px] px-0.5 text-base-content/75">
                    <span className="font-semibold">Other / Need WIP</span>
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
    </div>
  );
};

export const ShiftBoardView = React.memo(ShiftBoardViewComponent);
