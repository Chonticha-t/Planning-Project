import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { AlertCircle, ArrowRight, Calendar, X } from "lucide-react";
import type { LotItem } from "../types";

interface ConfirmReorderModalProps {
  before: LotItem[];
  after: LotItem[];
  movingIds: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmReorderModal: React.FC<ConfirmReorderModalProps> = ({ before, after, movingIds, onConfirm, onCancel }) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Tab") {
        const buttons = cancelRef.current?.closest("[role='dialog']")?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onCancel]);

  const moving = before.filter((lot) => movingIds.includes(lot.id));
  if (!moving.length) return null;
  const { gate, plannedDate } = moving[0];

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/35">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-reorder-title"
        className="w-full max-w-[620px] max-h-[90vh] flex flex-col rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content">
        <div className="px-5 py-3.5 border-b border-base-300 flex items-center justify-between bg-base-200/40">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            <h3 id="confirm-reorder-title" className="text-sm font-bold">Confirm Reorder at {gate}</h3>
          </div>
          <button type="button" aria-label="Close reorder confirmation" onClick={onCancel}
            className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/60"><X size={15} /></button>
        </div>
        <div className="px-5 py-4 overflow-y-auto space-y-4">
          <p className="text-sm">Reorder {moving.length} card(s) within {dayjs(plannedDate).format("DD/MM/YYYY")} at {gate}?</p>
          <div className="overflow-x-auto rounded-xl border border-base-300">
            <table className="w-full text-xs">
              <thead className="bg-base-200/60 text-base-content/60">
                <tr><th className="px-3 py-2 text-left">Card / Product</th><th className="px-3 py-2 text-center">Position</th></tr>
              </thead>
              <tbody>
                {moving.map((lot) => (
                  <tr key={lot.id} className="border-t border-base-300">
                    <td className="px-3 py-2"><div className="font-semibold">{lot.label}</div><div className="text-base-content/60">{lot.product}</div></td>
                    <td className="px-3 py-2"><div className="flex items-center justify-center gap-2 tabular-nums">
                      <span>{before.findIndex((item) => item.id === lot.id) + 1}</span><ArrowRight size={13} />
                      <span className="font-bold text-primary">{after.findIndex((item) => item.id === lot.id) + 1}</span>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertCircle size={16} className="shrink-0" />
            <p>Changing card priority may change Day / Night shift allocation. Arrival dates and daily load remain unchanged.</p>
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-base-300 bg-base-200/30 flex items-center justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel}
            className="btn btn-sm h-9 px-4 rounded-xl bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content cursor-pointer">Cancel</button>
          <button type="button" onClick={onConfirm}
            className="btn btn-sm h-9 px-4 rounded-xl btn-primary text-xs font-semibold cursor-pointer">Confirm Reorder</button>
        </div>
      </div>
    </div>, document.body
  );
};
