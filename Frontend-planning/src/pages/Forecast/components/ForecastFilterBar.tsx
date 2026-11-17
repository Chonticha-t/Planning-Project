import React from "react";
import { Calendar, Search, ChevronDown, RotateCw } from "lucide-react";
import type { ProcessFilter, ForecastUnit } from "../types";

interface ForecastFilterBarProps {
  processFilter: ProcessFilter;
  onProcessFilterChange: (proc: ProcessFilter) => void;
  selectedCustomer: string;
  onCustomerChange: (cust: string) => void;
  availableCustomers: string[];
  weekRangeLabel: string;
  unit: ForecastUnit;
  onUnitChange: (u: ForecastUnit) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const ForecastFilterBar: React.FC<ForecastFilterBarProps> = ({
  processFilter,
  onProcessFilterChange,
  selectedCustomer,
  onCustomerChange,
  availableCustomers,
  weekRangeLabel,
  unit,
  onUnitChange,
  searchQuery,
  onSearchChange,
  loading,
  error,
  onRefresh,
}) => {
  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Process Switcher: ALL | FPC | SMT */}
          <div className="inline-flex h-8 items-center bg-base-200/70 p-0.5 rounded-lg border border-base-300">
            {(["ALL", "FPC", "SMT"] as ProcessFilter[]).map((proc) => {
              const active = processFilter === proc;
              return (
                <button
                  key={proc}
                  type="button"
                  onClick={() => onProcessFilterChange(proc)}
                  className={`px-3 h-full rounded-md text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? "bg-[#3b38c8] text-white shadow-xs"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  {proc}
                </button>
              );
            })}
          </div>

          {/* Customer Selector */}
          <div className="relative">
            <select
              aria-label="Filter by customer"
              value={selectedCustomer}
              onChange={(e) => onCustomerChange(e.target.value)}
              className="appearance-none h-8 pl-3 pr-8 rounded-lg text-xs font-medium bg-base-100 border border-base-300 text-base-content focus:outline-none cursor-pointer"
            >
              <option value="ALL">
                All Customers ({availableCustomers.length})
              </option>
              {availableCustomers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/60"
            />
          </div>

          {/* Week Range Pill */}
          <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-base-300 bg-base-100 text-xs font-medium text-base-content/80">
            <Calendar size={13} className="text-base-content/50" />
            <span>{weekRangeLabel}</span>
          </div>

          {/* Unit Switcher: Pcs | Lot */}
          <div className="inline-flex h-8 items-center bg-base-200/70 p-0.5 rounded-lg border border-base-300">
            {(["Pcs", "Lot"] as ForecastUnit[]).map((u) => {
              const active = unit === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => onUnitChange(u)}
                  className={`px-3 h-full rounded-md text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? "bg-[#3b38c8] text-white shadow-xs"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-[280px]">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search Product / Customer"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-base-300 bg-base-100 text-xs text-base-content placeholder:text-base-content/40 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh forecast data"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 text-xs font-medium text-base-content/75 transition-colors cursor-pointer"
        >
          <RotateCw size={13} className={loading ? "animate-spin text-primary" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
};
export default ForecastFilterBar;
