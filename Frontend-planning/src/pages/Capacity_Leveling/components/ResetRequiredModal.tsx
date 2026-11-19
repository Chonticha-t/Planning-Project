import { useEffect } from "react";
import { createPortal } from "react-dom";

interface Props {
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ResetRequiredModal = ({ busy, error, onCancel, onConfirm }: Props) => {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, onCancel]);

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-required-title"
        aria-describedby="reset-required-description"
        aria-busy={busy}
        className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-5 shadow-2xl text-base-content"
      >
        <div>
          <h2 id="reset-required-title" className="text-base font-bold text-base-content leading-tight">
            Reset to Required?
          </h2>
          <p className="text-xs text-base-content/55 mt-0.5">
            Restore all gates and process groups to source arrivals
          </p>
        </div>

        <div id="reset-required-description" className="mt-4 space-y-2 text-xs leading-relaxed text-base-content/75">
          <p>
            This will reset all arrival dates and card ordering back to the latest{" "}
            <strong className="text-base-content">Summary Gate</strong> schedule.
          </p>
          <p className="text-base-content/60">
            Capacity settings and saved history are kept. Use <strong className="text-base-content">Save Plan</strong> afterwards to save as a new version.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
            {error} Your draft has been kept. Try again.
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            className="btn btn-sm h-9 px-4 rounded-xl border border-base-300 bg-base-100 hover:bg-base-200 text-xs font-semibold text-base-content cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="btn btn-sm h-9 px-4 rounded-xl border-0 bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-xs cursor-pointer"
          >
            {busy ? "Resetting…" : "Reset to Required"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
