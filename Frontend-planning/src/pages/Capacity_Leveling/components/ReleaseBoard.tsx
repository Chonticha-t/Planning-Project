import React, { useMemo, useRef, useEffect, useState } from "react";
import dayjs from "dayjs";
import {
  LayoutGrid,
  List,
  Snowflake,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Calendar,
} from "lucide-react";
import type { LotItem, DayGateLoad, ViewMode, Granularity } from "../types";
import { LotCard } from "./LotCard";
import { DatePickerPopover } from "./DatePickerPopover";

interface ReleaseBoardProps {
  lots: LotItem[];
  gridData: DayGateLoad[];
  viewMode: ViewMode;
  onViewModeChange: (vm: ViewMode) => void;
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  selectedLot: LotItem | null;
  onSelectLot: (lot: LotItem) => void;
  onMoveLot: (lot: LotItem, targetDate: string) => void;
  draggedLot: LotItem | null;
  onDragStart: (lot: LotItem) => void;
  onDragEnd: () => void;
  onHoverTargetDate: (targetDate: string | null) => void;
  hoverTargetDate: string | null;
  activeMovingLot: LotItem | null;
  activePreviewTargetDate: string | null;
  frozenUntilDate: string;
  frozenDays: number;
  focusedDate?: string | null;
}

interface WeekGroup {
  id: string;
  title: string;
  rangeLabel: string;
  defaultTargetDate: string;
  days: DayGateLoad[];
  avgWorkPct: number;
  gateStatusDots: Record<string, "green" | "yellow" | "red">;
}

export const ReleaseBoard: React.FC<ReleaseBoardProps> = ({
  lots,
  gridData,
  viewMode,
  onViewModeChange,
  granularity,
  onGranularityChange,
  selectedLot,
  onSelectLot,
  onMoveLot,
  draggedLot,
  onDragStart,
  onDragEnd,
  onHoverTargetDate,
  hoverTargetDate,
  activeMovingLot,
  activePreviewTargetDate,
  frozenUntilDate,
  frozenDays,
  focusedDate = null,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [listDatePicker, setListDatePicker] = useState<{
    lot: LotItem;
    anchorEl: HTMLElement;
  } | null>(null);
  const [expandedDayCols, setExpandedDayCols] = useState<
    Record<string, boolean>
  >({});
  const MAX_VISIBLE_CARDS_PER_DAY = 5;

  // On initial mount in Board/Days view, position scroll at 10/11 (1 week ahead)
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const col10 = scrollContainerRef.current.querySelector<HTMLElement>(
      '[data-day-col="2026-11-10"]'
    );
    if (col10) {
      scrollContainerRef.current.scrollLeft = Math.max(0, col10.offsetLeft - 8);
    }
  }, []);

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

  // All non-Sunday planning days after frozen zone (scrollable horizontally)
  const planningDays = useMemo(
    () =>
      gridData.filter(
        (d) =>
          !d.isFrozen &&
          !d.isSunday &&
          dayjs(d.date).isAfter(dayjs(frozenUntilDate))
      ),
    [gridData, frozenUntilDate]
  );

  const frozenRangeLabel = useMemo(() => {
    if (frozenDays <= 0) return "";
    const endDisplay = dayjs(frozenUntilDate).format("DD/MM");
    return `03–${endDisplay}`;
  }, [frozenDays, frozenUntilDate]);

  // Weekly groups when granularity === "weeks"
  const weekGroups = useMemo<WeekGroup[]>(() => {
    const defs = [
      {
        id: "W1",
        title: "WEEK 1",
        rangeLabel: "03/11 – 07/11",
        start: "2026-11-03",
        end: "2026-11-07",
        defaultTargetDate: "2026-11-05",
      },
      {
        id: "W2",
        title: "WEEK 2",
        rangeLabel: "10/11 – 14/11",
        start: "2026-11-10",
        end: "2026-11-14",
        defaultTargetDate: "2026-11-13",
      },
      {
        id: "W3",
        title: "WEEK 3",
        rangeLabel: "16/11 – 21/11",
        start: "2026-11-16",
        end: "2026-11-21",
        defaultTargetDate: "2026-11-17",
      },
      {
        id: "W4",
        title: "WEEK 4",
        rangeLabel: "23/11 – 26/11",
        start: "2026-11-23",
        end: "2026-11-26",
        defaultTargetDate: "2026-11-24",
      },
    ];

    return defs.map((w) => {
      const days = gridData.filter(
        (d) =>
          !d.isSunday &&
          !dayjs(d.date).isBefore(dayjs(w.start)) &&
          !dayjs(d.date).isAfter(dayjs(w.end))
      );
      const avgWorkPct =
        days.length > 0
          ? Math.round(
              days.reduce((sum, d) => sum + d.totalNewWorkPct, 0) / days.length
            )
          : 0;

      const gateStatusDots: Record<string, "green" | "yellow" | "red"> = {
        FFPC: "green",
        FVAC: "green",
        FADL: "green",
        FIN: "green",
        WH: "green",
      };
      for (const gId of ["FFPC", "FVAC", "FADL", "FIN", "WH"]) {
        if (days.some((d) => d.gateStatusDots[gId] === "red")) {
          gateStatusDots[gId] = "red";
        } else if (days.some((d) => d.gateStatusDots[gId] === "yellow")) {
          gateStatusDots[gId] = "yellow";
        }
      }

      return {
        id: w.id,
        title: w.title,
        rangeLabel: w.rangeLabel,
        defaultTargetDate: w.defaultTargetDate,
        days,
        avgWorkPct,
        gateStatusDots,
      };
    });
  }, [gridData]);

  const currentMovingLot = draggedLot || activeMovingLot;
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
    if (draggedLot) {
      onMoveLot(draggedLot, dayDate);
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
            Release Board
          </h3>
          <span className="badge badge-sm bg-base-200 text-base-content/70 border-base-300 font-semibold tabular-nums">
            {lots.length} lots
          </span>
        </div>

        {/* Right Switchers & Scroll Controls */}
        <div className="flex items-center gap-2">
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

      {/* =========================================================
          VIEW 1: BOARD VIEW — DAYS (Horizontally Scrollable across ALL planning days)
         ========================================================= */}
      {viewMode === "board" && granularity === "days" && (
        <div
          ref={scrollContainerRef}
          className="flex gap-2 overflow-x-auto pb-2 min-h-[480px] scroll-smooth"
        >
          {/* Left Edge: Frozen Striped Bar (shown when frozenDays > 0) */}
          {frozenDays > 0 && (
            <div
              className="w-[38px] shrink-0 rounded-xl border border-base-300 bg-[repeating-linear-gradient(-45deg,#f8fafc,#f8fafc_6px,#eef2f6_6px,#eef2f6_12px)] flex items-center justify-center select-none"
              title={`First ${frozenDays} days (${frozenRangeLabel}) are frozen for production`}
            >
              <div className="-rotate-90 whitespace-nowrap text-xs font-semibold text-base-content/50 tracking-wide flex items-center gap-1.5">
                <Snowflake size={12} className="text-sky-500 shrink-0" />
                <span>
                  FROZEN ({frozenDays}d) · {frozenRangeLabel}
                </span>
              </div>
            </div>
          )}

          {/* Scrollable Day Columns for ALL planning days */}
          {planningDays.map((col) => {
            const colLots = lots.filter((l) => l.releaseDate === col.date);
            const isDayExpanded = Boolean(expandedDayCols[col.date]);
            const visibleLots = isDayExpanded
              ? colLots
              : colLots.slice(0, MAX_VISIBLE_CARDS_PER_DAY);
            const hiddenLotsCount = Math.max(
              0,
              colLots.length - visibleLots.length
            );

            const isTargetCol =
              currentMovingLot &&
              currentTargetDate === col.date &&
              currentMovingLot.releaseDate !== col.date;
            const isAfterMustStart =
              currentMovingLot &&
              dayjs(col.date).isAfter(dayjs(currentMovingLot.mustStartDate));

            const isFocusedCol = focusedDate === col.date;

            return (
              <div
                key={col.date}
                data-day-col={col.date}
                onDragOver={(e) => handleColDragOver(e, col.date)}
                onDrop={(e) => handleColDrop(e, col.date)}
                className={`w-[162px] shrink-0 flex flex-col max-h-[580px] rounded-xl p-2 transition-all ${
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
                      <div className="text-xs font-bold text-base-content tabular-nums mt-0.5 flex items-center gap-1">
                        <span>{col.displayDate}</span>
                        {colLots.length > 0 && (
                          <span className="px-1.5 py-0 rounded bg-base-200 text-[10px] font-semibold text-base-content/60">
                            {colLots.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        col.totalNewWorkPct >= 80
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {col.totalNewWorkPct}%
                    </span>
                  </div>

                  {/* 5 Gate Status Bars */}
                  <div className="grid grid-cols-5 gap-1 mt-2">
                    {["FFPC", "FVAC", "FADL", "FIN", "WH"].map((gId) => {
                      const status = col.gateStatusDots[gId] || "green";
                      let barColor = "bg-emerald-500";
                      if (status === "red") barColor = "bg-rose-500";
                      else if (status === "yellow") barColor = "bg-amber-400";

                      return (
                        <span
                          key={gId}
                          className={`h-[4px] rounded-full ${barColor}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Internally Scrollable Column Cards Body */}
                <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-0.5 min-h-0">
                  {visibleLots.map((lot) => {
                    const isThisMovingPreview =
                      currentMovingLot?.id === lot.id &&
                      Boolean(currentTargetDate) &&
                      currentTargetDate !== lot.releaseDate;

                    return (
                      <LotCard
                        key={lot.id}
                        lot={lot}
                        isSelected={selectedLot?.id === lot.id}
                        isBeingDragged={draggedLot?.id === lot.id}
                        isMovingPreview={isThisMovingPreview}
                        previewTargetDate={
                          isThisMovingPreview ? currentTargetDate : null
                        }
                        frozenUntilDate={frozenUntilDate}
                        onSelect={onSelectLot}
                        onDragStart={handleCardDragStart}
                        onDragEnd={handleCardDragEnd}
                        onDateChange={onMoveLot}
                      />
                    );
                  })}

                  {/* Show More / Collapse Toggle Button when a day has > 3 lots */}
                  {colLots.length > MAX_VISIBLE_CARDS_PER_DAY && (
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
                          <span>+{hiddenLotsCount} more lot(s)</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Dashed Drop Zone Placeholder */}
                  {isTargetCol && currentMovingLot && (
                    <div
                      onClick={() => onMoveLot(currentMovingLot, col.date)}
                      className="mt-0.5 rounded-xl border-[1.5px] border-dashed border-[#4f46e5] bg-[#eef2ff] px-2 py-3 text-center text-xs font-semibold text-[#4f46e5] leading-snug cursor-pointer hover:bg-indigo-100/80 transition-colors shrink-0"
                    >
                      <div>Drop here</div>
                      <div className="tabular-nums mt-0.5">
                        FFPC{" "}
                        {dayjs(currentMovingLot.releaseDate).format("DD/MM")}
                      </div>
                      <div className="tabular-nums">→ 68%</div>
                    </div>
                  )}

                  {/* After Must Start Warning Text */}
                  {isAfterMustStart && (
                    <div className="mt-2 px-1 text-center text-[11px] font-semibold text-rose-700 leading-snug shrink-0">
                      after Must start of the dragged lot
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
          {frozenDays > 0 && (
            <div
              className="w-[44px] shrink-0 rounded-xl border border-base-300 bg-[repeating-linear-gradient(-45deg,#f8fafc,#f8fafc_6px,#eef2f6_6px,#eef2f6_12px)] flex items-center justify-center select-none"
              title={`First ${frozenDays} days (${frozenRangeLabel}) are frozen`}
            >
              <div className="-rotate-90 whitespace-nowrap text-xs font-semibold text-base-content/50 tracking-wide flex items-center gap-1.5">
                <Snowflake size={12} className="text-sky-500 shrink-0" />
                <span>
                  FROZEN ({frozenDays}d) · {frozenRangeLabel}
                </span>
              </div>
            </div>
          )}

          {/* 3 Week Columns (Week 2, Week 3, Week 4) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            {weekGroups.map((wg) => {
              const weekDates = new Set(wg.days.map((d) => d.date));
              const weekLots = lots.filter((l) => weekDates.has(l.releaseDate));
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
                            wg.avgWorkPct >= 80
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          Avg {wg.avgWorkPct}%
                        </span>
                        <div className="text-[11px] text-base-content/50 mt-0.5 tabular-nums">
                          {weekLots.length} lots
                        </div>
                      </div>
                    </div>

                    {/* 5 Gate Status Bars */}
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      {["FFPC", "FVAC", "FADL", "FIN", "WH"].map((gId) => {
                        const status = wg.gateStatusDots[gId] || "green";
                        let barColor = "bg-emerald-500";
                        if (status === "red") barColor = "bg-rose-500";
                        else if (status === "yellow") barColor = "bg-amber-400";

                        return (
                          <div key={gId} className="flex flex-col gap-0.5">
                            <span
                              className={`h-[4px] rounded-full ${barColor}`}
                            />
                            <span className="text-[9.5px] font-semibold text-base-content/45 text-center">
                              {gId === "WH" ? "W/H" : gId}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Week Lots Grid (2 columns of cards per week) */}
                  <div className="grid grid-cols-2 gap-2">
                    {weekLots.map((lot) => (
                      <LotCard
                        key={lot.id}
                        lot={lot}
                        isSelected={selectedLot?.id === lot.id}
                        isBeingDragged={draggedLot?.id === lot.id}
                        isMovingPreview={false}
                        previewTargetDate={null}
                        frozenUntilDate={frozenUntilDate}
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
                <th>LOT / PO</th>
                <th>QUANTITY</th>
                <th>ROUTE</th>
                <th>SYSTEM START</th>
                <th>MUST START</th>
                <th>RELEASE DATE</th>
                <th>SLACK</th>
                <th>STATUS</th>
                <th>SHIP P1</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(granularity === "weeks"
                ? weekGroups.flatMap((wg) => {
                    const weekDates = new Set(wg.days.map((d) => d.date));
                    const weekLots = lots.filter((l) =>
                      weekDates.has(l.releaseDate)
                    );
                    if (weekLots.length === 0) return [];
                    const totalPcs = weekLots.reduce((s, l) => s + l.qty, 0);
                    return [
                      {
                        type: "header" as const,
                        wg,
                        count: weekLots.length,
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
                              lots
                            </span>
                            <span className="text-base-content/30">·</span>
                            <span>
                              <strong className="font-bold text-base-content">
                                {item.totalPcs.toLocaleString()}
                              </strong>{" "}
                              pcs
                            </span>
                            <span className="text-base-content/30">·</span>
                            <span>
                              Avg load{" "}
                              <strong className="font-bold text-base-content">
                                {item.wg.avgWorkPct}%
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
                const isLate = dayjs(lot.releaseDate).isAfter(
                  dayjs(lot.mustStartDate)
                );
                const isMoved =
                  lot.releaseDate !== lot.initialReleaseDate ||
                  Boolean(lot.wasDate);
                const slackDays = dayjs(lot.mustStartDate).diff(
                  dayjs(lot.releaseDate),
                  "day"
                );
                const sheets = Math.ceil(lot.qty / 12);
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
                      <span className="font-semibold text-[14px] text-base-content">
                        {lot.product}
                      </span>
                    </td>

                    {/* LOT / PO */}
                    <td>
                      <span className="font-mono font-bold text-[14px] tracking-wide tabular-nums text-base-content select-all">
                        {lot.id}
                      </span>
                    </td>

                    {/* QUANTITY (pcs + sheets) */}
                    <td>
                      <div className="flex flex-col items-center leading-tight">
                        <span className="font-bold text-[13.5px] text-base-content">
                          {lot.qty.toLocaleString()} pcs
                        </span>
                        <span className="text-[11px] font-medium text-base-content/50">
                          {sheets.toLocaleString()} sheets
                        </span>
                      </div>
                    </td>

                    {/* ROUTE */}
                    <td>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-600 text-[11px] font-semibold tracking-wide uppercase leading-none">
                        {lot.routeId.replace(/_/g, " ")}
                      </span>
                    </td>

                    {/* SYSTEM START */}
                    <td className="font-medium text-[13px] text-base-content/80">
                      {dayjs(lot.systemStartDate).format("DD/MM/YYYY")}
                    </td>

                    {/* MUST START */}
                    <td className="font-medium text-[13px] text-base-content/80">
                      {dayjs(lot.mustStartDate).format("DD/MM/YYYY")}
                    </td>

                    {/* RELEASE DATE (Opens Custom DatePickerPopover) */}
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
                          {dayjs(lot.releaseDate).format("DD/MM/YYYY")}
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
                          slackDays < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {slackDays >= 0 ? `+${slackDays}d` : `${slackDays}d`}
                      </span>
                    </td>

                    {/* STATUS (Rectangular badge matching GateActionTable) */}
                    <td>
                      {isLate ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11.5px] font-semibold text-rose-700 leading-none">
                          <AlertCircle size={11} />
                          Late
                        </span>
                      ) : isMoved ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-[#eef2ff] px-2 py-1 text-[11.5px] font-semibold text-[#4f46e5] leading-none">
                          Moved (was{" "}
                          {lot.wasDate ||
                            dayjs(lot.initialReleaseDate).format("DD/MM")}
                          )
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11.5px] font-semibold text-emerald-700 leading-none">
                          <CheckCircle2 size={11} />
                          Fits
                        </span>
                      )}
                    </td>

                    {/* SHIP P1 */}
                    <td className="font-medium text-[13px] text-base-content/80">
                      {lot.shipDate}/2026
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {listDatePicker && (
            <DatePickerPopover
              lot={listDatePicker.lot}
              frozenUntilDate={frozenUntilDate}
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
