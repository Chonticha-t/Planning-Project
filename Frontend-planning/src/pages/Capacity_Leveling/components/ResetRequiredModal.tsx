import { useEffect } from "react";
import { createPortal } from "react-dom";
import { RotateCcw } from "lucide-react";

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
      <div role="dialog" aria-modal="true" aria-labelledby="reset-required-title" aria-describedby="reset-required-description"
        aria-busy={busy} className="w-full max-w-lg rounded-2xl border border-base-300 bg-base-100 p-6 shadow-2xl text-base-content">
        <h2 id="reset-required-title" className="flex items-center gap-2 text-base font-bold"><RotateCcw size={18} /> Reset to Required?</h2>
        <div id="reset-required-description" className="mt-3 space-y-2 text-sm text-base-content/75">
          <p>Reload the latest arrivals from Summary Gate and reset arrival dates and card order for <strong>all process groups and gates, including hidden cards and dates outside the displayed range</strong>.</p>
          <p>Unsaved date moves and card ordering will be replaced. Current capacity settings and saved plan history will be kept.</p>
          <p>Review the result, then use <strong>Save Plan</strong> to create a new version. This button does not save a plan.</p>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-error">{error} Your draft has been kept. Try again.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" autoFocus disabled={busy} onClick={onCancel} className="btn btn-sm btn-ghost">Cancel</button>
          <button type="button" disabled={busy} onClick={onConfirm} className="btn btn-sm btn-warning">
            {busy ? "Loading latest arrivals…" : "Reset to Required"}
          </button>
        </div>
      </div>
    </div>, document.body,
  );
};
