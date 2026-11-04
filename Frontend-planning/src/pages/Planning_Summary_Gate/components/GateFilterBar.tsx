import React, { useMemo } from "react";
import dayjs from "dayjs";
import {
  Search,
  RotateCw,
  Calendar,
} from "lucide-react";
import type { PrdCategory, PlanWindow } from "../types";

interface GateFilterBarProps {
  category: PrdCategory;
  onCategoryChange: (cat: PrdCategory) => void;
  planWindow: PlanWindow;
  onPlanWindowChange: (pw: PlanWindow) => void;
  skipHolidays: boolean;
  onToggleSkipHolidays: () => void;
  search: string;
  onSearchChange: (val: string) => void;
  lastUpdated?: string;
  loading?: boolean;
  onRefresh: () => void;
}

export const GateFilterBar: React.FC<GateFilterBarProps> = ({
  category,
  onCategoryChange,
  planWindow,
  onPlanWindowChange,
  skipHolidays,
  onToggleSkipHolidays,
  search,
  onSearchChange,
  lastUpdated,
  loading,
  onRefresh,
}) => {
  const dateRangeDisplay = useMemo(() => {
    const start = dayjs();
    const days = planWindow === "2w" ? 14 : 28;
    const end = start.add(days, "day");
    return `${start.format("DD/MM")} - ${end.format("DD/MM/YYYY")}`;
  }, [planWindow]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Left controls: Category, Plan window, Date range, Skip holidays */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Category Pill Switcher */}
        <div className="join bg-base-200/80 p-0.5 rounded-xl border border-base-300">
          {(["FPC", "SMT"] as PrdCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={`btn btn-xs rounded-lg px-3 font-bold transition-all ${
                category === cat
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Plan Ahead (2 weeks / 1 month) */}
        <div className="flex items-center gap-1.5 text-xs text-base-content/70 pl-1">
          <span className="font-semibold">Plan ahead</span>
          <div className="join bg-base-200/80 p-0.5 rounded-xl border border-base-300">
            <button
              type="button"
              onClick={() => onPlanWindowChange("2w")}
              className={`btn btn-xs rounded-lg px-2.5 font-semibold transition-all ${
                planWindow === "2w"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              2 weeks
            </button>
            <button
              type="button"
              onClick={() => onPlanWindowChange("1m")}
              className={`btn btn-xs rounded-lg px-2.5 font-semibold transition-all ${
                planWindow === "1m"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              1 month
            </button>
          </div>
        </div>

        {/* Date Window Display */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-base-200/60 border border-base-300 text-xs font-semibold text-base-content/80 tabular-nums">
          <Calendar size={13} className="text-primary opacity-80" />
          <span>{dateRangeDisplay}</span>
        </div>

        {/* Skip Holidays Toggle */}
        <button
          type="button"
          onClick={onToggleSkipHolidays}
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
            skipHolidays
              ? "bg-primary text-primary-content border-primary shadow-xs"
              : "bg-base-100 border-base-300 text-base-content/70 hover:bg-base-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              skipHolidays ? "bg-primary-content" : "bg-base-content/30"
            }`}
          />
          <span>Skip holidays (8)</span>
        </button>

        {/* Search Input */}
        <div className="relative min-w-[200px] sm:min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            placeholder="Search PO / Lot / Product"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input input-xs input-bordered w-full pl-8 rounded-xl h-7 text-xs bg-base-200/40 focus:bg-base-100"
          />
        </div>
      </div>

      {/* Right controls: updated timestamp, refresh */}
      <div className="flex items-center gap-2.5 text-xs">
        {lastUpdated && (
          <span className="text-base-content/60 tabular-nums font-medium text-[11.5px] hidden sm:inline">
            Updated {lastUpdated}
          </span>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="btn btn-xs btn-ghost btn-circle text-base-content/70 hover:text-base-content"
          title="Refresh data"
        >
          <RotateCw size={13} className={loading ? "animate-spin text-primary" : ""} />
        </button>
      </div>
    </div>
  );
};
