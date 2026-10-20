import { Search, RotateCcw, FileSpreadsheet, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanningFilter } from "../types";

interface FilterBarProps {
  filter: PlanningFilter;
  onChange: (filter: PlanningFilter) => void;
  onSearch: () => void;
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

const FilterBar = ({ filter, onChange, onSearch, onReset, onExport, loading }: FilterBarProps) => {
  const set = (key: keyof PlanningFilter, value: string) =>
    onChange({ ...filter, [key]: value });

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Product" className="w-full sm:w-60">
            <label className="input input-sm w-full">
              <Search size={14} className="opacity-50" />
              <input
                type="text"
                placeholder="ค้นหาชื่อ product"
                value={filter.prd_name}
                onChange={(e) => set("prd_name", e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
              />
            </label>
          </Field>

          <Field label="Status" className="w-full sm:w-44">
            <select
              className="select select-sm w-full"
              value={filter.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">ทั้งหมด</option>
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
            <button className="btn btn-sm btn-primary" onClick={onSearch} disabled={loading}>
              {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
              ค้นหา
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onReset} disabled={loading}>
              <RotateCcw size={16} />
              ล้าง
            </button>
          </div>

          <button className="btn btn-sm btn-success btn-outline ml-auto" onClick={onExport} disabled={loading}>
            <FileSpreadsheet size={16} />
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;
