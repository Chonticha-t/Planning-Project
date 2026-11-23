import { memo } from "react";
import { CalendarRange, FileSpreadsheet, RefreshCw, Search } from "lucide-react";
import { HORIZON_OPTIONS, type Horizon, type ShowFilter, type UnitFilter } from "../types";
import { addDays, rangeLabel } from "../overviewView";

interface OverviewFilterBarProps {
  unit: UnitFilter;
  onUnitChange: (unit: UnitFilter) => void;
  horizon: Horizon;
  onHorizonChange: (horizon: Horizon) => void;
  startDate: string;
  show: ShowFilter;
  onShowChange: (show: ShowFilter) => void;
  counts: { all: number; short: number };
  search: string;
  onSearchChange: (value: string) => void;
  updatedLabel: string;
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  canExport: boolean;
}

const PillGroup = <T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; count?: number; countTone?: "error" }[];
  onSelect: (value: T) => void;
}) => (
  <div role="group" aria-label={label} className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300">
    {options.map((opt) => {
      const active = value === opt.value;
      return (
        <button
          key={opt.value}
          type="button"
          aria-pressed={active}
          onClick={() => onSelect(opt.value)}
          className={`btn btn-xs h-full min-h-0 rounded-md px-3 gap-1.5 whitespace-nowrap font-bold transition-all ${
            active ? "btn-neutral shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span
              className={`inline-flex min-w-5 h-4 px-1 items-center justify-center rounded-full text-[10.5px] tabular-nums ${
                active
                  ? "bg-neutral-content/20 text-neutral-content"
                  : opt.countTone === "error"
                  ? "bg-error/15 text-error"
                  : "bg-base-300 text-base-content/70"
              }`}
            >
              {opt.count.toLocaleString("en-US")}
            </span>
          )}
        </button>
      );
    })}
  </div>
);

const UNIT_OPTIONS: { value: UnitFilter; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "FPC", label: "FPC" },
  { value: "SMT", label: "SMT" },
];

const OverviewFilterBar = ({
  unit,
  onUnitChange,
  horizon,
  onHorizonChange,
  startDate,
  show,
  onShowChange,
  counts,
  search,
  onSearchChange,
  updatedLabel,
  loading,
  onRefresh,
  onExport,
  canExport,
}: OverviewFilterBarProps) => (
  <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
    <PillGroup label="Item unit" value={unit} options={UNIT_OPTIONS} onSelect={onUnitChange} />

    <label className="relative inline-flex items-center">
      <span className="sr-only">Date range</span>
      <CalendarRange size={14} className="pointer-events-none absolute left-2.5 text-base-content/60" aria-hidden="true" />
      <select
        className="select select-sm h-8 min-h-0 w-auto ps-8 pe-8 text-xs font-semibold rounded-lg bg-base-200/40 border-base-300 text-base-content/85 hover:bg-base-200/70 focus:border-primary focus:outline-none"
        value={horizon}
        onChange={(e) => onHorizonChange(Number(e.target.value) as Horizon)}
      >
        {HORIZON_OPTIONS.map((days) => (
          <option key={days} value={days}>
            {rangeLabel(startDate, addDays(startDate, days - 1))} · {days} days
          </option>
        ))}
      </select>
    </label>

    <PillGroup
      label="Show products"
      value={show}
      options={[
        { value: "all", label: "All", count: counts.all },
        { value: "short", label: "Short only", count: counts.short, countTone: "error" },
      ]}
      onSelect={onShowChange}
    />

    <label className="input input-sm h-8 min-h-0 w-56 max-w-full rounded-lg bg-base-200/40 border-base-300 text-xs focus-within:border-primary focus-within:outline-none">
      <Search size={14} className="text-base-content/50" aria-hidden="true" />
      <span className="sr-only">Search product</span>
      <input
        type="search"
        placeholder="Search Product"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </label>

    <div className="flex-1" />

    <div className="flex items-center gap-1 text-xs text-base-content/60">
      <span>Updated {updatedLabel}</span>
      <button
        type="button"
        aria-label="Refresh data"
        title="Refresh data"
        onClick={onRefresh}
        disabled={loading}
        className="btn btn-ghost btn-xs btn-square h-8 w-8"
      >
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
      </button>
    </div>

    <button
      type="button"
      onClick={onExport}
      disabled={!canExport}
      className="btn btn-sm h-8 min-h-0 bg-emerald-600 hover:bg-emerald-700 text-white border-none rounded-lg text-[13px] gap-1.5 font-medium shadow-xs transition-colors cursor-pointer disabled:bg-base-300 disabled:text-base-content/40"
    >
      <FileSpreadsheet size={15} />
      Export Excel
    </button>
  </div>
);

export default memo(OverviewFilterBar);
