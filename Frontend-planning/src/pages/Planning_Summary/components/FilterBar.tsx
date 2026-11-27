import { memo, useState, useRef, useEffect, useMemo } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check,
} from "lucide-react";
import type { GridSortDirection, GridSortModel } from "@mui/x-data-grid";
import {
  SORT_OPTIONS,
  ITEM_UNIT_OPTIONS,
  sortPriorities,
  type PlanningSummaryFilter,
  type DistinctFilters,
} from "../types";
import ProductCombobox from "./ProductCombobox";
import DueDateFilter from "@/components/DueDateFilter";

interface FilterBarProps {
  filter: PlanningSummaryFilter;
  filterOptions: DistinctFilters;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onChange: (filter: PlanningSummaryFilter) => void;
  onSearch: (filter?: PlanningSummaryFilter) => void;
  onReset: () => void;
  onExport?: () => void;
  loading?: boolean;
}

const SortByDropdown = ({
  sortModel,
  onSortModelChange,
}: {
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const activeField = sortModel[0]?.field ?? "";
  const activeDir: NonNullable<GridSortDirection> = sortModel[0]?.sort ?? "desc";

  const [draftField, setDraftField] = useState<string>(activeField);
  const [draftDir, setDraftDir] = useState<"asc" | "desc">(activeDir);

  useEffect(() => {
    setDraftField(activeField);
    setDraftDir(activeDir);
  }, [activeField, activeDir, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeLabel = SORT_OPTIONS.find((o) => o.field === activeField)?.label;

  const handleClear = () => {
    setDraftField("");
    setDraftDir("desc");
    onSortModelChange([]);
  };

  const handleConfirm = () => {
    if (draftField) {
      onSortModelChange([{ field: draftField, sort: draftDir }]);
    } else {
      onSortModelChange([]);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap focus:outline-none ${
          open || activeField
            ? "bg-primary/10 border-primary/40 text-primary"
            : "bg-base-200/40 border-base-content/12 text-base-content/80 hover:bg-base-200/70"
        }`}
      >
        {activeField ? (
          activeDir === "asc" ? (
            <ArrowUp size={14} className="text-primary" />
          ) : (
            <ArrowDown size={14} className="text-primary" />
          )
        ) : (
          <ArrowUpDown size={14} className="opacity-50" />
        )}
        <span>{activeLabel ? `Sort: ${activeLabel}` : "Sort by"}</span>
        <ChevronDown
          size={13}
          className={`opacity-50 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-60 rounded-xl border border-base-200 bg-base-100 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-base-200 bg-base-200/30">
            <span className="text-[12px] font-semibold text-base-content/70 uppercase tracking-wider">
              Sort by
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-medium text-error hover:opacity-80 cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto px-2 py-1.5 flex flex-col gap-0.5">
            {SORT_OPTIONS.map((opt) => {
              const checked = draftField === opt.field;
              return (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => setDraftField(checked ? "" : opt.field)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg hover:bg-base-200/70 text-left transition-colors cursor-pointer"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? "border-primary bg-primary text-primary-content"
                        : "border-base-300 bg-transparent"
                    }`}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span
                    className={`text-[13px] ${
                      checked
                        ? "font-semibold text-primary"
                        : "text-base-content/80 font-medium"
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-base-200 px-2.5 py-2 flex flex-col gap-1 bg-base-200/20">
            <button
              type="button"
              onClick={() => setDraftDir("asc")}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
                draftDir === "asc"
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-transparent text-base-content/70 hover:bg-base-200 font-medium"
              }`}
            >
              <ArrowUp size={14} />
              <span>Ascending</span>
            </button>

            <button
              type="button"
              onClick={() => setDraftDir("desc")}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
                draftDir === "desc"
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-transparent text-base-content/70 hover:bg-base-200 font-medium"
              }`}
            >
              <ArrowDown size={14} />
              <span>Descending</span>
            </button>
          </div>

          <div className="p-2.5 pt-1.5 border-t border-base-200">
            <button
              type="button"
              onClick={handleConfirm}
              className="btn btn-sm btn-primary w-full rounded-lg font-medium text-xs shadow-xs cursor-pointer"
            >
              Apply Sort
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact select matching the PO Balance / Summary Gate toolbar. An applied filter is highlighted.
const selectClass = (active: boolean) =>
  `select select-sm h-8 min-h-0 w-auto field-sizing-content ps-3 pe-8 text-xs font-semibold rounded-lg focus:border-primary focus:outline-none transition-colors whitespace-nowrap truncate ${
    active
      ? "bg-[#eef2ff] border-indigo-300 text-[#4f46e5]"
      : "bg-base-200/40 border-base-content/12 text-base-content/80 hover:bg-base-200/70"
  }`;

// Same pill switcher as PO Balance / Planning Summary Gate
const PillGroup = <T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onSelect: (value: T) => void;
}) => (
  <div role="group" aria-label={label} className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-content/12">
    {options.map((opt) => (
      <button
        key={opt.label}
        type="button"
        aria-pressed={value === opt.value}
        onClick={() => onSelect(opt.value)}
        className={`btn btn-xs h-full min-h-0 rounded-md px-3 whitespace-nowrap font-bold transition-all ${
          value === opt.value ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

const FilterBar = ({
  filter,
  filterOptions,
  sortModel,
  onSortModelChange,
  onChange,
  onSearch,
  onReset,
}: FilterBarProps) => {
  const searchOptions = useMemo(() => {
    const prds = filterOptions.products || [];
    const lots = filterOptions.lot_nos || [];
    return Array.from(new Set([...prds, ...lots]));
  }, [filterOptions.products, filterOptions.lot_nos]);

  const sortedPriorities = useMemo(() => {
    return sortPriorities(filterOptions.priorities || []);
  }, [filterOptions.priorities]);

  const set = (key: keyof PlanningSummaryFilter, value: string) => {
    const next = { ...filter, [key]: value };
    onChange(next);
    return next;
  };

  // Same as before: choosing an option searches immediately
  const apply = (key: keyof PlanningSummaryFilter, value: string) => onSearch(set(key, value));

  const handleClearDate = () => {
    const next = { ...filter, startdate: "", stopdate: "" };
    onChange(next);
    onSearch(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-base-100 border border-base-content/12 shadow-xs">
      {/* Type Filter (94 = FPC, 95 = SMT) */}
      <PillGroup
        label="Type"
        value={(filter.item_prefix || "") as (typeof ITEM_UNIT_OPTIONS)[number]["value"]}
        options={ITEM_UNIT_OPTIONS}
        onSelect={(nextPrefix) => {
          const next: PlanningSummaryFilter = {
            ...filter,
            item_prefix: nextPrefix,
            ...(nextPrefix && filter.item_prefix !== nextPrefix
              ? { prd_name: "", gate_name: "" }
              : {}),
          };
          onChange(next);
          onSearch(next);
        }}
      />

      {/* Product / Lot No Filter */}
      <div className="min-w-36 flex-1 basis-40 max-w-64">
        <ProductCombobox
          value={filter.prd_name}
          options={searchOptions}
          placeholder="Product / Lot No"
          onChange={(v) => set("prd_name", v)}
          onSelect={(v) => {
            const next = { ...filter, prd_name: v };
            onChange(next);
            onSearch(next);
          }}
          onEnter={() => onSearch()}
        />
      </div>

      {/* Status Filter */}
      <div className="shrink-0">
        <select
          aria-label="Status"
          className={selectClass(Boolean(filter.status))}
          value={filter.status}
          onChange={(e) => apply("status", e.target.value)}
        >
          <option value="">All Statuses</option>
          {filterOptions.statuses.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {/* Priority Filter */}
      <div className="shrink-0">
        <select
          aria-label="Priority"
          className={selectClass(Boolean(filter.priority))}
          value={filter.priority || ""}
          onChange={(e) => apply("priority", e.target.value)}
        >
          <option value="">All Priorities</option>
          {sortedPriorities.map((pr) => (
            <option key={pr} value={pr}>
              {pr}
            </option>
          ))}
        </select>
      </div>

      {/* Gate Process Filter */}
      <div className="shrink-0">
        <select
          aria-label="Gate Process"
          className={selectClass(Boolean(filter.gate_name))}
          value={filter.gate_name || ""}
          onChange={(e) => apply("gate_name", e.target.value)}
        >
          <option value="">All Gate Process</option>
          {(filterOptions.gate_names || []).map((gate) => (
            <option key={gate} value={gate}>
              {gate}
            </option>
          ))}
        </select>
      </div>

      {/* Lot Status Filter */}
      <div className="shrink-0">
        <select
          aria-label="Lot Status"
          className={selectClass(Boolean(filter.lot_status))}
          value={filter.lot_status}
          onChange={(e) => apply("lot_status", e.target.value)}
        >
          <option value="">All Lot Status</option>
          {filterOptions.lot_statuses.map((lst) => (
            <option key={lst} value={lst}>
              {lst}
            </option>
          ))}
        </select>
      </div>

      {/* Sort */}
      <SortByDropdown sortModel={sortModel} onSortModelChange={onSortModelChange} />

      {/* Due date — one compact button; pickers + Search / Clear open in a panel */}
      <DueDateFilter
        startdate={filter.startdate}
        stopdate={filter.stopdate}
        onStartChange={(v) => set("startdate", v)}
        onStopChange={(v) => set("stopdate", v)}
        onSearch={() => onSearch()}
        onClear={handleClearDate}
      />

      {/* Reset every filter (outside the date group because it clears everything) */}
      <button
        type="button"
        className="btn btn-xs h-8 px-2.5 btn-ghost rounded-lg text-xs font-semibold gap-1 text-base-content/60 hover:text-base-content cursor-pointer"
        onClick={onReset}
        title="Reset all filters"
      >
        Reset All
      </button>
    </div>
  );
};

export default memo(FilterBar);
