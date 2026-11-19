import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Settings,
  RefreshCw,
  Save,
  ArrowLeft,
  History,
  RotateCcw,
  Undo2,
  ChevronRight,
} from "lucide-react";
import type { ProcessCategory } from "../types";

const PROCESS_GROUP_OPTIONS: { value: ProcessCategory; label: string }[] = [
  { value: "ALL", label: "ALL" },
  { value: "EFPC_GEN", label: "FPC-GEN" },
  { value: "EFPC_AUTO", label: "FPC-AUTO" },
  { value: "SMT", label: "SMT" },
];

interface LevelingHeaderProps {
  readOnly?: boolean;
  category: ProcessCategory;
  onCategoryChange: (cat: ProcessCategory) => void;
  dateRangeText: string;
  editingPresence?: React.ReactNode;
  onOpenCapacityModal: () => void;
  onReload: () => void;
  isLoading: boolean;
  onSavePlan: () => void;
  canSave: boolean;
  saveDisabledReason?: string | null;
  draftChangesCount?: number;
  onDiscardDraft?: () => void;
  onResetRequired: () => void;
  canReset: boolean;
  /** 0 = no plan has been saved yet */
  planVersion: number;
  planSavedAt: string | null;
  isDraftModified: boolean;
  onOpenPlanHistory: () => void;
}

export const LevelingHeader: React.FC<LevelingHeaderProps> = ({
  readOnly = false,
  category,
  onCategoryChange,
  dateRangeText,
  editingPresence,
  onOpenCapacityModal,
  onReload,
  isLoading,
  onSavePlan,
  canSave,
  saveDisabledReason = null,
  draftChangesCount = 0,
  onDiscardDraft,
  onResetRequired,
  canReset,
  planVersion,
  planSavedAt,
  isDraftModified,
  onOpenPlanHistory,
}) => {
  const navigate = useNavigate();

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (
      !readOnly &&
      isDraftModified &&
      !window.confirm(
        "You have unsaved changes on the Capacity Leveling board. Leave without saving?"
      )
    ) {
      return;
    }
    navigate("/planning/planning_summary_gate");
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Left: Back link, Process Group Pill Switcher, Title & Interactive Plan History Button */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={handleBackClick}
          className="btn btn-xs btn-ghost h-8 px-2.5 rounded-lg border border-base-300 text-xs font-semibold text-base-content/70 hover:text-base-content flex items-center gap-1.5 cursor-pointer"
          title="Back to Planning Summary Gate"
        >
          <ArrowLeft size={14} />
          <span>Summary Gate</span>
        </button>

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

          {/* Clearly interactive Plan Status & History Button */}
          <button
            type="button"
            onClick={onOpenPlanHistory}
            aria-label="Open plan history"
            title={
              planSavedAt
                ? `Plan v${planVersion} saved ${planSavedAt} · Click to view version history`
                : "Click to view plan version history"
            }
            className={`group inline-flex h-7 items-center gap-1.5 px-2.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-2xs focus-visible:outline-2 focus-visible:outline-primary ${
              isDraftModified
                ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100/80 hover:border-amber-400"
                : "bg-base-100 text-base-content/80 border-base-300 hover:bg-base-200 hover:border-base-content/30"
            }`}
          >
            <History
              size={12}
              className={
                isDraftModified
                  ? "text-amber-700"
                  : "text-primary opacity-80 group-hover:opacity-100"
              }
            />
            <span>
              {isDraftModified
                ? draftChangesCount > 0
                  ? `Draft (${draftChangesCount} unsaved)`
                  : "Draft · not saved"
                : planVersion > 0
                ? `Plan v${planVersion}`
                : "History"}
            </span>
            <ChevronRight
              size={12}
              className="opacity-50 group-hover:translate-x-0.5 group-hover:opacity-90 transition-transform"
            />
          </button>
        </div>
      </div>

      {/* Right: Filter & Action Controls grouped by function */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {editingPresence}

        {/* Date Window Display */}
        <div className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg bg-base-200/60 border border-base-300 text-xs font-semibold text-base-content/80 tabular-nums">
          <Calendar size={13} className="text-primary opacity-80" />
          <span>{dateRangeText}</span>
        </div>

        {/* Configuration & Refresh Group */}
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenCapacityModal}
            disabled={readOnly}
            className="btn btn-xs h-8 px-3 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content flex items-center gap-1.5 cursor-pointer"
          >
            <Settings size={13} className="text-base-content/70" />
            <span>Capacity</span>
          </button>

          <button
            type="button"
            onClick={onReload}
            disabled={isLoading || readOnly}
            title="Reload work and capacity from Summary Gate. Unsaved moves are kept."
            className="btn btn-xs h-8 px-2.5 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw
              size={13}
              className={`text-base-content/70 ${isLoading ? "animate-spin" : ""}`}
            />
            <span className="hidden md:inline">Reload</span>
          </button>
        </div>

        {/* Destructive / Reset Actions (Separated from primary Save) */}
        {!readOnly && (
          <>
            <div className="h-5 w-[1px] bg-base-300 hidden sm:block mx-0.5" />

            <div className="inline-flex items-center gap-1.5">
              {isDraftModified && onDiscardDraft && (
                <button
                  type="button"
                  onClick={onDiscardDraft}
                  disabled={isLoading}
                  title="Discard unsaved draft moves and restore the current saved plan"
                  className="btn btn-xs h-8 px-2.5 rounded-lg bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content/80 hover:text-base-content flex items-center gap-1.5 cursor-pointer"
                >
                  <Undo2 size={13} />
                  <span>Discard Draft</span>
                </button>
              )}

              <button
                type="button"
                onClick={onResetRequired}
                disabled={!canReset || readOnly}
                title="Reset arrival dates and card order for all process groups and gates back to source arrivals. Review before saving."
                className="btn btn-xs h-8 px-2.5 rounded-lg bg-base-100 border border-amber-300 hover:bg-amber-50 text-amber-900 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>Reset to Required</span>
              </button>
            </div>
          </>
        )}

        {/* Primary Action: Save Plan (with wrapper for disabled tooltip explanation) */}
        <div
          className="inline-flex"
          title={
            !canSave && saveDisabledReason
              ? saveDisabledReason
              : isDraftModified
              ? "Save draft changes as a new plan version"
              : "Save a new plan version"
          }
        >
          <button
            type="button"
            onClick={onSavePlan}
            disabled={!canSave}
            className="btn btn-xs h-8 px-3.5 rounded-lg btn-primary text-xs font-semibold shadow-xs flex items-center gap-1.5 cursor-pointer tabular-nums"
          >
            <Save size={13} />
            <span>
              Save Plan
              {isDraftModified && draftChangesCount > 0
                ? ` (${draftChangesCount})`
                : ""}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
