import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
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
  MoreHorizontal,
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
  const [confirmDialog, setConfirmDialog] = useState<"discard" | "leave" | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirmDialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmDialog(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [confirmDialog]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [moreMenuOpen]);

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!readOnly && isDraftModified) {
      setConfirmDialog("leave");
      return;
    }
    navigate("/planning/planning_summary_gate");
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-base-100 border border-base-content/9 shadow-xs">
      {/* Left: Back link, Process Group Pill Switcher, Title & Interactive Plan History Button */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={handleBackClick}
          className="btn btn-xs h-8 px-2.5 rounded-lg border border-base-content/9 bg-base-100 hover:bg-base-200 text-base-content/75 hover:text-base-content text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
          title="Back to Planning Summary Gate"
        >
          <ArrowLeft size={14} className="text-base-content/60" />
          <span>Summary Gate</span>
        </button>

        {/* Process Group Pill Switcher (identical to GateFilterBar) */}
        <div
          role="group"
          aria-label="Process group"
          className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-content/9"
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
                : "bg-base-100 text-base-content/80 border-base-content/9 hover:bg-base-200 hover:border-base-content/30"
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
        <div className="inline-flex h-8 items-center gap-1.5 px-2.5 rounded-lg bg-base-200/60 border border-base-content/9 text-xs font-semibold text-base-content/80 tabular-nums">
          <Calendar size={13} className="text-primary opacity-80" />
          <span>{dateRangeText}</span>
        </div>

        {/* Configuration & Refresh Group */}
        <div className="inline-flex items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenCapacityModal}
            disabled={readOnly}
            title="Configure machines (MC), shifts, and OT calendar"
            className="btn btn-xs h-8 px-3 rounded-lg bg-base-100 border border-base-content/9 hover:bg-base-200 text-xs font-semibold text-base-content flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Settings size={13} className="text-base-content/70" />
            <span>Capacity & OT</span>
          </button>

          <button
            type="button"
            onClick={onReload}
            disabled={isLoading || readOnly}
            title="Reload work and capacity from Summary Gate. Unsaved draft moves are kept."
            aria-label="Reload data"
            className="btn btn-xs h-8 w-8 p-0 rounded-lg bg-base-100 border border-base-content/9 hover:bg-base-200 text-base-content flex items-center justify-center cursor-pointer shadow-2xs transition-colors"
          >
            <RefreshCw
              size={13}
              className={`text-base-content/70 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-base-300 hidden sm:block mx-0.5" />

        {/* Action Group: Discard Draft (if draft modified) + Save Plan (Primary) + More Options (···) */}
        <div className="inline-flex items-center gap-1.5">
          {/* Discard Draft button (paired directly with Save Plan) */}
          {isDraftModified && onDiscardDraft && !readOnly && (
            <button
              type="button"
              onClick={() => setConfirmDialog("discard")}
              disabled={isLoading}
              title="Discard unsaved draft moves and restore the current saved plan"
              className="btn btn-xs h-8 px-2.5 rounded-lg bg-base-100 border border-base-content/9 hover:bg-base-200 text-xs font-semibold text-base-content/80 hover:text-base-content flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
            >
              <Undo2 size={13} />
              <span>Discard Draft</span>
            </button>
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

          {/* More Options Menu (···) with Reset to Required */}
          {!readOnly && (
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen((prev) => !prev)}
                title="More actions"
                aria-expanded={moreMenuOpen}
                aria-haspopup="true"
                className={`btn btn-xs h-8 w-8 p-0 rounded-lg border text-base-content/70 hover:text-base-content flex items-center justify-center cursor-pointer shadow-2xs transition-colors ${
                  moreMenuOpen
                    ? "bg-base-200 border-base-content/30"
                    : "bg-base-100 border-base-content/9 hover:bg-base-200"
                }`}
              >
                <MoreHorizontal size={15} />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-base-content/9 bg-base-100 py-1 shadow-lg z-50">
                  <button
                    type="button"
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onOpenPlanHistory();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-base-content hover:bg-base-200/70 transition-colors cursor-pointer"
                  >
                    <History size={14} className="text-base-content/60" />
                    <span>Plan History</span>
                  </button>

                  <div className="my-1 border-t border-base-200" />

                  <button
                    type="button"
                    disabled={!canReset}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      onResetRequired();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>Reset to Required</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmDialog &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="header-confirm-title"
              aria-describedby="header-confirm-description"
              className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-5 shadow-2xl text-base-content"
            >
              <div>
                <h2 id="header-confirm-title" className="text-base font-bold text-base-content leading-tight">
                  {confirmDialog === "discard" ? "Discard Unsaved Draft?" : "Leave Without Saving?"}
                </h2>
                <p className="text-xs text-base-content/55 mt-0.5">
                  {draftChangesCount > 0
                    ? `${draftChangesCount} unsaved change(s) on this board`
                    : "Unsaved draft changes"}
                </p>
              </div>

              <div id="header-confirm-description" className="mt-4 text-xs leading-relaxed text-base-content/75">
                {confirmDialog === "discard" ? (
                  <p>
                    All unsaved date moves and card ordering will be discarded and restored to the current saved plan.
                  </p>
                ) : (
                  <p>
                    You have unsaved changes on the Capacity Leveling board. Leaving now will discard your draft edits.
                  </p>
                )}
              </div>

              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => setConfirmDialog(null)}
                  className="btn btn-sm h-9 px-4 rounded-xl border border-base-300 bg-base-100 hover:bg-base-200 text-xs font-semibold text-base-content cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = confirmDialog;
                    setConfirmDialog(null);
                    if (action === "discard") {
                      onDiscardDraft?.();
                    } else {
                      navigate("/planning/planning_summary_gate");
                    }
                  }}
                  className="btn btn-sm h-9 px-4 rounded-xl border-0 bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs cursor-pointer"
                >
                  {confirmDialog === "discard" ? "Discard Draft" : "Leave Page"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
