import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ArrowRight, Calendar, AlertCircle, CheckCircle2, X } from "lucide-react";
import type { LotItem, DayGateLoad } from "../types";
import { computeBatchMovePreview } from "../utils/levelingCalculations";

interface ConfirmMoveModalProps {
  isOpen: boolean;
  lots: LotItem[];
  allLots: LotItem[];
  frozenUntilDate: string;
  targetDate: string | null;
  gridData: DayGateLoad[];
  onConfirm: (lots: LotItem[], targetDate: string) => void;
  onCancel: () => void;
}

export const ConfirmMoveModal: React.FC<ConfirmMoveModalProps> = ({
  isOpen,
  lots,
  allLots,
  frozenUntilDate,
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

  if (!isOpen || lots.length === 0 || !targetDate || typeof document === "undefined") {
    return null;
  }

  const lot = lots[0];
  const isBatch = lots.length > 1;
  const sourceDates = new Set(lots.map((item) => item.releaseDate));
  const lateCount = lots.filter((item) => dayjs(targetDate).isAfter(dayjs(item.mustStartDate))).length;
  const shiftDays = dayjs(targetDate).diff(dayjs(lot.releaseDate), "day");
  const slackDays = dayjs(lot.mustStartDate).diff(dayjs(targetDate), "day");
  const isLate = lateCount > 0;
  const preview = computeBatchMovePreview(gridData, allLots, lots, targetDate, frozenUntilDate);

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
        className={`w-full ${isBatch ? "max-w-[620px]" : "max-w-[440px]"} max-h-[90vh] flex flex-col rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-300 flex items-center justify-between bg-base-200/40">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-base-content">
              {isBatch ? `Move ${lots.length} Lots Together` : "Confirm Move Release Date"}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close move confirmation"
            onClick={onCancel}
            className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/60 hover:text-base-content"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4 tabular-nums overflow-y-auto min-h-0">
          {/* Lot Info */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-base-content">
                {isBatch ? `${lots.length} selected lots` : `${lot.id} · ${lot.product}`}
              </div>
              <div className="text-xs text-base-content/60 mt-0.5">
                {isBatch
                  ? `${lots.reduce((sum, item) => sum + item.qty, 0).toLocaleString()} pcs total`
                  : `${lot.qty.toLocaleString()} pcs · ${lot.routeId.replace(/_/g, " ")} · Must start ${dayjs(lot.mustStartDate).format("DD/MM/YYYY")}`}
              </div>
            </div>

            {isLate ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                <AlertCircle size={12} />
                {isBatch ? `${lateCount} lot(s) late` : `Late (${slackDays}d)`}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 size={12} />
                {isBatch ? "All lots fit Must Start" : `Fits (+${slackDays}d slack)`}
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
                {sourceDates.size > 1 ? `${sourceDates.size} source dates` : dayjs(lot.releaseDate).format("ddd DD/MM/YYYY")}
              </span>
            </div>

            <div className="flex flex-col items-center gap-0.5">
              <ArrowRight size={16} className="text-primary" />
              <span className="text-[10px] font-bold text-primary">
                {isBatch ? "Move together" : shiftDays < 0
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

          {isBatch && (
            <div className="max-h-52 overflow-auto rounded-xl border border-base-300">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-base-200 text-base-content/70">
                  <tr><th className="p-2 text-left">Lot / Product</th><th className="p-2">From</th><th className="p-2">Must Start</th><th className="p-2">Slack</th></tr>
                </thead>
                <tbody>
                  {lots.map((item) => {
                    const slack = dayjs(item.mustStartDate).diff(dayjs(targetDate), "day");
                    return <tr key={item.id} className="border-t border-base-200">
                      <td className="p-2"><strong>{item.id}</strong><div className="text-base-content/60">{item.product}</div></td>
                      <td className="p-2 text-center">{dayjs(item.releaseDate).format("DD/MM")}</td>
                      <td className="p-2 text-center">{dayjs(item.mustStartDate).format("DD/MM")}</td>
                      <td className={`p-2 text-center font-semibold ${slack < 0 ? "text-rose-600" : "text-emerald-600"}`}>{slack >= 0 ? "+" : ""}{slack}d</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}

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
            aria-label="Confirm move"
            onClick={() => onConfirm(lots, targetDate)}
            className="btn btn-sm h-9 px-4 rounded-xl btn-primary text-xs font-semibold cursor-pointer tabular-nums"
          >
            Confirm Move {isBatch ? `${lots.length} Lots ` : ""}→ {dayjs(targetDate).format("DD/MM/YYYY")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
