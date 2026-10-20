import React, { useState, useRef, useEffect } from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  CalendarCheck,
  RotateCcw,
} from "lucide-react";

interface ModernSingleDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  label?: string;
  minDate?: string;
  maxDate?: string;
  align?: "left" | "right";
  variant?: "glass-dark" | "glass-light";
}

const thaiMonths = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const thaiMonthsShort = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

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

const weekDays = [
  { th: "อา", en: "Su" },
  { th: "จ", en: "Mo" },
  { th: "อ", en: "Tu" },
  { th: "พ", en: "We" },
  { th: "พฤ", en: "Th" },
  { th: "ศ", en: "Fr" },
  { th: "ส", en: "Sa" },
];

export const ModernSingleDatePicker: React.FC<ModernSingleDatePickerProps> = ({
  value,
  onChange,
  label = "SELECT DATE",
  minDate,
  maxDate,
  align = "right",
  variant = "glass-dark",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Month / Year view state
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    return new Date();
  });

  // Sync view date when value changes externally
  useEffect(() => {
    if (value) {
      const [y, m] = value.split("-").map(Number);
      if (!isNaN(y) && !isNaN(m)) {
        setViewDate(new Date(y, m - 1, 1));
      }
    }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const prevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(year, month - 1, 1));
  };

  const nextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(year, month + 1, 1));
  };

  // Quick Day Stepper (-1 day, +1 day) directly from trigger bar
  const stepDay = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const base = value ? new Date(value) : new Date();
    base.setDate(base.getDate() + delta);
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, "0");
    const dd = String(base.getDate()).padStart(2, "0");
    onChange(`${yyyy}-${mm}-${dd}`);
  };

  const formatDisplay = (dStr: string) => {
    if (!dStr) return "เลือกวันที่";
    const [y, m, d] = dStr.split("-");
    const mIdx = parseInt(m, 10) - 1;
    const mName = thaiMonthsShort[mIdx] || m;
    return `${d} ${mName} ${y}`;
  };

  // Calendar matrix calculation
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const handleSelectDay = (day: number) => {
    const mm = String(month + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const dateStr = `${year}-${mm}-${dd}`;
    onChange(dateStr);
    setIsOpen(false);
  };

  const toDateStr = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = toDateStr(new Date());

  const setToday = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(todayStr);
    setViewDate(new Date());
    setIsOpen(false);
  };

  const setYesterday = (e: React.MouseEvent) => {
    e.stopPropagation();
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const dStr = toDateStr(y);
    onChange(dStr);
    setViewDate(new Date(y.getFullYear(), y.getMonth(), 1));
    setIsOpen(false);
  };

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
        {/* Quick Prev Day Arrow */}
        <button
          type="button"
          onClick={(e) => stepDay(-1, e)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-90 cursor-pointer ${
            variant === "glass-dark"
              ? "hover:bg-white/20 text-blue-100 hover:text-white"
              : "hover:bg-slate-100 text-slate-500 hover:text-blue-600"
          }`}
          title="วันก่อนหน้า (-1 วัน)"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Date Display (Click to open modal) */}
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
              {label}
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

        {/* Quick Next Day Arrow */}
        <button
          type="button"
          onClick={(e) => stepDay(1, e)}
          className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all active:scale-90 cursor-pointer ${
            variant === "glass-dark"
              ? "hover:bg-white/20 text-blue-100 hover:text-white"
              : "hover:bg-slate-100 text-slate-500 hover:text-blue-600"
          }`}
          title="วันถัดไป (+1 วัน)"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Modern Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute top-full z-50 mt-3 w-[340px] max-w-[calc(100vw-24px)] rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-2xl transition-all animate-in fade-in zoom-in-95 duration-200 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-blue-600">
                <Sparkles size={13} className="text-amber-500 animate-spin-slow" />
                <span>Modern Calendar</span>
              </div>
              <h4 className="text-base font-black text-slate-900 tracking-tight mt-0.5">
                {thaiMonths[month]}{" "}
                <span className="text-blue-600 font-extrabold">{year}</span>
                <span className="text-xs text-slate-400 font-medium ml-1.5">
                  ({englishMonths[month]})
                </span>
              </h4>
            </div>

            {/* Prev / Next Month Navigation */}
            <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1 border border-slate-200/60 shadow-inner">
              <button
                type="button"
                onClick={prevMonth}
                className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-slate-700 hover:bg-blue-600 hover:text-white transition-all shadow-xs cursor-pointer active:scale-90"
                title="เดือนก่อนหน้า"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="flex h-7 w-7 items-center justify-center rounded-xl bg-white text-slate-700 hover:bg-blue-600 hover:text-white transition-all shadow-xs cursor-pointer active:scale-90"
                title="เดือนถัดไป"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="flex items-center gap-2 py-3 border-b border-slate-100">
            <button
              type="button"
              onClick={setToday}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                value === todayStr
                  ? "bg-blue-600 text-white shadow-md shadow-blue-500/30"
                  : "bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
            >
              <Zap size={13} className={value === todayStr ? "text-amber-300" : "text-amber-500"} />
              <span>วันนี้ (Today)</span>
            </button>

            <button
              type="button"
              onClick={setYesterday}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
            >
              <RotateCcw size={12} className="text-slate-500" />
              <span>เมื่อวาน</span>
            </button>
          </div>

          {/* Days of Week Header */}
          <div className="grid grid-cols-7 gap-1 text-center py-2">
            {weekDays.map((d, i) => (
              <div
                key={i}
                className={`text-[11px] font-black tracking-tight ${
                  i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-slate-400"
                }`}
              >
                {d.th}
              </div>
            ))}
          </div>

          {/* Calendar Day Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Previous Month Padded Days */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => {
              const prevDayNum = daysInPrevMonth - firstDayOfWeek + i + 1;
              return (
                <div
                  key={`prev-${i}`}
                  className="flex h-9 w-9 items-center justify-center text-xs font-semibold text-slate-300 select-none mx-auto"
                >
                  {prevDayNum}
                </div>
              );
            })}

            {/* Current Month Active Days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const mm = String(month + 1).padStart(2, "0");
              const dd = String(day).padStart(2, "0");
              const dateStr = `${year}-${mm}-${dd}`;
              const isSelected = value === dateStr;
              const isToday = todayStr === dateStr;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-2xl text-xs font-bold transition-all duration-150 cursor-pointer active:scale-90 mx-auto ${
                    isSelected
                      ? "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black shadow-lg shadow-blue-600/40 scale-105 ring-2 ring-blue-400/50"
                      : isToday
                      ? "bg-blue-50 text-blue-600 font-extrabold border border-blue-200 hover:bg-blue-100"
                      : "text-slate-700 hover:bg-slate-100 font-semibold"
                  }`}
                >
                  {day}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 h-1 w-1 rounded-full bg-blue-600" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Note */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span className="flex items-center gap-1 text-blue-600 font-semibold">
              <CalendarCheck size={13} />
              <span>เลือก: {formatDisplay(value)}</span>
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ปิด (Done)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
