import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Save, X } from "lucide-react";
import type { LevelingKpiData } from "../types";

interface SavePlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSave: (reason: string) => void;
  nextVersion: number;
  isSaving: boolean;
  kpis: LevelingKpiData;
  resetToRequired?: boolean;
}

const QUICK_REASONS = [
  "Open OT on weekend",
  "Customer priority / Expedited PO",
  "Material readiness aligned",
];

export const SavePlanModal: React.FC<SavePlanModalProps> = ({
  isOpen,
  onClose,
  onConfirmSave,
  nextVersion,
  isSaving,
  kpis,
  resetToRequired = false,
}) => {
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  useEffect(() => {
    if (isOpen) {
      setReason(resetToRequired ? "Reset to Required" : "");
      setErrorMsg("");
    }
  }, [isOpen, resetToRequired]);

  if (!isOpen || typeof document === "undefined") return null;

  const movedCount = kpis.movedCount;
  const hasRedCells = kpis.overloadCells > 0;
  // Only lateness the planner created needs a reason; overdue work that was not moved does not.
  const hasLateLots = kpis.movedLateCards > 0;
  const requiresReason = hasRedCells || hasLateLots;

  const handleSave = () => {
    if (requiresReason && !reason.trim()) {
      setErrorMsg(
        "Please enter or select a reason before saving the plan."
      );
      return;
    }
    onConfirmSave(reason);
  };

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save Plan"
        className="w-full max-w-[520px] rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content"
      >
        {/* 1. Header */}
        <div className="px-6 py-4 border-b border-base-300 flex items-center justify-between bg-base-200/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#eef2ff] border border-indigo-200 flex items-center justify-center text-[#4f46e5] shrink-0">
              <Save size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-base-content leading-tight">
                Save Plan v{nextVersion}
              </h3>
              <p className="text-xs text-base-content/60 mt-0.5">
                Saves arrival dates and card order as a new version; earlier versions are kept
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost btn-square h-8 w-8 rounded-lg text-base-content/60 hover:text-base-content cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* 2. Body */}
        <div className="p-6 flex flex-col gap-4 tabular-nums">
          {resetToRequired && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            Saving the reset draft for all process groups and gates. Earlier versions are kept.
            Zero moved cards means the saved date overrides will be cleared. Any changes made after resetting are included.
          </p>}
          {/* Summary 3-Card Row */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-base-200/50 border border-base-300 text-center">
              <div className="text-xs font-semibold text-base-content/60">
                Moved Cards
              </div>
              <div className="text-lg font-extrabold text-[#4f46e5] mt-0.5">
                {movedCount} <span className="text-xs font-semibold">cards</span>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border text-center ${
                hasRedCells
                  ? "bg-rose-50/70 border-rose-200 text-rose-800"
                  : "bg-emerald-50/70 border-emerald-200 text-emerald-800"
              }`}
            >
              <div className="text-xs font-semibold opacity-75">
                Overload Gates
              </div>
              <div className="text-lg font-extrabold mt-0.5">
                {kpis.overloadCells}{" "}
                <span className="text-xs font-semibold">cells</span>
              </div>
            </div>

            <div
              className={`p-3 rounded-xl border text-center ${
                hasLateLots
                  ? "bg-amber-50/80 border-amber-200 text-amber-900"
                  : "bg-emerald-50/70 border-emerald-200 text-emerald-800"
              }`}
            >
              <div className="text-xs font-semibold opacity-75">Moved Past Must-out</div>
              <div className="text-lg font-extrabold mt-0.5">
                {kpis.movedLateCards}{" "}
                <span className="text-xs font-semibold">cards</span>
              </div>
            </div>
          </div>

          {/* Warning or Ready Banner */}
          {requiresReason ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <AlertTriangle size={17} className="text-amber-600 shrink-0" />
                <span>Approval Note Required</span>
              </div>
              <ul className="text-xs space-y-1 text-amber-900/90 pl-6 list-disc">
                {hasRedCells && (
                  <li>
                    <strong>{kpis.overloadCells} gate cell(s)</strong>{" "}
                    exceed daily capacity or have work with zero capacity.
                  </li>
                )}
                {hasLateLots && (
                  <li>
                    <strong>{kpis.movedLateCards} moved card(s)</strong> are planned
                    after their must-out date
                    {kpis.orderCards > 0 ? `, ${kpis.orderCards} of them on or after the next gate's date` : ""}.
                  </li>
                )}
              </ul>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span className="text-xs font-semibold leading-relaxed">
                No gate-day exceeds capacity and no card was moved past its
                must-out date.
              </span>
            </div>
          )}

          {(kpis.missingPlanningCards > 0 || kpis.unsetCapacityGates.length > 0) && (
            <div className="px-4 py-2.5 bg-base-200/60 border border-base-300 rounded-xl text-xs text-base-content/70 leading-relaxed">
              Load % is incomplete:
              {kpis.unsetCapacityGates.length > 0 && ` MC is not set for ${kpis.unsetCapacityGates.join(", ")}.`}
              {kpis.missingPlanningCards > 0 && ` ${kpis.missingPlanningCards.toLocaleString()} card(s) need valid gate lead time and normal shift minutes.`}
            </div>
          )}

          {/* Reason Input (if required) */}
          {requiresReason && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-base-content">
                  Reason / Justification{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] text-base-content/50">
                  Required for overload / late cards
                </span>
              </div>

              {/* Quick Select Reason Chips */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_REASONS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setReason(preset);
                      if (errorMsg) setErrorMsg("");
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                      reason === preset
                        ? "bg-[#eef2ff] border-[#4f46e5] text-[#4f46e5]"
                        : "bg-base-200/60 border-base-300 text-base-content/75 hover:bg-base-200"
                    }`}
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (errorMsg) setErrorMsg("");
                }}
                placeholder="Enter justification or click a quick reason above..."
                className="w-full rounded-xl border border-base-300 bg-base-100 p-3 text-sm text-base-content placeholder:text-base-content/40 focus:border-[#4f46e5] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/15"
              />
              {errorMsg && (
                <span className="text-xs font-semibold text-rose-600 block">
                  {errorMsg}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 3. Footer with Clear, Large Action Buttons */}
        <div className="px-6 py-4 border-t border-base-300 bg-base-200/30 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm h-10 px-5 bg-base-100 border border-base-300 hover:bg-base-200 text-base-content text-sm font-semibold rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn-sm h-10 px-6 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-sm font-bold rounded-xl border-0 shadow-xs cursor-pointer"
          >
            {isSaving ? "Saving..." : "Confirm & Save Plan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
