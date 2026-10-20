import { Search, RotateCcw, FileSpreadsheet, RefreshCw } from "lucide-react";
import type { PlanningFilter } from "../types";

interface FilterBarProps {
  filter: PlanningFilter;
  onChange: (filter: PlanningFilter) => void;
  onSearch: () => void;
  onReset: () => void;
  onExport: () => void;
  loading: boolean;
}

const FilterBar = ({ filter, onChange, onSearch, onReset, onExport, loading }: FilterBarProps) => {
  const set = (key: keyof PlanningFilter, value: string) =>
    onChange({ ...filter, [key]: value });

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="form-control">
            <span className="label-text text-xs mb-1">Product</span>
            <input
              type="text"
              placeholder="ค้นหาชื่อ product"
              className="input input-sm input-bordered w-56"
              value={filter.prd_name}
              onChange={(e) => set("prd_name", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
            />
          </label>

          <label className="form-control">
            <span className="label-text text-xs mb-1">Status</span>
            <select
              className="select select-sm select-bordered w-44"
              value={filter.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="ready">ready</option>
              <option value="production plan">production plan</option>
            </select>
          </label>

          <label className="form-control">
            <span className="label-text text-xs mb-1">Due date ตั้งแต่</span>
            <input
              type="date"
              className="input input-sm input-bordered"
              value={filter.startdate}
              onChange={(e) => set("startdate", e.target.value)}
            />
          </label>

          <label className="form-control">
            <span className="label-text text-xs mb-1">ถึง</span>
            <input
              type="date"
              className="input input-sm input-bordered"
              value={filter.stopdate}
              onChange={(e) => set("stopdate", e.target.value)}
            />
          </label>

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

          <button className="btn btn-sm btn-success ml-auto" onClick={onExport} disabled={loading}>
            <FileSpreadsheet size={16} />
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
};

export default FilterBar;
