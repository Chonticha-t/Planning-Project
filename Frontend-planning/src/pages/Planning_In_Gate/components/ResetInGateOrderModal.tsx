import { useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";

interface Props {
  gate: string;
  date: string;
  planVersion: number;
  hasSavedOrder: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ResetInGateOrderModal = ({
  gate,
  date,
  planVersion,
  hasSavedOrder,
  busy = false,
  onCancel,
  onConfirm,
}: Props) => {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [busy, onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-ingate-order-title"
        aria-describedby="reset-ingate-order-description"
        aria-busy={busy}
        className="w-full max-w-md rounded-2xl border border-base-300 bg-base-100 p-5 shadow-2xl text-base-content"
      >
        <div>
          <h2 id="reset-ingate-order-title" className="text-base font-bold text-base-content leading-tight">
            Reset to Plan v{planVersion}?
          </h2>
          <p className="text-xs text-base-content/55 mt-0.5 tabular-nums">
            Restore queue order for {gate} · {dayjs(date).format("ddd DD/MM/YYYY")}
          </p>
        </div>

        <div id="reset-ingate-order-description" className="mt-4 space-y-2 text-xs leading-relaxed text-base-content/75">
          <p>
            This will reset the queue order for <strong className="text-base-content">{gate}</strong> on{" "}
            <strong className="text-base-content tabular-nums">{date}</strong> back to the original order from{" "}
            <strong className="text-base-content">Capacity Leveling (Plan v{planVersion})</strong>.
          </p>
          <p className="text-base-content/60">
            {hasSavedOrder ? (
              <>
                Saved order history is kept. Review the reset draft and click{" "}
                <strong className="text-base-content">Save order</strong> afterwards to apply (or{" "}
                <strong className="text-base-content">Undo</strong> to cancel).
              </>
            ) : (
              <>This will discard your unsaved draft reorders for this gate and date.</>
            )}
          </p>
        </div>

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
            {busy ? "Resetting…" : "Reset to Plan order"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
