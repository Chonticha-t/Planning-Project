import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ArrowRight, Calendar, AlertCircle, CheckCircle2, X } from "lucide-react";
import type { LotItem, DayGateLoad } from "../types";
import { computeDragPreview } from "../utils/levelingCalculations";

interface ConfirmMoveModalProps {
  isOpen: boolean;
  lot: LotItem | null;
  targetDate: string | null;
  gridData: DayGateLoad[];
  onConfirm: (lot: LotItem, targetDate: string) => void;
  onCancel: () => void;
}

export const ConfirmMoveModal: React.FC<ConfirmMoveModalProps> = ({
  isOpen,
  lot,
  targetDate,
  gridData,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !lot || !targetDate || typeof document === "undefined") {
    return null;
  }

  const shiftDays = dayjs(targetDate).diff(dayjs(lot.releaseDate), "day");
  const slackDays = dayjs(lot.mustStartDate).diff(dayjs(targetDate), "day");
  const isLate = slackDays < 0;
  const preview = computeDragPreview(gridData, lot, targetDate);

  const getPctPillClass = (pct: number) => {
    if (pct > 100) return "bg-[#fee2e2] text-[#991b1b] font-bold";
    if (pct >= 80) return "bg-[#fef3c7] text-[#92400e] font-bold";
    return "bg-[#d1fae5] text-[#065f46] font-semibold";
  };

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Confirm move release date"
        className="w-full max-w-[440px] rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-300 flex items-center justify-between bg-base-200/40">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-base-content">
              Confirm Move Release Date
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/60 hover:text-base-content"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 tabular-nums">
          {/* Lot Info */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-base-content">
                {lot.id} · {lot.product}
              </div>
              <div className="text-xs text-base-content/60 mt-0.5">
                {lot.qty.toLocaleString()} pcs · {lot.routeId.replace(/_/g, " ")} ·
                Must start {dayjs(lot.mustStartDate).format("DD/MM/YYYY")}
              </div>
            </div>

            {isLate ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertCircle size={12} />
                Late ({slackDays}d)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} />
                Fits (+{slackDays}d slack)
              </span>
            )}
          </div>

          {/* From -> To Box */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-base-200/50 border border-base-300 p-3.5">
            <div className="flex flex-col">
              <span className="text-[10.5px] font-bold uppercase text-base-content/45">
                From Date
              </span>
              <span className="text-sm font-bold text-base-content/80 mt-0.5">
                {dayjs(lot.releaseDate).format("ddd DD/MM/YYYY")}
              </span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <ArrowRight size={16} className="text-primary" />
              <span className="text-[10px] font-bold text-primary">
                {shiftDays < 0
                  ? `${Math.abs(shiftDays)}d earlier`
                  : `+${shiftDays}d later`}
              </span>
            </div>

            <div className="flex flex-col text-right">
              <span className="text-[10.5px] font-bold uppercase text-base-content/45">
                Move To
              </span>
              <span
                className={`text-sm font-bold mt-0.5 ${
                  isLate ? "text-rose-600" : "text-primary"
                }`}
              >
                {dayjs(targetDate).format("ddd DD/MM/YYYY")}
              </span>
            </div>
          </div>

          {/* Mini Gate Impact Table */}
          <div>
            <div className="text-[11px] font-bold uppercase text-base-content/55 tracking-wide mb-1.5">
              Gate Load Impact on New Route
            </div>
            <div className="rounded-xl border border-base-300 overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-base-200/60 border-b border-base-300 text-[10.5px] font-bold text-base-content/60 uppercase">
                    <th className="py-1.5 px-2.5 text-left">Gate</th>
                    <th className="py-1.5 px-2 text-left">Arrives</th>
                    <th className="py-1.5 px-2 text-center">Before</th>
                    <th className="py-1.5 px-2.5 text-center">After</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.routeTableRows.map((r) => (
                    <tr
                      key={r.gateId}
                      className="border-b border-base-200 last:border-0"
                    >
                      <td className="py-1.5 px-2.5 font-bold text-base-content">
                        {r.gateName}
                      </td>
                      <td className="py-1.5 px-2 text-base-content/70">
                        {r.displayDate}/2026
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <span
                          className={`inline-block min-w-[42px] px-1.5 py-0.5 rounded-md text-[11px] ${getPctPillClass(
                            r.beforePct
                          )}`}
                        >
                          {r.beforePct}%
                        </span>
                      </td>
                      <td className="py-1.5 px-2.5 text-center">
                        <span
                          className={`inline-block min-w-[42px] px-1.5 py-0.5 rounded-md text-[11px] ${getPctPillClass(
                            r.afterPct
                          )}`}
                        >
                          {r.afterPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-base-300 bg-base-200/30 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-sm h-9 px-4 rounded-xl bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(lot, targetDate)}
            className="btn btn-sm h-9 px-4 rounded-xl btn-primary text-xs font-semibold cursor-pointer tabular-nums"
          >
            Confirm Move → {dayjs(targetDate).format("DD/MM/YYYY")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
