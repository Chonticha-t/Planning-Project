import React from "react";
import dayjs from "dayjs";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Search,
  Download,
  RotateCw,
  ChevronDown,
  X,
} from "lucide-react";
import type { CountUnit, InGateCategory, InGateView, OrderBy } from "../types";
import { ORDER_BY_OPTIONS } from "../utils";

const PROCESS_GROUP_OPTIONS: { value: InGateCategory; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "EFPC_GEN", label: "FPC-GEN" },
  { value: "EFPC_AUTO", label: "FPC-AUTO" },
  { value: "SMT", label: "SMT" },
];

const VIEW_OPTIONS: { value: InGateView; label: string }[] = [
  { value: "day", label: "Work list · Day" },
  { value: "month", label: "Summary · Month" },
];

const UNIT_OPTIONS: { value: CountUnit; label: string }[] = [
  { value: "lots", label: "Lots" },
  { value: "pcs", label: "Pcs" },
  { value: "sheets", label: "Sheets" },
];

const PILL_GROUP = "inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300";
const pill = (active: boolean) =>
  `btn btn-xs h-full min-h-0 rounded-md px-3 whitespace-nowrap font-bold transition-all ${
    active ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"
  }`;
const STEP_BTN = "btn btn-xs btn-ghost h-full min-h-0 rounded-md px-1.5 text-base-content/70 hover:bg-base-300/50";

interface InGateHeaderProps {
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
}

// Styled to match Planning Summary Gate → GateFilterBar
export const InGateHeader: React.FC<InGateHeaderProps> = ({
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
  orderBy,
  onOrderByChange,
  search,
  onSearchChange,
  onExcel,
  onRefresh,
}) => {
  const d = dayjs(date);
  const isToday = date === todayStr;
  const m = dayjs(`${month}-01`);
  const isMonth = view === "month";
  const dayLabel = `${isToday ? "Today · " : ""}${d.format("ddd DD/MM")}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs print:hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Group pill switcher */}
        <div
          role="group"
          aria-label="Process group"
          className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300"
        >
          {PROCESS_GROUP_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => onCategoryChange(value)}
              className={`btn btn-xs h-full min-h-0 rounded-md px-3 whitespace-nowrap font-bold transition-all ${
                category === value
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1.5 text-xs text-base-content/70 pl-1">
          <span className="font-semibold">View</span>
          <div role="group" aria-label="View" className={PILL_GROUP}>
            {VIEW_OPTIONS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => onViewChange(value)} className={pill(view === value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {isMonth ? (
          <>
            {/* Month stepper */}
            <div className={PILL_GROUP}>
              <button type="button" aria-label="Previous month" onClick={() => onMonthChange(m.subtract(1, "month").format("YYYY-MM"))} className={STEP_BTN}>
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => onMonthChange(thisMonth)}
                title="Jump to this month"
                className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold tabular-nums whitespace-nowrap transition-all ${
                  month === thisMonth ? "bg-primary text-primary-content shadow-xs" : "btn-ghost text-base-content/80 hover:bg-base-300/50"
                }`}
              >
                {m.format("MMMM YYYY")}
              </button>
              <button type="button" aria-label="Next month" onClick={() => onMonthChange(m.add(1, "month").format("YYYY-MM"))} className={STEP_BTN}>
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Count unit */}
            <div className="flex items-center gap-1.5 text-xs text-base-content/70 pl-1">
              <span className="font-semibold">Count</span>
              <div role="group" aria-label="Count unit" className={PILL_GROUP}>
                {UNIT_OPTIONS.map(({ value, label }) => (
                  <button key={value} type="button" aria-pressed={unit === value} onClick={() => onUnitChange(value)} className={pill(unit === value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
        {/* Day stepper */}
        <div className="flex items-center gap-1.5 text-xs text-base-content/70 pl-1">
          <span className="font-semibold">Day</span>
          <div className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300">
            <button
              type="button"
              aria-label="Previous day"
              onClick={() => onDateChange(d.subtract(1, "day").format("YYYY-MM-DD"))}
              className="btn btn-xs btn-ghost h-full min-h-0 rounded-md px-1.5 text-base-content/70 hover:bg-base-300/50"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => onDateChange(todayStr)}
              title="Jump to today"
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold tabular-nums whitespace-nowrap transition-all ${
                isToday
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/80 hover:bg-base-300/50"
              }`}
            >
              {dayLabel}
            </button>
            <button
              type="button"
              aria-label="Next day"
              onClick={() => onDateChange(d.add(1, "day").format("YYYY-MM-DD"))}
              className="btn btn-xs btn-ghost h-full min-h-0 rounded-md px-1.5 text-base-content/70 hover:bg-base-300/50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Date picker */}
        <label className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg bg-base-200/60 border border-base-300 text-xs font-semibold text-base-content/80 tabular-nums cursor-pointer">
          <Calendar size={13} className="text-primary opacity-80" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="bg-transparent outline-none cursor-pointer"
            aria-label="Pick day"
          />
        </label>

        {/* Order by */}
        <div className="flex items-center gap-1.5 text-xs text-base-content/70 pl-1">
          <span className="font-semibold">Order by</span>
          <div className="relative">
            <select
              value={orderBy}
              onChange={(e) => onOrderByChange(e.target.value as OrderBy)}
              className={`h-8 appearance-none rounded-lg border pl-3 pr-8 text-xs font-semibold cursor-pointer outline-none transition-all ${
                orderBy !== "plan"
                  ? "bg-[#eef2ff] border-indigo-300 text-[#4f46e5]"
                  : "bg-base-200/40 border-base-300 text-base-content/80 hover:bg-base-200/70"
              }`}
            >
              {ORDER_BY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 opacity-60"
            />
          </div>
        </div>
          </>
        )}

        {/* Search */}
        <div className="relative min-w-[210px] sm:min-w-[250px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            placeholder={isMonth ? "Search product" : "Search Lot / Product"}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input input-xs input-bordered w-full pl-8 pr-7 rounded-lg h-8 text-xs bg-base-200/40 focus:bg-base-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2.5 text-xs">
        {isMonth && (
          <span className="text-base-content/60 whitespace-nowrap">
            Actual = scan out · updated {dayjs().format("DD/MM HH:mm")}
          </span>
        )}
        <button
          type="button"
          onClick={onExcel}
          className="btn btn-xs h-8 px-3 btn-primary text-xs font-semibold rounded-lg normal-case shadow-xs flex items-center gap-1.5 cursor-pointer"
          title={isMonth ? "Export monthly summary to Excel" : "Export saved order to Excel"}
        >
          <Download size={13} />
          <span>Excel</span>
        </button>
        <button
          type="button"
          onClick={onRefresh}
          className="btn btn-xs btn-ghost btn-circle text-base-content/70 hover:text-base-content"
          title="Reload saved order"
        >
          <RotateCw size={13} />
        </button>
      </div>
    </div>
  );
};
