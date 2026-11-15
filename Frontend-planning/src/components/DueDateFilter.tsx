import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, RotateCcw, Search } from "lucide-react";
import CallyDatePicker from "@/components/CallyCalendar";

interface DueDateFilterProps {
  startdate: string;
  stopdate: string;
  onStartChange: (value: string) => void;
  onStopChange: (value: string) => void;
  /** Search with the dates currently entered */
  onSearch: () => void;
  /** Clear both dates and search */
  onClear: () => void;
}

const dm = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
const dmy = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

/** One compact toolbar button; the start/end pickers, Search and Clear open in a small panel. */
const DueDateFilter = ({ startdate, stopdate, onStartChange, onStopChange, onSearch, onClear }: DueDateFilterProps) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = Boolean(startdate || stopdate);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = !active
    ? "Due date"
    : startdate && stopdate
      ? `Due ${dm(startdate)} – ${dmy(stopdate)}`
      : startdate
        ? `Due from ${dmy(startdate)}`
        : `Due until ${dmy(stopdate)}`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap focus:outline-none ${
          open || active
            ? "bg-primary/10 border-primary/40 text-primary"
            : "bg-base-200/40 border-base-300 text-base-content/80 hover:bg-base-200/70"
        }`}
      >
        <Calendar size={13} className={active ? "text-primary" : "opacity-60"} />
        <span className="tabular-nums">{label}</span>
        <ChevronDown size={13} className={`opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Due date filter"
          className="absolute right-0 z-50 mt-1.5 w-72 rounded-xl border border-base-300 bg-base-100 shadow-xl"
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-base-200 bg-base-200/30 rounded-t-xl">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-base-content/70">Due date</span>
          </div>
          <div className="flex flex-col gap-2.5 p-3.5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-base-content/60">Start</span>
              <CallyDatePicker
                value={startdate}
                max={stopdate || undefined}
                placeholder="Start date"
                className="w-full"
                onChange={onStartChange}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-base-content/60">End</span>
              <CallyDatePicker
                value={stopdate}
                min={startdate || undefined}
                placeholder="End date"
                className="w-full"
                onChange={onStopChange}
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-base-200 px-3.5 py-2.5">
            <button
              type="button"
              className="btn btn-xs h-8 px-2.5 btn-ghost rounded-lg text-xs gap-1 text-base-content/60 hover:text-base-content cursor-pointer"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              disabled={!active}
            >
              <RotateCcw size={13} />
              Clear
            </button>
            <button
              type="button"
              className="btn btn-xs h-8 px-3.5 btn-primary rounded-lg text-xs font-semibold gap-1.5 shadow-xs cursor-pointer"
              onClick={() => {
                onSearch();
                setOpen(false);
              }}
            >
              <Search size={13} />
              Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DueDateFilter;
