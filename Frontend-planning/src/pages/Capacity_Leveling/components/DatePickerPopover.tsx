import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import type { DayGateLoad, LotItem } from "../types";

interface DatePickerPopoverProps {
  lot: LotItem;
  /** Days on which this card's gate is open (today onward) */
  days: DayGateLoad[];
  anchorEl: HTMLElement | null;
  onSelectDate: (targetDate: string) => void;
  onClose: () => void;
}

const computePopoverCoords = (anchorEl: HTMLElement | null) => {
  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  const popWidth = 264;
  const popHeight = 345;
  const margin = 12;

  let top = rect.bottom + 6;
  if (top + popHeight > window.innerHeight - margin) {
    top = Math.max(margin, rect.top - popHeight - 6);
  }

  let left = rect.left;
  if (left + popWidth > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popWidth - margin);
  }

  return { top, left };
};

export const DatePickerPopover: React.FC<DatePickerPopoverProps> = ({
  lot,
  days,
  anchorEl,
  onSelectDate,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(lot.plannedDate);

  // Re-compute on window scroll/resize
  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);
    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, []);

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        anchorEl &&
        !anchorEl.contains(target)
      ) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorEl, onClose]);

  const coords = computePopoverCoords(anchorEl);
  if (!coords || days.length === 0) return null;

  const openDates = new Set(days.map((day) => day.date));
  const first = dayjs(days[0].date);
  const last = dayjs(days[days.length - 1].date);
  // Whole weeks (Monday start) that cover the open days.
  const gridStart = first.subtract((first.day() + 6) % 7, "day");
  const gridEnd = last.add((7 - last.day()) % 7, "day");
  const calendarDays = Array.from({ length: gridEnd.diff(gridStart, "day") + 1 }, (_, idx) => {
    const d = gridStart.add(idx, "day");
    const dateStr = d.format("YYYY-MM-DD");
    return {
      dayNum: d.date(),
      monthStart: d.date() === 1 || idx === 0,
      monthLabel: d.format("MMM"),
      dateStr,
      isDisabled: !openDates.has(dateStr),
      isAfterMustOut: dateStr > lot.mustOut,
      isBeforeArrive: Boolean(lot.arriveBy) && dateStr < lot.arriveBy!,
      isCurrent: dateStr === lot.plannedDate,
      isSelected: dateStr === selectedDate,
    };
  });
  const canMove = openDates.has(selectedDate) && selectedDate !== lot.plannedDate;

  return createPortal(
    <div
      ref={popoverRef}
      style={{ top: coords.top, left: coords.left }}
      className="fixed z-[9999] w-[264px] bg-base-100 rounded-2xl shadow-[0_14px_36px_rgba(15,23,42,0.18)] border border-base-300 p-3.5 text-base-content select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="text-xs font-bold text-base-content mb-1 break-all">
        {lot.label} · {lot.gate} date
      </div>
      <div className="text-[11px] text-base-content/55 tabular-nums mb-2">
        Must out {dayjs(lot.mustOut).format("DD/MM/YYYY")}
        {lot.arriveBy ? ` · arrive by ${dayjs(lot.arriveBy).format("DD/MM")}` : ""}
      </div>

      {/* Calendar of the visible period */}
      <div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-semibold text-base-content/45 mb-1">
          <span>Mo</span>
          <span>Tu</span>
          <span>We</span>
          <span>Th</span>
          <span>Fr</span>
          <span>Sa</span>
          <span>Su</span>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center tabular-nums">
          {calendarDays.map((day) => {
            let cellStyle = "";

            if (day.isSelected) {
              cellStyle = "bg-[#4f46e5] text-white font-bold shadow-xs";
            } else if (day.isDisabled) {
              cellStyle =
                "bg-slate-100 text-slate-300 font-medium cursor-not-allowed";
            } else if (day.isAfterMustOut) {
              cellStyle =
                "bg-[#fee2e2] text-[#991b1b] font-semibold hover:brightness-95 cursor-pointer";
            } else if (day.isBeforeArrive) {
              cellStyle =
                "bg-[#fef3c7] text-[#92400e] font-semibold hover:brightness-95 cursor-pointer";
            } else {
              cellStyle =
                "bg-[#d1fae5] text-[#065f46] font-semibold hover:brightness-95 cursor-pointer";
            }
            if (day.isCurrent && !day.isSelected) cellStyle += " ring-2 ring-slate-800";

            return (
              <button
                key={day.dateStr}
                type="button"
                disabled={day.isDisabled}
                aria-label={day.dateStr}
                aria-pressed={day.isSelected}
                title={dayjs(day.dateStr).format("ddd DD/MM/YYYY")}
                onClick={() => setSelectedDate(day.dateStr)}
                className={`relative h-[30px] w-full flex flex-col items-center justify-center rounded-md text-[11.5px] leading-none ${cellStyle}`}
              >
                {day.monthStart && (
                  <span className="text-[7.5px] font-bold uppercase leading-none opacity-80">{day.monthLabel}</span>
                )}
                <span>{day.dayNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-base-content/60 mt-2.5">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500 inline-block" />
          fits
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-amber-400 inline-block" />
          before arrive-by
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-rose-500 inline-block" />
          after must-out
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] border border-slate-300 bg-slate-100 inline-block" />
          past / gate off
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          disabled={!canMove}
          onClick={() => {
            onSelectDate(selectedDate);
            onClose();
          }}
          className="flex-1 h-8 bg-[#4f46e5] hover:bg-[#4338ca] disabled:bg-base-300 disabled:text-base-content/40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          {canMove ? `Move to ${dayjs(selectedDate).format("DD/MM")}` : "Pick another day"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3 h-8 bg-base-100 border border-base-300 hover:bg-base-200 text-base-content text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body
  );
};
