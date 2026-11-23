import { memo, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, Check, ChevronDown, FileSpreadsheet, RefreshCw } from "lucide-react";
import ProductCombobox from "../../SO_Balance/components/ProductCombobox";
import type { Horizon, UnitFilter } from "../types";
import { addDays, rangeLabel } from "../overviewView";

export type OverviewSortField = "prd_name" | "fg_stock";
export type OverviewSort = { field: OverviewSortField; dir: "asc" | "desc" } | null;

const SORT_OPTIONS: { field: OverviewSortField; label: string }[] = [
  { field: "prd_name", label: "Product" },
  { field: "fg_stock", label: "Inventory" },
];

const SortByDropdown = ({
  sort,
  onSortChange,
}: {
  sort: OverviewSort;
  onSortChange: (next: OverviewSort) => void;
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [draftField, setDraftField] = useState<OverviewSortField | "">(sort?.field ?? "");
  const [draftDir, setDraftDir] = useState<"asc" | "desc">(sort?.dir ?? "desc");

  useEffect(() => {
    setDraftField(sort?.field ?? "");
    setDraftDir(sort?.dir ?? "desc");
  }, [sort, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel = SORT_OPTIONS.find((o) => o.field === sort?.field)?.label;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex h-8 items-center gap-1.5 px-3 rounded-lg border text-xs font-semibold transition-all cursor-pointer whitespace-nowrap focus:outline-none ${
          open || sort
            ? "bg-primary/10 border-primary/40 text-primary"
            : "bg-base-200/40 border-base-300 text-base-content/80 hover:bg-base-200/70"
        }`}
      >
        {sort ? (
          sort.dir === "asc" ? (
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
          className={`opacity-50 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1.5 w-60 rounded-xl border border-base-200 bg-base-100 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-base-200 bg-base-200/30">
            <span className="text-[12px] font-semibold text-base-content/70 uppercase tracking-wider">Sort by</span>
            <button
              type="button"
              onClick={() => {
                setDraftField("");
                setDraftDir("desc");
                onSortChange(null);
              }}
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
                  <span className={`text-[13px] ${checked ? "font-semibold text-primary" : "text-base-content/80 font-medium"}`}>
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
              onClick={() => {
                onSortChange(draftField ? { field: draftField, dir: draftDir } : null);
                setOpen(false);
              }}
              className="btn btn-sm btn-primary w-full rounded-lg font-medium text-xs shadow-xs"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface OverviewFilterBarProps {
  unit: UnitFilter;
  onUnitChange: (unit: UnitFilter) => void;
  horizon: Horizon;
  startDate: string;
  products: string[];
  search: string;
  onSearchChange: (value: string) => void;
  sort: OverviewSort;
  onSortChange: (sort: OverviewSort) => void;
  updatedLabel: string;
  loading: boolean;
  onRefresh: () => void;
  onExport: () => void;
  canExport: boolean;
  inline?: boolean;
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
            active ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span
              className={`inline-flex min-w-5 h-4 px-1 items-center justify-center rounded-full text-[10.5px] tabular-nums ${
                active
                  ? "bg-primary-content/20 text-primary-content"
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
  startDate,
  products,
  search,
  onSearchChange,
  sort,
  onSortChange,
  updatedLabel,
  loading,
  onRefresh,
  onExport,
  canExport,
  inline = false,
}: OverviewFilterBarProps) => {
  const controls = (
    <>
      <PillGroup label="Item unit" value={unit} options={UNIT_OPTIONS} onSelect={onUnitChange} />

      <div className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg bg-base-200/40 border border-base-300 text-xs font-semibold text-base-content/85 tabular-nums">
        <CalendarRange size={14} className="text-base-content/60 shrink-0" aria-hidden="true" />
        <span>{rangeLabel(startDate, addDays(startDate, horizon - 1))}</span>
      </div>

      <div className="w-56 max-w-full">
        <ProductCombobox
          value={search}
          options={products}
          onChange={onSearchChange}
          onSelect={onSearchChange}
          onEnter={() => {}}
        />
      </div>

      <SortByDropdown sort={sort} onSortChange={onSortChange} />
    </>
  );

  if (inline) {
    return <div className="flex flex-wrap items-center gap-2">{controls}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {controls}

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
};

export default memo(OverviewFilterBar);
