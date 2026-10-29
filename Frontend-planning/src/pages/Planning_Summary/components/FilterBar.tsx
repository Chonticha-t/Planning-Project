import { memo, useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import {
  Search,
  RotateCcw,
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
  type PlanningSummaryFilter,
  type DistinctFilters,
} from "../types";
import ProductCombobox from "./ProductCombobox";
import CallyDatePicker from "@/components/CallyCalendar";

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
    <span className="text-[11px] font-semibold text-base-content/50 uppercase tracking-wider whitespace-nowrap">
      {label}
    </span>
    {children}
  </div>
);

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
        className={`btn btn-sm bg-base-100 text-base-content text-[13px] gap-1.5 font-medium shadow-none hover:bg-base-200/60 rounded-lg focus:outline-none transition-colors border whitespace-nowrap ${
          open
            ? "border-primary bg-primary/5 text-primary"
            : activeField
            ? "border-primary/50 text-primary bg-primary/5"
            : "border-base-content/20 hover:border-base-content/30"
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

const selectClass =
  "select select-sm text-[13px] w-full rounded-lg border-base-content/20 bg-base-100 hover:border-base-content/30 focus:border-primary focus:outline-none transition-colors whitespace-nowrap truncate";

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
      <div className="flex flex-wrap items-end gap-2.5">
        {/* Product / Lot No Filter */}
        <Field label="Product / Lot No" className="w-full sm:w-48">
          <ProductCombobox
            value={filter.prd_name}
            options={searchOptions}
            placeholder="Search Product or Lot No..."
            onChange={(v) => set("prd_name", v)}
            onSelect={(v) => {
              const next = { ...filter, prd_name: v };
              onChange(next);
              onSearch(next);
            }}
            onEnter={() => onSearch()}
          />
        </Field>

        {/* Type Filter (94 = FPC, 95 = SMT) */}
        <Field label="Type" className="w-full sm:w-20">
          <select
            className={selectClass}
            value={filter.item_prefix || ""}
            onChange={(e) => {
              const nextPrefix = e.target.value;
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
          >
            {ITEM_UNIT_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Status Filter */}
        <Field label="Status" className="w-full sm:w-32">
          <select
            className={selectClass}
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

        {/* Priority Filter */}
        <Field label="Priority" className="w-full sm:w-28">
          <select
            className={selectClass}
            value={filter.priority || ""}
            onChange={(e) => {
              const next = set("priority", e.target.value);
              onSearch(next);
            }}
          >
            <option value="">All Priorities</option>
            {(filterOptions.priorities || []).map((pr) => (
              <option key={pr} value={pr}>
                {pr}
              </option>
            ))}
          </select>
        </Field>

        {/* Gate Process Filter */}
        <Field label="Gate Process" className="w-full sm:w-36">
          <select
            className={selectClass}
            value={filter.gate_name || ""}
            onChange={(e) => {
              const next = set("gate_name", e.target.value);
              onSearch(next);
            }}
          >
            <option value="">All Gate Process</option>
            {(filterOptions.gate_names || []).map((gate) => (
              <option key={gate} value={gate}>
                {gate}
              </option>
            ))}
          </select>
        </Field>

        {/* Lot Status Filter */}
        <Field label="Lot Status" className="w-full sm:w-32">
          <select
            className={selectClass}
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

        {/* Sort Filter */}
        <Field label="Sort" className="shrink-0">
          <SortByDropdown
            sortModel={sortModel}
            onSortModelChange={onSortModelChange}
          />
        </Field>

        {/* Due date Filter with Cally Calendar */}
        <Field label="Due date" className="w-full sm:w-auto">
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
            <CallyDatePicker
              value={filter.startdate}
              max={filter.stopdate || undefined}
              placeholder="Start date"
              className="w-full sm:w-38"
              onChange={(v) => set("startdate", v)}
            />
            <span className="text-base-content/40">–</span>
            <CallyDatePicker
              value={filter.stopdate}
              min={filter.startdate || undefined}
              placeholder="End date"
              className="w-full sm:w-38"
              onChange={(v) => set("stopdate", v)}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary rounded-lg text-[13px] font-medium shadow-xs px-3 gap-1.5 cursor-pointer"
              onClick={() => onSearch()}
            >
              <Search size={14} className="shrink-0" />
              <span>Search</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost rounded-lg text-[13px] gap-1 px-2 text-base-content/60 hover:text-base-content cursor-pointer"
              onClick={handleClearDate}
              disabled={!filter.startdate && !filter.stopdate}
              title="Clear date"
            >
              <RotateCcw size={13} />
              <span>Clear</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost rounded-lg text-[13px] gap-1 px-2 text-base-content/60 hover:text-base-content cursor-pointer"
              onClick={onReset}
              title="Reset all filters"
            >
              Reset All
            </button>
          </div>
        </Field>
      </div>
    </div>
  );
};

export default memo(FilterBar);
