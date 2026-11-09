import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import type { LotItem } from "../types";

interface DatePickerPopoverProps {
  lot: LotItem;
  frozenUntilDate: string; // "2026-11-09"
  anchorEl: HTMLElement | null;
  onSelectDate: (targetDate: string) => void;
  onClose: () => void;
}

const computePopoverCoords = (anchorEl: HTMLElement | null) => {
  if (!anchorEl) return null;
  const rect = anchorEl.getBoundingClientRect();
  const popWidth = 264;
  const popHeight = 315;
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
  frozenUntilDate,
  anchorEl,
  onSelectDate,
  onClose,
}) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  const [selectedDate, setSelectedDate] = useState<string>(
    lot.releaseDate === "2026-11-17" ? "2026-11-20" : lot.releaseDate
  );
  const [inputVal, setInputVal] = useState<string>(
    dayjs(lot.releaseDate).format("DD/MM/YYYY")
  );

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
  if (!coords) return null;

  const mustStart = dayjs(lot.mustStartDate);
  const frozenDate = dayjs(frozenUntilDate);

  // Calendar weeks starting Monday 2 Nov 2026 to Sunday 29 Nov 2026 (28 days)
  const calendarDays = Array.from({ length: 28 }, (_, idx) => {
    const dayNum = idx + 2; // 2 .. 29
    const dateStr = `2026-11-${String(dayNum).padStart(2, "0")}`;
    const d = dayjs(dateStr);
    const isSunday = d.day() === 0;
    const isFrozen = d.isBefore(frozenDate.add(1, "day"));
    const isAfterMustStart = d.isAfter(mustStart);
    const isCurrent = dateStr === lot.releaseDate;
    const isSelected = dateStr === selectedDate;

    return {
      dayNum,
      dateStr,
      isSunday,
      isFrozen,
      isAfterMustStart,
      isCurrent,
      isSelected,
    };
  });

  const handleDayClick = (
    dStr: string,
    isFrozen: boolean,
    isSunday: boolean
  ) => {
    if (isFrozen || isSunday) return;
    setSelectedDate(dStr);
    setInputVal(dayjs(dStr).format("DD/MM/YYYY"));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputVal(v);
    const parts = v.split("/");
    if (parts.length === 3 && parts[2].length === 4) {
      const parsed = `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
      if (dayjs(parsed).isValid()) {
        setSelectedDate(parsed);
      }
    }
  };

  return createPortal(
    <div
      ref={popoverRef}
      style={{ top: coords.top, left: coords.left }}
      className="fixed z-[9999] w-[264px] bg-base-100 rounded-2xl shadow-[0_14px_36px_rgba(15,23,42,0.18)] border border-base-300 p-3.5 text-base-content select-none"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="text-xs font-bold text-base-content mb-2">
        {lot.id} · release date
      </div>

      {/* Input box with "type or pick" inside */}
      <div className="flex items-center justify-between border-[1.5px] border-primary rounded-lg px-2.5 py-1.5 bg-base-100">
        <input
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          placeholder="DD/MM/YYYY"
          className="w-24 text-xs font-bold text-base-content tabular-nums focus:outline-none bg-transparent"
        />
        <span className="text-[11px] text-base-content/45 font-medium">
          type or pick
        </span>
      </div>

      {/* Mini month calendar */}
      <div className="mt-2.5">
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
            } else if (day.isCurrent) {
              cellStyle =
                "bg-base-100 text-base-content border-[1.5px] border-slate-800 font-bold";
            } else if (day.isFrozen || day.isSunday) {
              cellStyle =
                "bg-slate-100 text-slate-300 font-medium cursor-not-allowed";
            } else if (day.isAfterMustStart) {
              cellStyle =
                "bg-[#fee2e2] text-[#991b1b] font-semibold hover:brightness-95 cursor-pointer";
            } else {
              cellStyle =
                "bg-[#d1fae5] text-[#065f46] font-semibold hover:brightness-95 cursor-pointer";
            }

            return (
              <button
                key={day.dateStr}
                type="button"
                disabled={day.isFrozen || day.isSunday}
                onClick={() =>
                  handleDayClick(day.dateStr, day.isFrozen, day.isSunday)
                }
                className={`h-[27px] w-full flex items-center justify-center rounded-md text-[11.5px] ${cellStyle}`}
              >
                {day.dayNum}
              </button>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between text-[10.5px] text-base-content/60 mt-2.5">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-500 inline-block" />
          fits
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-rose-500 inline-block" />
          after must start
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-[3px] border border-slate-300 bg-slate-100 inline-block" />
          frozen / off
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        <button
          type="button"
          onClick={() => {
            onSelectDate(selectedDate);
            onClose();
          }}
          className="flex-1 h-8 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
        >
          Move to {dayjs(selectedDate).format("DD/MM")}
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
