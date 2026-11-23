import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Clock,
  Clock3,
  Moon,
  Package,
  Sun,
  X,
} from "lucide-react";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import type { BoardShiftAllocation, LevelingData, LotItem } from "../types";
import { allocateBoardShifts } from "../utils/boardShiftAllocation";

interface ConfirmReorderModalProps {
  data?: LevelingData;
  before: LotItem[];
  after: LotItem[];
  movingIds: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

const SHIFT_BADGE: Record<
  BoardShiftAllocation["status"],
  { label: string; Icon: typeof Sun; cls: string }
> = {
  day: { label: "D/S", Icon: Sun, cls: "bg-yellow-100 text-yellow-950 border-yellow-300" },
  night: { label: "N/S", Icon: Moon, cls: "bg-indigo-100 text-indigo-950 border-indigo-200" },
  over: { label: "Over", Icon: AlertTriangle, cls: "bg-rose-100 text-rose-900 border-rose-200" },
  unassigned: { label: "Pending", Icon: Clock3, cls: "bg-base-200 text-base-content/70 border-base-300" },
  no_load: { label: "No load", Icon: CircleSlash, cls: "bg-base-100 text-base-content/60 border-base-300 border-dashed" },
  none: { label: "-", Icon: Clock3, cls: "bg-base-200 text-base-content/50 border-base-300" },
};

const ShiftPill = ({ status }: { status?: BoardShiftAllocation["status"] }) => {
  if (!status || status === "none") {
    return <span className="text-[11px] text-base-content/40">-</span>;
  }
  const theme = SHIFT_BADGE[status];
  const Icon = theme.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${theme.cls}`}>
      <Icon size={10} className="shrink-0" aria-hidden="true" />
      <span>{theme.label}</span>
    </span>
  );
};

export const ConfirmReorderModal: React.FC<ConfirmReorderModalProps> = ({
  data,
  before,
  after,
  movingIds,
  onConfirm,
  onCancel,
}) => {
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

  const movingSet = useMemo(() => new Set(movingIds), [movingIds]);
  const moving = useMemo(() => before.filter((lot) => movingSet.has(lot.id)), [before, movingSet]);

  const { beforeShifts, afterShifts } = useMemo(() => {
    if (!data) return { beforeShifts: null, afterShifts: null };
    return {
      beforeShifts: allocateBoardShifts(data, before, { excludePassed: true }),
      afterShifts: allocateBoardShifts(data, after, { excludePassed: true }),
    };
  }, [data, before, after]);

  const rows = useMemo(() => {
    const beforePos = new Map(before.map((lot, idx) => [lot.id, idx + 1]));
    return after
      .map((lot, idx) => {
        const fromPos = beforePos.get(lot.id) ?? idx + 1;
        const toPos = idx + 1;
        const shiftKey = lot.sourceIds?.[0] ?? lot.id;
        const fromShift = beforeShifts?.get(shiftKey)?.status;
        const toShift = afterShifts?.get(shiftKey)?.status;
        const isMoved = movingSet.has(lot.id);
        const shiftChanged = Boolean(fromShift && toShift && fromShift !== toShift);
        return { lot, fromPos, toPos, fromShift, toShift, isMoved, shiftChanged };
      })
      .filter((row) => row.isMoved || row.shiftChanged);
  }, [before, after, beforeShifts, afterShifts, movingSet]);

  if (!moving.length || typeof document === "undefined") return null;

  const { gate, plannedDate } = moving[0];
  const shiftChangedCount = rows.filter((row) => row.shiftChanged).length;

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-reorder-title"
        className="w-full max-w-[540px] max-h-[90vh] flex flex-col rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-300 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 id="confirm-reorder-title" className="text-sm font-bold text-base-content">
              Confirm Reorder
            </h3>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#4f46e5] text-white">
              {gate}
            </span>
            <span className="text-xs font-semibold text-base-content/55 tabular-nums">
              {dayjs(plannedDate).format("ddd DD/MM/YYYY")}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close reorder confirmation"
            onClick={onCancel}
            className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/50 hover:text-base-content"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3.5 tabular-nums overflow-y-auto min-h-0">
          <div className="rounded-xl border border-base-200 overflow-hidden bg-base-100">
            <table className="w-full text-xs">
              <thead className="bg-base-200/50 text-[10px] font-bold uppercase tracking-wider text-base-content/50 border-b border-base-200">
                <tr>
                  <th className="px-3.5 py-2 text-left">Card / Lot</th>
                  <th className="px-2.5 py-2 text-center w-[84px]">Position</th>
                  {beforeShifts && (
                    <th className="px-3 py-2 text-right w-[128px]">Shift</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-200/80">
                {rows.map(({ lot, fromPos, toPos, fromShift, toShift, isMoved, shiftChanged }) => (
                  <tr
                    key={lot.id}
                    className={isMoved ? "bg-[#eef2ff]/35" : "bg-base-100"}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-base-content leading-snug">
                          {lot.product}
                        </span>
                        {isMoved && (
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-[#eef2ff] text-[#4f46e5] border border-indigo-200">
                            Moved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-base-content/60 mt-0.5 flex-wrap">
                        <span className="font-mono font-semibold text-base-content/75">{lot.label}</span>
                        <span className="text-base-content/25">•</span>
                        <span className="inline-flex items-center gap-1">
                          <Package size={10} className="text-base-content/40" />
                          {formatGateQuantity(lot.qty, "piece")} pcs
                        </span>
                        {lot.mustOut && (
                          <>
                            <span className="text-base-content/25">•</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} className="text-base-content/40" />
                              {dayjs(lot.mustOut).format("DD/MM")}
                            </span>
                          </>
                        )}
                      </div>
                    </td>

                    <td className="px-2.5 py-2.5">
                      <div className="flex items-center justify-center gap-1.5 text-xs">
                        <span className="text-base-content/55 font-medium">{fromPos}</span>
                        <ArrowRight size={11} className="text-base-content/35 shrink-0" />
                        <span className={`font-bold ${isMoved ? "text-[#4f46e5]" : "text-base-content"}`}>
                          {toPos}
                        </span>
                      </div>
                    </td>

                    {beforeShifts && (
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          {shiftChanged ? (
                            <>
                              <ShiftPill status={fromShift} />
                              <ArrowRight size={10} className="text-base-content/40 shrink-0" />
                              <ShiftPill status={toShift} />
                            </>
                          ) : (
                            <ShiftPill status={toShift} />
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Impact Summary Banner */}
          {shiftChangedCount > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2.5 text-xs text-amber-800">
              <AlertCircle size={15} className="shrink-0 text-amber-600" />
              <span>
                <strong>{shiftChangedCount}</strong> {shiftChangedCount === 1 ? "card changes" : "cards change"} Day / Night shift. Arrival dates and daily load stay the same.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-base-200 bg-base-200/40 px-3.5 py-2.5 text-xs text-base-content/65">
              <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
              <span>No Day / Night shift changes. Arrival dates and daily load stay the same.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-base-200 bg-base-200/20 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="btn btn-sm h-9 px-4 rounded-xl bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn-sm h-9 px-4 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white border-none text-xs font-semibold cursor-pointer shadow-xs"
          >
            Confirm Reorder
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
