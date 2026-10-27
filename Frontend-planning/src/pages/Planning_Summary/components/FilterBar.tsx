import { memo, type ReactNode } from "react";
import { Search, RotateCcw, FileSpreadsheet } from "lucide-react";
import type { PlanningSummaryFilter, DistinctFilters } from "../types";
import ProductCombobox from "./ProductCombobox";
import CallyDatePicker from "@/components/CallyCalendar";

interface FilterBarProps {
  filter: PlanningSummaryFilter;
  filterOptions: DistinctFilters;
  onChange: (filter: PlanningSummaryFilter) => void;
  onSearch: (filter?: PlanningSummaryFilter) => void;
  onReset: () => void;
  onExport: () => void;
  loading?: boolean;
}

const Field = ({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <span className="text-[11px] font-semibold text-base-content/50 uppercase tracking-wider">
      {label}
    </span>
    {children}
  </div>
);

const FilterBar = ({
  filter,
  filterOptions,
  onChange,
  onSearch,
  onReset,
  onExport,
  loading: _loading,
}: FilterBarProps) => {
  const set = (key: keyof PlanningSummaryFilter, value: string) => {
    const next = { ...filter, [key]: value };
    onChange(next);
    return next;
  };

  const handleClearDate = () => {
    const next = { ...filter, startdate: "", stopdate: "" };
    onChange(next);
    onSearch(next);
  };

  return (
    <div className="rounded-2xl border border-base-200/80 bg-base-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="flex flex-wrap items-end gap-3">
        {/* Product Filter */}
        <Field label="Product" className="w-full sm:w-60">
          <ProductCombobox
            value={filter.prd_name}
            options={filterOptions.products}
            onChange={(v) => set("prd_name", v)}
            onSelect={(v) => {
              const next = { ...filter, prd_name: v };
              onChange(next);
              onSearch(next);
            }}
            onEnter={() => onSearch()}
          />
        </Field>

        {/* Status Filter */}
        <Field label="Status" className="w-full sm:w-36">
          <select
            className="select select-sm text-[13px] w-full rounded-lg border-base-content/20 bg-base-100 hover:border-base-content/30 focus:border-primary focus:outline-none transition-colors"
            value={filter.status}
            onChange={(e) => {
              const next = set("status", e.target.value);
              onSearch(next);
            }}
          >
            <option value="">All Statuses</option>
            {filterOptions.statuses.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </Field>

        {/* Lot Status Filter */}
        <Field label="Lot Status" className="w-full sm:w-36">
          <select
            className="select select-sm text-[13px] w-full rounded-lg border-base-content/20 bg-base-100 hover:border-base-content/30 focus:border-primary focus:outline-none transition-colors"
            value={filter.lot_status}
            onChange={(e) => {
              const next = set("lot_status", e.target.value);
              onSearch(next);
            }}
          >
            <option value="">All Lot Status</option>
            {filterOptions.lot_statuses.map((lst) => (
              <option key={lst} value={lst}>
                {lst}
              </option>
            ))}
          </select>
        </Field>

        {/* Factory Filter */}
        {filterOptions.factories.length > 0 && (
          <Field label="Factory" className="w-full sm:w-36">
            <select
              className="select select-sm text-[13px] w-full rounded-lg border-base-content/20 bg-base-100 hover:border-base-content/30 focus:border-primary focus:outline-none transition-colors"
              value={filter.factory_desc}
              onChange={(e) => {
                const next = set("factory_desc", e.target.value);
                onSearch(next);
              }}
            >
              <option value="">All Factories</option>
              {filterOptions.factories.map((fc) => (
                <option key={fc} value={fc}>
                  {fc}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Due date Filter with Cally Calendar */}
        <Field label="Due date" className="w-full sm:w-auto">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
            <CallyDatePicker
              value={filter.startdate}
              max={filter.stopdate || undefined}
              placeholder="Start date"
              onChange={(v) => set("startdate", v)}
            />
            <span className="text-base-content/40">–</span>
            <CallyDatePicker
              value={filter.stopdate}
              min={filter.startdate || undefined}
              placeholder="End date"
              onChange={(v) => set("stopdate", v)}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary rounded-lg text-[13px] font-medium shadow-xs px-3.5 gap-1.5 cursor-pointer"
              onClick={() => onSearch()}
            >
              <Search size={14} className="shrink-0" />
              <span>Search</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost rounded-lg text-[13px] gap-1 text-base-content/60 hover:text-base-content cursor-pointer"
              onClick={handleClearDate}
              disabled={!filter.startdate && !filter.stopdate}
              title="Clear date"
            >
              <RotateCcw size={14} />
              Clear
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost rounded-lg text-[13px] gap-1 text-base-content/60 hover:text-base-content cursor-pointer"
              onClick={onReset}
              title="Reset all filters"
            >
              Reset All
            </button>
          </div>
        </Field>

        {/* Export Button on the right */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none rounded-lg text-[13px] gap-1.5 font-medium shadow-xs transition-colors cursor-pointer"
            onClick={onExport}
          >
            <FileSpreadsheet size={15} />
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(FilterBar);
