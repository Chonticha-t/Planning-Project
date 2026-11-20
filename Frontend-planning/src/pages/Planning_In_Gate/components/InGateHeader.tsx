import React, { useRef } from "react";
import dayjs from "dayjs";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Download,
  RotateCw,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import type { CountUnit, InGateCategory, InGateView, OrderBy, WorkMode } from "../types";

const PROCESS_GROUP_OPTIONS: { value: InGateCategory; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "EFPC_GEN", label: "FPC-GEN" },
  { value: "EFPC_AUTO", label: "FPC-AUTO" },
  { value: "SMT", label: "SMT" },
];

const VIEW_OPTIONS: { value: InGateView; label: string; title: string }[] = [
  { value: "day", label: "Day", title: "Work list · Day" },
  { value: "month", label: "Month", title: "Summary · Month" },
];

const MODE_OPTIONS: { value: WorkMode; label: string; title: string }[] = [
  { value: "edit", label: "Planning", title: "Planning · edit" },
  { value: "view", label: "Production", title: "Production · view" },
];

const UNIT_OPTIONS: { value: CountUnit; label: string }[] = [
  { value: "lots", label: "Lots" },
  { value: "pcs", label: "Pcs" },
  { value: "sheets", label: "Sheets" },
];

const PILL_GROUP =
  "inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300 shrink-0";
const pill = (active: boolean) =>
  `btn btn-xs h-full min-h-0 rounded-md px-2.5 whitespace-nowrap font-bold transition-all ${
    active
      ? "btn-primary shadow-xs"
      : "btn-ghost text-base-content/70 hover:bg-base-300/50"
  }`;
const STEP_BTN =
  "btn btn-xs btn-ghost h-full min-h-0 rounded-md px-1.5 text-base-content/70 hover:bg-base-300/50";

interface InGateHeaderProps {
  snapshotOnly?: boolean;
  monthStatus?: string;
  busy?: boolean;
  exportDisabled?: boolean;
  view: InGateView;
  onViewChange: (v: InGateView) => void;
  month: string; // YYYY-MM
  thisMonth: string;
  onMonthChange: (m: string) => void;
  unit: CountUnit;
  onUnitChange: (u: CountUnit) => void;
  category: InGateCategory;
  onCategoryChange: (c: InGateCategory) => void;
  date: string;
  todayStr: string;
  onDateChange: (d: string) => void;
  orderBy: OrderBy;
  onOrderByChange: (o: OrderBy) => void;
  search: string;
  onSearchChange: (s: string) => void;
  onExcel: () => void;
  onRefresh: () => void;
  workMode: WorkMode;
  onWorkModeChange: (m: WorkMode) => void;
  tvMode: boolean;
  onTvModeChange: (tv: boolean) => void;
}

// Styled to match Planning Summary Gate & MonthlySummary blue feeling
export const InGateHeader: React.FC<InGateHeaderProps> = ({
  snapshotOnly = false,
  monthStatus,
  busy = false,
  exportDisabled = false,
  view,
  onViewChange,
  month,
  thisMonth,
  onMonthChange,
  unit,
  onUnitChange,
  category,
  onCategoryChange,
  date,
  todayStr,
  onDateChange,
  search,
  onSearchChange,
  onExcel,
  onRefresh,
  workMode,
  onWorkModeChange,
  tvMode,
  onTvModeChange,
}) => {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const d = dayjs(date);
  const isToday = date === todayStr;
  const m = dayjs(`${month}-01`);
  const isMonth = view === "month";
  const dayLabel = `${isToday ? "Today · " : ""}${d.format("ddd DD/MM")}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-base-100 border border-base-300 shadow-xs print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {/* Process group pill switcher */}
        <div role="group" aria-label="Process group" className={PILL_GROUP}>
          {PROCESS_GROUP_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => onCategoryChange(value)}
              className={pill(category === value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1 text-xs text-base-content/70 pl-0.5 shrink-0">
          <span className="font-semibold text-base-content/60">View</span>
          <div role="group" aria-label="View" className={PILL_GROUP}>
            {VIEW_OPTIONS.map(({ value, label, title }) => (
              <button
                key={value}
                type="button"
                title={title}
                aria-pressed={view === value}
                onClick={() => onViewChange(value)}
                className={pill(view === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {isMonth ? (
          /* Month stepper */
          <div className={PILL_GROUP}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => onMonthChange(m.subtract(1, "month").format("YYYY-MM"))}
              className={STEP_BTN}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => onMonthChange(thisMonth)}
              title="Jump to this month"
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold tabular-nums whitespace-nowrap transition-all ${
                month === thisMonth
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/80 hover:bg-base-300/50"
              }`}
            >
              {m.format("MMMM YYYY")}
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => onMonthChange(m.add(1, "month").format("YYYY-MM"))}
              className={STEP_BTN}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          /* Day stepper */
          <div className={PILL_GROUP}>
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => onDateChange(d.subtract(1, "day").format("YYYY-MM-DD"))}
              className={STEP_BTN}
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (!isToday) onDateChange(todayStr);
                else dateInputRef.current?.showPicker?.();
              }}
              title="Jump to today or pick a date"
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold tabular-nums whitespace-nowrap transition-all ${
                isToday
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/80 hover:bg-base-300/50"
              }`}
            >
              {dayLabel}
            </button>
            <input
              ref={dateInputRef}
              type="date"
              value={date}
              onChange={(e) => e.target.value && onDateChange(e.target.value)}
              className="sr-only"
              tabIndex={-1}
              aria-label="Pick day"
            />
            <button
              type="button"
              aria-label="Next day"
              onClick={() => onDateChange(d.add(1, "day").format("YYYY-MM-DD"))}
              className={STEP_BTN}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Count unit (Lots | Pcs | Sheets) */}
        <div className="flex items-center gap-1 text-xs text-base-content/70 pl-0.5 shrink-0">
          <span className="font-semibold text-base-content/60">Count</span>
          <div role="group" aria-label="Count unit" className={PILL_GROUP}>
            {UNIT_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={unit === value}
                onClick={() => onUnitChange(value)}
                className={pill(unit === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Search product */}
        <div className="relative w-36 sm:w-44 lg:w-48 shrink-0">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40"
          />
          <input
            type="text"
            placeholder="Search product / lot"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input input-xs input-bordered w-full pl-7 pr-6 rounded-lg h-8 text-xs bg-base-200/40 focus:bg-base-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex flex-wrap items-center gap-2 text-xs ml-auto shrink-0">
        {isMonth ? (
          <span className="text-base-content/60 whitespace-nowrap text-xs">
            {monthStatus ?? (snapshotOnly ? "Saved plan · Actual unavailable" : `Actual = scan out · updated ${dayjs().format("DD/MM HH:mm")}`)}
          </span>
        ) : (
          <div role="group" aria-label="Work mode" className={PILL_GROUP}>
            {MODE_OPTIONS.map(({ value, label, title }) => (
              <button
                key={value}
                type="button"
                title={title}
                aria-pressed={workMode === value}
                onClick={() => onWorkModeChange(value)}
                className={pill(workMode === value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          aria-pressed={tvMode}
          onClick={() => onTvModeChange(!tvMode)}
          className={`btn btn-xs h-8 px-2.5 rounded-lg font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
            tvMode
              ? "btn-primary shadow-xs"
              : "border border-base-300 bg-base-100 text-base-content/80 hover:bg-base-200"
          }`}
          title="Toggle TV mode"
        >
          {tvMode ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          <span>TV mode</span>
        </button>

        <button
          type="button"
          onClick={onExcel}
          disabled={exportDisabled || busy}
          className="btn btn-xs h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border-none text-xs font-semibold rounded-lg normal-case shadow-xs flex items-center gap-1.5 cursor-pointer disabled:bg-base-300 disabled:text-base-content/40"
          title={isMonth ? snapshotOnly ? "Export saved arrivals to Excel" : "Export monthly summary to Excel" : "Export saved order to Excel"}
        >
          <Download size={13} />
          <span>Excel</span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="btn btn-xs btn-ghost btn-circle text-base-content/70 hover:text-base-content"
          title={isMonth && monthStatus ? "Reload saved arrivals and observed output" : snapshotOnly ? "Load latest saved plan" : "Reload saved order"}
        >
          <RotateCw size={13} />
        </button>
      </div>
    </div>
  );
};
