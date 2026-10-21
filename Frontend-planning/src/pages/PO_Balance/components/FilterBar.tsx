import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Search,
  RotateCcw,
  FileSpreadsheet,
  RefreshCw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check,
} from "lucide-react";
import type { GridSortDirection, GridSortModel } from "@mui/x-data-grid";
import { SORT_OPTIONS, type PlanningFilter } from "../types";
import ProductCombobox from "./ProductCombobox";

interface FilterBarProps {
  filter: PlanningFilter;
  products: string[];
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onChange: (filter: PlanningFilter) => void;
  onSearch: (filter?: PlanningFilter) => void;
  onReset: () => void;
  onExport: () => void;
  loading: boolean;
}

// label อยู่บน input เสมอ (daisyUI 5 ไม่มี form-control / label-text แล้ว)
const Field = ({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <span className="text-xs font-medium text-base-content/70">{label}</span>
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

  // ซิงค์ค่าเริ่มต้นทุกครั้งที่เปิดเมนู หรือเมื่อ sortModel ถูกรีเซ็ตจากภายนอก
  useEffect(() => {
    setDraftField(activeField);
    setDraftDir(activeDir);
  }, [activeField, activeDir, open]);

  // ปิดเมนูเมื่อคลิกข้างนอก
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
        className={`btn btn-sm gap-2 font-medium ${
          activeField
            ? "btn-outline btn-primary"
            : "bg-base-100 border-base-300 text-base-content hover:bg-base-200"
        }`}
      >
        {activeField ? (
          activeDir === "asc" ? (
            <ArrowUp size={15} />
          ) : (
            <ArrowDown size={15} />
          )
        ) : (
          <ArrowUpDown size={15} className="opacity-70" />
        )}
        <span className="text-xs">
          {activeLabel ? `Sort: ${activeLabel}` : "Sort by..."}
        </span>
        <ChevronDown
          size={14}
          className={`opacity-60 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden">
          {/* ส่วนหัว Sort by + ปุ่ม Clear สไตล์รูปที่ 1 */}
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-base-300 bg-base-200/40">
            <span className="text-xs font-bold text-base-content/70">Sort by</span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-semibold text-error hover:opacity-80 cursor-pointer"
            >
              Clear
            </button>
          </div>

          {/* รายการคอลัมน์พร้อมช่องติ๊กขอบมนสไตล์รูปที่ 1 */}
          <div className="max-h-56 overflow-y-auto px-2 py-1.5 flex flex-col gap-0.5">
            {SORT_OPTIONS.map((opt) => {
              const checked = draftField === opt.field;
              return (
                <button
                  key={opt.field}
                  type="button"
                  onClick={() => setDraftField(checked ? "" : opt.field)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg hover:bg-base-200 text-left transition-colors cursor-pointer"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
                      checked
                        ? "border-primary bg-primary text-primary-content"
                        : "border-primary/60 bg-transparent"
                    }`}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="text-xs font-semibold text-base-content">{opt.label}</span>
                </button>
              );
            })}
          </div>

          {/* ส่วนเลือก Ascending / Descending สไตล์รูปที่ 2 */}
          <div className="border-t border-base-300 px-2.5 py-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setDraftDir("asc")}
              className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border-[1.5px] ${
                draftDir === "asc"
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-transparent text-base-content/80 hover:bg-base-200 font-medium"
              }`}
            >
              <ArrowUp size={15} />
              <span>Ascending</span>
            </button>

            <button
              type="button"
              onClick={() => setDraftDir("desc")}
              className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border-[1.5px] ${
                draftDir === "desc"
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-transparent text-base-content/80 hover:bg-base-200 font-medium"
              }`}
            >
              <ArrowDown size={15} />
              <span>Descending</span>
            </button>
          </div>

          {/* ปุ่มยืนยันด้านล่างสุดสไตล์รูปที่ 1 */}
          <div className="p-2.5 pt-1.5 border-t border-base-300">
            <button
              type="button"
              onClick={handleConfirm}
              className="btn btn-sm btn-primary w-full rounded-lg font-semibold"
            >
              Confirm Sort
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FilterBar = ({
  filter,
  products,
  sortModel,
  onSortModelChange,
  onChange,
  onSearch,
  onReset,
  onExport,
  loading,
}: FilterBarProps) => {
  const set = (key: keyof PlanningFilter, value: string) =>
    onChange({ ...filter, [key]: value });

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Product" className="w-full sm:w-60">
            <ProductCombobox
              value={filter.prd_name}
              options={products}
              onChange={(v) => set("prd_name", v)}
              onSelect={(v) => {
                // ส่ง filter ใหม่ไปตรง ๆ เพราะ state ยังไม่อัปเดตในรอบนี้
                const next = { ...filter, prd_name: v };
                onChange(next);
                onSearch(next);
              }}
              onEnter={() => onSearch()}
            />
          </Field>

          <Field label="Status" className="w-full sm:w-44">
            <select
              className="select select-sm w-full"
              value={filter.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">All</option>
              <option value="ready">ready</option>
              <option value="production plan">production plan</option>
            </select>
          </Field>

          <Field label="Due date" className="w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="input input-sm w-full sm:w-40"
                value={filter.startdate}
                onChange={(e) => set("startdate", e.target.value)}
              />
              <span className="text-base-content/50">–</span>
              <input
                type="date"
                className="input input-sm w-full sm:w-40"
                value={filter.stopdate}
                min={filter.startdate || undefined}
                onChange={(e) => set("stopdate", e.target.value)}
              />
            </div>
          </Field>

          <div className="flex gap-2">
            <button className="btn btn-sm btn-primary" onClick={() => onSearch()} disabled={loading}>
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onReset} disabled={loading}>
              <RotateCcw size={16} />
              Clear
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <SortByDropdown sortModel={sortModel} onSortModelChange={onSortModelChange} />
            <button className="btn btn-sm btn-success btn-outline" onClick={onExport} disabled={loading}>
              <FileSpreadsheet size={16} />
              Export Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;
