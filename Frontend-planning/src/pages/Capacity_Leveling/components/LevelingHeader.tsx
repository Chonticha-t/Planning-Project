import React from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Settings,
  Zap,
  Save,
  ArrowLeft,
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
  onAutoLevel: () => void;
  onSavePlan: () => void;
  planVersion: number;
  isDraftModified: boolean;
}

export const LevelingHeader: React.FC<LevelingHeaderProps> = ({
  category,
  onCategoryChange,
  dateRangeText,
  onOpenCapacityModal,
  onAutoLevel,
  onSavePlan,
  planVersion,
  isDraftModified,
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
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-base-200/70 text-base-content/70 border border-base-300">
            {isDraftModified ? "Draft · not saved" : "Saved"}
          </span>
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

        {/* Auto-level Button */}
        <button
          type="button"
          onClick={onAutoLevel}
          className="btn btn-xs h-8 px-3 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content flex items-center gap-1.5 cursor-pointer"
        >
          <Zap size={13} className="text-amber-500 fill-amber-400" />
          <span>Auto-level</span>
        </button>

        {/* Save Plan Button */}
        <button
          type="button"
          onClick={onSavePlan}
          className="btn btn-xs h-8 px-3.5 rounded-lg btn-primary text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <Save size={13} />
          <span>Save Plan</span>
        </button>
      </div>
    </div>
  );
};
