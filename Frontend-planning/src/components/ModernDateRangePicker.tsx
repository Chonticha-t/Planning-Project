import React, { useState, useRef, useEffect } from "react";
import { Calendar, X } from "lucide-react";

export interface ModernDateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  label?: string;
  minDate?: string;
  maxDate?: string;
  align?: "left" | "right";
  className?: string;
}

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

const getTodayStr = () => {
  const d = new Date();
  return d.toISOString().split("T")[0];
};

const getPastDaysStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
};

export const ModernDateRangePicker: React.FC<ModernDateRangePickerProps> = ({
  startDate,
  endDate,
  onChange,
  label = "Date Range",
  minDate,
  maxDate,
  align = "left",
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
  }, [startDate, endDate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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

  const handleApply = () => {
    onChange(localStart, localEnd);
    setIsOpen(false);
  };

  const handleClear = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setLocalStart("");
    setLocalEnd("");
    onChange("", "");
    setIsOpen(false);
  };

  const handlePreset = (preset: "today" | "7days" | "30days" | "all") => {
    if (preset === "today") {
      const today = getTodayStr();
      setLocalStart(today);
      setLocalEnd(today);
      onChange(today, today);
    } else if (preset === "7days") {
      const start = getPastDaysStr(7);
      const end = getTodayStr();
      setLocalStart(start);
      setLocalEnd(end);
      onChange(start, end);
    } else if (preset === "30days") {
      const start = getPastDaysStr(30);
      const end = getTodayStr();
      setLocalStart(start);
      setLocalEnd(end);
      onChange(start, end);
    } else if (preset === "all") {
      setLocalStart("");
      setLocalEnd("");
      onChange("", "");
    }
    setIsOpen(false);
  };

  const hasValue = Boolean(startDate || endDate);

  const displayText = () => {
    if (startDate && endDate) {
      return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
    }
    if (startDate) {
      return `From ${formatDateDisplay(startDate)}`;
    }
    if (endDate) {
      return `To ${formatDateDisplay(endDate)}`;
    }
    return "All Dates";
  };

  return (
    <div ref={containerRef} className={`relative inline-block w-full ${className}`}>
      {label && <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white text-xs text-slate-700 flex items-center justify-between gap-2 shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
      >
        <div className="flex items-center gap-2 truncate">
          <Calendar size={14} className="text-slate-400 shrink-0" />
          <span className={`truncate font-medium ${hasValue ? "text-slate-800" : "text-slate-400"}`}>
            {displayText()}
          </span>
        </div>
        {hasValue && (
          <span
            onClick={handleClear}
            className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
            title="Clear range"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 z-50 bg-white rounded-xl shadow-xl border border-slate-200 p-3 min-w-[280px] w-full sm:w-80 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {/* Quick Presets */}
          <div className="grid grid-cols-4 gap-1 mb-3 pb-2 border-b border-slate-100">
            <button
              type="button"
              onClick={() => handlePreset("today")}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handlePreset("7days")}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => handlePreset("30days")}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              30 Days
            </button>
            <button
              type="button"
              onClick={() => handlePreset("all")}
              className="px-2 py-1 text-[11px] font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              All
            </button>
          </div>

          {/* Date Inputs */}
          <div className="space-y-2.5 mb-3">
            <div>
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">From</span>
              <input
                type="date"
                value={localStart}
                min={minDate}
                max={localEnd || maxDate}
                onChange={(e) => setLocalStart(e.target.value)}
                onClick={(e) => {
                  try { e.currentTarget.showPicker(); } catch (err) {}
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 cursor-pointer focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <span className="block text-[11px] font-semibold text-slate-500 mb-1">To</span>
              <input
                type="date"
                value={localEnd}
                min={localStart || minDate}
                max={maxDate}
                onChange={(e) => setLocalEnd(e.target.value)}
                onClick={(e) => {
                  try { e.currentTarget.showPicker(); } catch (err) {}
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-800 cursor-pointer focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleClear()}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
