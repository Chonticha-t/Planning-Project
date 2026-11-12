import React from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Settings,
  RefreshCw,
  Save,
  ArrowLeft,
  History,
} from "lucide-react";
import type { ProcessCategory } from "../types";

const PROCESS_GROUP_OPTIONS: { value: ProcessCategory; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "EFPC_GEN", label: "FPC-GEN" },
  { value: "EFPC_AUTO", label: "FPC-AUTO" },
  { value: "SMT", label: "SMT" },
];

interface LevelingHeaderProps {
  category: ProcessCategory;
  onCategoryChange: (cat: ProcessCategory) => void;
  dateRangeText: string;
  onOpenCapacityModal: () => void;
  onReload: () => void;
  isLoading: boolean;
  onSavePlan: () => void;
  canSave: boolean;
  /** 0 = no plan has been saved yet */
  planVersion: number;
  planSavedAt: string | null;
  isDraftModified: boolean;
  onOpenPlanHistory: () => void;
}

export const LevelingHeader: React.FC<LevelingHeaderProps> = ({
  category,
  onCategoryChange,
  dateRangeText,
  onOpenCapacityModal,
  onReload,
  isLoading,
  onSavePlan,
  canSave,
  planVersion,
  planSavedAt,
  isDraftModified,
  onOpenPlanHistory,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Left: Back link, Process Group Pill Switcher, Title & Draft status */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Link
          to="/planning/planning_summary_gate"
          className="btn btn-xs btn-ghost h-8 px-2.5 rounded-lg border border-base-300 text-xs font-semibold text-base-content/70 hover:text-base-content flex items-center gap-1.5"
          title="Back to Planning Summary Gate"
        >
          <ArrowLeft size={14} />
          <span>Summary Gate</span>
        </Link>

        {/* Process Group Pill Switcher (identical to GateFilterBar) */}
        <div
          role="group"
          aria-label="Process group"
          className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300"
        >
          {PROCESS_GROUP_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={category === value}
              onClick={() => onCategoryChange(value)}
              className={`btn btn-xs h-full min-h-0 rounded-md px-3 whitespace-nowrap font-bold transition-all ${
                category === value
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-5 w-[1px] bg-base-300 hidden sm:block" />

        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold text-base-content tracking-normal">
            Capacity Leveling
          </h1>
          <button
            type="button"
            onClick={onOpenPlanHistory}
            aria-label="Open plan history"
            title={planSavedAt ? `Plan v${planVersion} saved ${planSavedAt} · View history` : "View plan history"}
            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border cursor-pointer hover:border-primary focus-visible:outline-2 focus-visible:outline-primary ${
              isDraftModified
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-base-200/70 text-base-content/70 border-base-300"
            }`}
          >
            <History size={12} />
            {isDraftModified
              ? "Draft · not saved"
              : planVersion > 0
              ? `Plan v${planVersion} · saved`
              : "No saved plan"}
          </button>
        </div>
      </div>

      {/* Right: Filter & Action Controls matching GateFilterBar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Date Window Display */}
        <div className="inline-flex h-8 items-center gap-1.5 px-3 rounded-lg bg-base-200/60 border border-base-300 text-xs font-semibold text-base-content/80 tabular-nums">
          <Calendar size={13} className="text-primary opacity-80" />
          <span>{dateRangeText}</span>
        </div>

        {/* Capacity Button */}
        <button
          type="button"
          onClick={onOpenCapacityModal}
          className="btn btn-xs h-8 px-3 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content flex items-center gap-1.5 cursor-pointer"
        >
          <Settings size={13} className="text-base-content/70" />
          <span>Capacity</span>
        </button>

        {/* Reload from Summary Gate (unsaved moves are kept) */}
        <button
          type="button"
          onClick={onReload}
          disabled={isLoading}
          title="Reload work and capacity. Unsaved moves are kept."
          className="btn btn-xs h-8 px-3 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw size={13} className={`text-base-content/70 ${isLoading ? "animate-spin" : ""}`} />
          <span>Reload</span>
        </button>

        {/* Save Plan Button */}
        <button
          type="button"
          onClick={onSavePlan}
          disabled={!canSave}
          className="btn btn-xs h-8 px-3.5 rounded-lg btn-primary text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Save size={13} />
          <span>Save Plan</span>
        </button>
      </div>
    </div>
  );
};
