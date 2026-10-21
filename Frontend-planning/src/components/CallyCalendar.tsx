import { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import "cally";

export interface CallyCalendarProps {
  value?: string;
  min?: string;
  max?: string;
  onChange?: (value: string) => void;
  className?: string;
}

/**
 * DaisyUI Cally Calendar (Inline)
 * อ้างอิงจาก https://daisyui.com/components/calendar/
 */
export const CallyCalendar = ({
  value = "",
  min = "",
  max = "",
  onChange,
  className = "cally bg-base-100 border border-base-300 shadow-lg rounded-box",
}: CallyCalendarProps) => {
  const calendarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = calendarRef.current;
    if (!el || !onChange) return;

    const handleChange = (e: Event) => {
      const target = e.currentTarget as HTMLElement & { value?: string };
      onChange(target.value ?? "");
    };

    el.addEventListener("change", handleChange);
    return () => el.removeEventListener("change", handleChange);
  }, [onChange]);

  return (
    <calendar-date
      ref={calendarRef}
      className={className}
      value={value || ""}
      min={min || ""}
      max={max || ""}
    >
      <svg
        aria-label="Previous"
        className="fill-current size-4 cursor-pointer"
        slot="previous"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
      >
        <path fill="currentColor" d="M15.75 19.5 8.25 12l7.5-7.5"></path>
      </svg>
      <svg
        aria-label="Next"
        className="fill-current size-4 cursor-pointer"
        slot="next"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
      >
        <path fill="currentColor" d="m8.25 4.5 7.5 7.5-7.5 7.5"></path>
      </svg>
      <calendar-month></calendar-month>
    </calendar-date>
  );
};

export interface CallyDatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "left" | "right";
}

// แปลง "YYYY-MM-DD" -> "DD/MM/YYYY" สำหรับแสดงผลในปุ่ม
const formatDisplayDate = (value: string) => {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
};

/**
 * Global Cally DatePicker (Input + Popover Calendar)
 * กดที่ช่องเพื่อเปิดปฏิทิน Cally ของ DaisyUI
 */
export const CallyDatePicker = ({
  value,
  onChange,
  min,
  max,
  placeholder = "dd/mm/yyyy",
  disabled = false,
  className = "w-full sm:w-40",
  align = "left",
}: CallyDatePickerProps) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ปิดปฏิทินเมื่อคลิกข้างนอก หรือกด Escape
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={`input input-sm w-full flex items-center justify-between gap-2 text-left cursor-pointer focus:outline-none focus:border-primary focus-visible:outline-none focus-visible:border-primary ${
          open ? "border-primary" : ""
        }`}
      >
        <span className={`truncate text-xs ${value ? "text-base-content" : "text-base-content/40"}`}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>

        <span className="flex items-center gap-1 shrink-0">
          {value && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              title="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="opacity-50 hover:opacity-100 transition-opacity p-0.5"
            >
              <X size={13} />
            </span>
          )}
          <CalendarIcon size={14} className="opacity-60" />
        </span>
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <CallyCalendar
            value={value}
            min={min}
            max={max}
            onChange={(nextDate) => {
              onChange(nextDate);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
};

export default CallyDatePicker;

