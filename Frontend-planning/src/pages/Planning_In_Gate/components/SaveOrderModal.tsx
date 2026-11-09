import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Save, X } from "lucide-react";
import type { OrderDiff } from "../types";
import { CapacityEffect, MoveLine } from "./HistoryParts";

const QUICK_REASONS = ["Customer expedite", "QA hold", "Material shortage", "OT opened", "Machine down"];

interface SaveOrderModalProps {
  isOpen: boolean;
  title: string; // "FFPC · Mon 09/11"
  diff: OrderDiff;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

/** Confirm "Save order" + reason (required when a lot drops below the red line) */
export const SaveOrderModal: React.FC<SaveOrderModalProps> = ({ isOpen, title, diff, onClose, onConfirm }) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const required = diff.pushedOut.length > 0;

  useEffect(() => {
    if (isOpen) {
      setReason("");
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  const handleSave = () => {
    if (required && !reason.trim()) {
      setError("Please give a reason — some lots no longer fit today.");
      return;
    }
    onConfirm(reason.trim());
  };

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Save order"
        className="w-full max-w-[480px] overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-base-300 bg-base-200/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-200 bg-[#eef2ff] text-[#4f46e5]">
              <Save size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Save order</h3>
              <p className="text-xs text-base-content/60">{title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost btn-square rounded-lg" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 text-sm">
          <div>
            <div className="mb-1 text-xs font-bold text-base-content/60">
              {diff.moves.length === 1 ? "1 lot moved" : `${diff.moves.length} lots moved`}
            </div>
            <ul className="max-h-48 overflow-y-auto rounded-xl border border-base-300 px-3 py-1.5">
              {diff.moves.map((m) => (
                <MoveLine key={m.lotId} move={m} />
              ))}
              {diff.moves.length === 0 && (
                <li className="py-1 text-base-content/50">Order changed back to the same positions.</li>
              )}
            </ul>
            <CapacityEffect diff={diff} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="save-order-reason" className="text-xs font-bold">
                Reason {required ? <span className="text-rose-500">*</span> : <span className="font-normal text-base-content/50">(optional)</span>}
              </label>
              {required && <span className="text-[11px] text-base-content/50">Required — lots drop below the red line</span>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setReason(r);
                    setError("");
                  }}
                  className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                    reason === r
                      ? "border-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
                      : "border-base-300 bg-base-200/60 text-base-content/75 hover:bg-base-200"
                  }`}
                >
                  + {r}
                </button>
              ))}
            </div>
            <textarea
              id="save-order-reason"
              rows={2}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError("");
              }}
              placeholder="Why did the order change?"
              className="w-full rounded-xl border border-base-300 bg-base-100 p-3 text-sm placeholder:text-base-content/40 focus:border-[#4f46e5] focus:outline-none focus:ring-2 focus:ring-[#4f46e5]/15"
            />
            {error && <span className="block text-xs font-semibold text-rose-600">{error}</span>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-base-300 bg-base-200/30 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm h-9 rounded-xl border border-base-300 bg-base-100 px-5 font-semibold hover:bg-base-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-sm h-9 rounded-xl border-0 bg-[#4f46e5] px-5 font-bold text-white hover:bg-[#4338ca]"
          >
            Save order
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
