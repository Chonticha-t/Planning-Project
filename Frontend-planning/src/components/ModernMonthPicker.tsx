import React, { useState, useRef, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  CalendarCheck,
} from "lucide-react";

interface ModernMonthPickerProps {
  value: string; // YYYY-MM
  onChange: (monthStr: string) => void;
  label?: string;
  align?: "left" | "right";
  variant?: "glass-dark" | "glass-light";
  mode?: "month" | "year";
}

const englishMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const englishMonthsShort = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export const ModernMonthPicker: React.FC<ModernMonthPickerProps> = ({
  value,
  onChange,
  label,
  align = "right",
  variant = "glass-dark",
  mode = "month",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayLabel = label ?? (mode === "year" ? "YEAR" : "MONTH");

  // Parse YYYY-MM or YYYY
  const parseYearMonth = (str: string) => {
    if (!str) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() };
    }
    const parts = str.split("-");
    const year = parseInt(parts[0], 10) || new Date().getFullYear();
    const month = parts[1] ? (parseInt(parts[1], 10) || 1) - 1 : 0;
    return { year, month };
  };

  const currentVal = parseYearMonth(value);
  const [viewYear, setViewYear] = useState<number>(currentVal.year);

  // Sync viewYear when value changes
  useEffect(() => {
    setViewYear(parseYearMonth(value).year);
  }, [value]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const stepDate = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode === "year") {
      const newYear = currentVal.year + delta;
      const mm = String(currentVal.month + 1).padStart(2, "0");
      onChange(`${newYear}-${mm}`);
      return;
    }

    let newYear = currentVal.year;
    let newMonth = currentVal.month + delta;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    const mm = String(newMonth + 1).padStart(2, "0");
    onChange(`${newYear}-${mm}`);
  };

  const handleSelectMonth = (monthIdx: number) => {
    const mm = String(monthIdx + 1).padStart(2, "0");
    onChange(`${viewYear}-${mm}`);
    setIsOpen(false);
  };

  const handleSelectYear = (yr: number) => {
    const mm = String(currentVal.month + 1).padStart(2, "0");
    onChange(`${yr}-${mm}`);
    setIsOpen(false);
  };

  const handleSetCurrent = () => {
    const now = new Date();
    if (mode === "year") {
      const mm = String(currentVal.month + 1).padStart(2, "0");
      onChange(`${now.getFullYear()}-${mm}`);
      setViewYear(now.getFullYear());
    } else {
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      onChange(`${now.getFullYear()}-${mm}`);
      setViewYear(now.getFullYear());
    }
    setIsOpen(false);
  };

  const formatDisplay = (str: string) => {
    const { year, month } = parseYearMonth(str);
    if (mode === "year") {
      return `${year}`;
    }
    const mName = englishMonths[month] || "";
    return `${mName} ${year}`;
  };

  const startDecade = Math.floor(viewYear / 10) * 10;
  const yearsList = Array.from({ length: 12 }, (_, i) => startDecade + i);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      {/* Trigger Capsule Button */}
      <div
        className={`group flex items-center gap-1 rounded-2xl p-1 shadow-lg transition-all duration-200 border ${
          variant === "glass-dark"
            ? "bg-white/15 hover:bg-white/25 border-white/30 backdrop-blur-xl text-white shadow-blue-950/20"
            : "bg-white hover:bg-slate-50 border-slate-200 shadow-slate-200 text-slate-800"
        }`}
      >
        {/* Prev Stepper */}
        <button
          type="button"
          onClick={(e) => stepDate(-1, e)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-90 cursor-pointer ${
            variant === "glass-dark"
              ? "hover:bg-white/20 text-blue-100 hover:text-white"
              : "hover:bg-slate-100 text-slate-500 hover:text-blue-600"
          }`}
          title={mode === "year" ? "ปีก่อนหน้า (-1 ปี)" : "เดือนก่อนหน้า (-1 เดือน)"}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Date Display */}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 px-3 py-1 cursor-pointer select-none"
        >
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-xl shadow-inner ${
              variant === "glass-dark"
                ? "bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-blue-900/40"
                : "bg-blue-50 text-blue-600 border border-blue-100"
            }`}
          >
            <CalendarIcon size={16} />
          </div>

          <div className="flex flex-col text-left">
            <span
              className={`text-[9px] font-black tracking-widest uppercase ${
                variant === "glass-dark" ? "text-blue-200" : "text-blue-600"
              }`}
            >
              {displayLabel}
            </span>
            <span
              className={`text-sm font-black tracking-tight ${
                variant === "glass-dark" ? "text-white" : "text-slate-800"
              }`}
            >
              {formatDisplay(value)}
            </span>
          </div>
        </button>

        {/* Next Stepper */}
        <button
          type="button"
          onClick={(e) => stepDate(1, e)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-90 cursor-pointer ${
            variant === "glass-dark"
              ? "hover:bg-white/20 text-blue-100 hover:text-white"
              : "hover:bg-slate-100 text-slate-500 hover:text-blue-600"
          }`}
          title={mode === "year" ? "ปีถัดไป (+1 ปี)" : "เดือนถัดไป (+1 เดือน)"}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Modern Popover Dropdown */}
      {isOpen && (
        <div
          className={`absolute z-50 mt-2 w-72 rounded-3xl p-4 shadow-2xl backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 duration-150 ${
            align === "right" ? "right-0" : "left-0"
          } bg-white text-slate-800 border border-slate-200/80`}
        >
          {/* Calendar Year/Decade Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - (mode === "year" ? 10 : 1))}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="text-center font-black text-slate-800 text-base">
              {mode === "year" ? `${startDecade} - ${startDecade + 11}` : viewYear}
            </div>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + (mode === "year" ? 10 : 1))}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Grid: Years or Months */}
          {mode === "year" ? (
            <div className="grid grid-cols-3 gap-2 pt-3">
              {yearsList.map((yr) => {
                const isSelected = currentVal.year === yr;
                const isCurrentYear = new Date().getFullYear() === yr;

                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => handleSelectYear(yr)}
                    className={`relative flex flex-col items-center justify-center py-3 rounded-xl font-black text-xs transition-all cursor-pointer ${
                      isSelected
                        ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 scale-102"
                        : isCurrentYear
                        ? "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="text-sm">{yr}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 pt-3">
              {englishMonthsShort.map((mShort, idx) => {
                const isSelected =
                  currentVal.year === viewYear && currentVal.month === idx;
                const isCurrentMonth =
                  new Date().getFullYear() === viewYear &&
                  new Date().getMonth() === idx;

                return (
                  <button
                    key={mShort}
                    type="button"
                    onClick={() => handleSelectMonth(idx)}
                    className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl font-black text-xs transition-all cursor-pointer ${
                      isSelected
                        ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 scale-102"
                        : isCurrentMonth
                        ? "bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span>{mShort}</span>
                    <span
                      className={`text-[9px] font-medium opacity-70 ${
                        isSelected ? "text-blue-100" : ""
                      }`}
                    >
                      {englishMonths[idx].slice(0, 4)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Action Footer */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handleSetCurrent}
              className="flex items-center gap-1.5 text-xs font-black text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1.5 rounded-xl transition cursor-pointer"
            >
              <CalendarCheck size={14} />
              <span>{mode === "year" ? "Current Year" : "Current Month"}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 px-2 py-1 cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
