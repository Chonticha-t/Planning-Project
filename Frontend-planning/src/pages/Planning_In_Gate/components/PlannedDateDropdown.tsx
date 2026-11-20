import React, { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { Calendar, Check, ChevronDown } from "lucide-react";

interface PlannedDateDropdownProps {
  date: string;
  todayStr: string;
  scheduledDates: string[];
  lotsPerDate?: Record<string, number>;
  onDateChange: (date: string) => void;
}

export const PlannedDateDropdown: React.FC<PlannedDateDropdownProps> = ({
  date,
  todayStr,
  scheduledDates,
  lotsPerDate,
  onDateChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const isToday = date === todayStr;
  const currentFormatted = date ? dayjs(date).format("YYYY-MM-DD") : "Select date";

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 h-8 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
          isOpen
            ? "bg-primary/10 border-primary/40 text-primary ring-2 ring-primary/20"
            : "bg-base-100 border-base-300 text-base-content hover:bg-base-200/60 hover:border-base-content/30"
        }`}
      >
        <Calendar size={13} className="text-[#316be8] shrink-0" />
        <span className="font-semibold tabular-nums">{currentFormatted}</span>
        {isToday && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-primary/15 text-primary">
            Today
          </span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 text-base-content/50 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-base-200 bg-base-200/40 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
              <Calendar size={12} className="text-[#316be8]" />
              Planned Days
            </span>
            <span className="text-[11px] font-medium text-base-content/50">
              {scheduledDates.length} {scheduledDates.length === 1 ? "day" : "days"}
            </span>
          </div>

          <div className="max-h-64 overflow-y-auto p-1 divide-y divide-base-200/50">
            {scheduledDates.length === 0 ? (
              <div className="p-3 text-center text-xs text-base-content/50">
                No planned days found
              </div>
            ) : (
              scheduledDates.map((day) => {
                const isSelected = day === date;
                const isDayToday = day === todayStr;
                const count = lotsPerDate?.[day];
                const d = dayjs(day);

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onDateChange(day);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-base-content/80 hover:bg-base-200/70"
                    }`}
                  >
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-semibold">{day}</span>
                        {isDayToday && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-primary/20 text-primary">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-base-content/50 font-normal">
                        {d.format("dddd, DD MMMM")}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {count !== undefined && (
                        <span className="text-[11px] font-semibold text-base-content/60 tabular-nums px-2 py-0.5 rounded-full bg-base-200">
                          {count} {count === 1 ? "lot" : "lots"}
                        </span>
                      )}
                      {isSelected && <Check size={14} className="text-primary shrink-0" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
