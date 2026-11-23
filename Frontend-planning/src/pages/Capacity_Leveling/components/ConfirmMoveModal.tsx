import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ArrowRight, AlertCircle, X, Package, Clock } from "lucide-react";
import type { LotItem, DayGateLoad, LevelingData, MoveWarning, ProcessCategory } from "../types";
import { computeMovePreview, loadStatus, moveWarning, occupancyWindow, WARNING_TEXT } from "../utils/levelingCalculations";

interface ConfirmMoveModalProps {
  isOpen: boolean;
  data: LevelingData;
  category: ProcessCategory;
  /** Cards being moved; all belong to the same gate */
  lots: LotItem[];
  allLots: LotItem[];
  targetDate: string | null;
  gridData: DayGateLoad[];
  plannedIndex: Map<string, string>;
  onConfirm: (lots: LotItem[], targetDate: string) => void;
  onCancel: () => void;
}

const WARNING_BADGE: Record<MoveWarning, string> = {
  none: "bg-base-200/70 text-base-content/70 border-base-300",
  early: "bg-amber-50/80 text-amber-800 border-amber-200",
  late: "bg-rose-50/80 text-rose-700 border-rose-200",
  order: "bg-rose-50 text-rose-800 border-rose-300",
};
const WARNING_LABEL: Record<MoveWarning, string> = {
  none: "On time",
  early: "Early",
  late: "Late",
  order: "Gate order",
};

const pctTextClass = (pct: number | null) => {
  if (pct === null) return "text-base-content/40";
  const status = loadStatus(pct);
  if (status === "red") return "text-rose-600";
  if (status === "yellow") return "text-amber-600";
  return "text-emerald-600";
};

export const ConfirmMoveModal: React.FC<ConfirmMoveModalProps> = ({
  isOpen,
  data,
  lots,
  allLots,
  targetDate,
  gridData,
  category,
  plannedIndex,
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
  const gate = lot.gate;
  const isBatch = lots.length > 1;
  const sourceDates = new Set(lots.map((item) => item.plannedDate));
  const warnings = lots.map((item) => moveWarning(item, targetDate, plannedIndex, data));
  const count = (kind: MoveWarning) => warnings.filter((warning) => warning === kind).length;
  const worst: MoveWarning = count("order") ? "order" : count("late") ? "late" : count("early") ? "early" : "none";
  const shiftDays = dayjs(targetDate).diff(dayjs(lot.plannedDate), "day");
  const { impactRows } = computeMovePreview(data, gridData, allLots, lots, targetDate, category);
  const noLoadCount = lots.filter((item) => !occupancyWindow(data, item, targetDate)).length;

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Confirm move at ${gate}`}
        className={`w-full ${isBatch ? "max-w-[540px]" : "max-w-[420px]"} max-h-[90vh] flex flex-col rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-base-content">
              {isBatch ? `Move ${lots.length} Cards` : "Confirm Move"}
            </h3>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#4f46e5] text-white">
              {gate}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close move confirmation"
            onClick={onCancel}
            className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/50 hover:text-base-content"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-3.5 tabular-nums overflow-y-auto min-h-0">
          {/* Card Info Box */}
          <div className="rounded-xl border border-base-200 bg-base-200/40 p-3.5 flex flex-col gap-2.5">
            {/* Top row: Product & Lot No. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/45 mb-0.5">
                  Product
                </div>
                <div className="text-sm font-bold text-base-content break-all leading-snug">
                  {isBatch ? `${lots.length} selected cards` : lot.product}
                </div>
              </div>
              {!isBatch && (
                <div className="shrink-0 text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/45 mb-0.5">
                    Lot No.
                  </div>
                  <span className="inline-block font-mono text-xs font-bold text-base-content px-2 py-0.5 rounded-md bg-base-100 border border-base-300 shadow-2xs">
                    {lot.label}
                  </span>
                </div>
              )}
            </div>

            {/* Bottom row: Meta stats (Quantity & Must Out) */}
            <div className="flex items-center gap-3 pt-2 border-t border-base-300/60 text-xs">
              <div className="inline-flex items-center gap-1.5 text-base-content/70">
                <Package size={13} className="text-base-content/45 shrink-0" />
                <span>
                  Qty: <strong className="text-base-content font-bold tabular-nums">
                    {formatGateQuantity(
                      isBatch
                        ? lots.some((item) => item.qty === null) ? null : lots.reduce((sum, item) => sum + (item.qty ?? 0), 0)
                        : lot.qty,
                      "piece"
                    )}
                  </strong> pcs
                </span>
              </div>
              {!isBatch && (
                <>
                  <span className="text-base-content/25">•</span>
                  <div className="inline-flex items-center gap-1.5 text-base-content/70">
                    <Clock size={13} className="text-base-content/45 shrink-0" />
                    <span>
                      Must out: <strong className="text-base-content font-semibold tabular-nums">{dayjs(lot.mustOut).format("DD/MM/YYYY")}</strong>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* From -> To Box */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl bg-base-200/40 border border-base-300 px-3.5 py-3">
            <div>
              <div className="text-[10px] font-semibold uppercase text-base-content/45">
                Current Date
              </div>
              <div className="text-xs font-semibold text-base-content/80 mt-0.5">
                {sourceDates.size > 1 ? `${sourceDates.size} dates` : dayjs(lot.plannedDate).format("ddd DD/MM/YYYY")}
              </div>
            </div>

            <div className="flex flex-col items-center px-2">
              <div className="w-6 h-6 rounded-full bg-base-100 border border-base-300 flex items-center justify-center text-base-content/60 shadow-2xs">
                <ArrowRight size={13} />
              </div>
              {!isBatch && (
                <span className="text-[10px] font-medium text-base-content/50 mt-1 whitespace-nowrap">
                  {shiftDays === 0 ? "Same day" : shiftDays < 0 ? `${Math.abs(shiftDays)}d earlier` : `+${shiftDays}d later`}
                </span>
              )}
            </div>

            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase text-[#4f46e5]">
                New Planned Date
              </div>
              <div className="text-xs font-bold text-[#4f46e5] mt-0.5">
                {dayjs(targetDate).format("ddd DD/MM/YYYY")}
              </div>
            </div>
          </div>

          {/* Concise single-line warning only when needed */}
          {worst !== "none" && (
            <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${WARNING_BADGE[worst]}`}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <div>
                {(["order", "late", "early"] as const)
                  .filter((kind) => count(kind) > 0)
                  .map((kind) => (
                    <div key={kind}>
                      {isBatch ? <strong>{count(kind)} card(s): </strong> : null}
                      {WARNING_TEXT[kind]}.
                    </div>
                  ))}
              </div>
            </div>
          )}

          {isBatch && (
            <div className="max-h-44 overflow-auto rounded-xl border border-base-300">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-base-200/80 text-[10.5px] uppercase text-base-content/60">
                  <tr>
                    <th className="py-1.5 px-2.5 text-left">Product / Lot</th>
                    <th className="py-1.5 px-2 text-center">From</th>
                    <th className="py-1.5 px-2 text-center">Must Out</th>
                    <th className="py-1.5 px-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((item, index) => (
                    <tr key={item.id} className="border-t border-base-200">
                      <td className="py-1.5 px-2.5">
                        <div className="font-bold text-base-content break-all leading-tight">{item.product}</div>
                        <div className="font-mono text-[11px] text-base-content/65 leading-tight">{item.label}</div>
                      </td>
                      <td className="py-1.5 px-2 text-center text-base-content/70">{dayjs(item.plannedDate).format("DD/MM")}</td>
                      <td className="py-1.5 px-2 text-center text-base-content/70">{dayjs(item.mustOut).format("DD/MM")}</td>
                      <td className="py-1.5 px-2.5 text-right font-medium text-base-content/75">
                        {WARNING_LABEL[warnings[index]]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Load Impact on Affected Days */}
          {impactRows.length > 0 && (
            <div>
              <div className="text-[10.5px] font-semibold uppercase text-base-content/50 tracking-wide mb-1.5">
                {gate} Load Impact
              </div>
              <div className="rounded-xl border border-base-300 overflow-hidden">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-base-200/40 border-b border-base-300 text-[10px] font-semibold text-base-content/50 uppercase">
                      <th className="py-1.5 px-3 text-left">Date</th>
                      <th className="py-1.5 px-3 text-right">Before → After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {impactRows.map((r) => (
                      <tr
                        key={r.date}
                        className="border-b border-base-200 last:border-0"
                      >
                        <td className="py-2 px-3 font-medium text-base-content">
                          <span>{dayjs(r.date).format("ddd DD/MM/YYYY")}</span>
                          {r.isTarget && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-base-200 text-[10px] font-semibold text-base-content/65">
                              Target
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <span className="text-base-content/55 font-medium">
                            {r.beforePct === null ? "—" : `${r.beforePct}%`}
                          </span>
                          <span className="mx-1.5 text-base-content/35">→</span>
                          <span className={`font-bold ${pctTextClass(r.afterPct)}`}>
                            {r.afterPct === null ? "—" : `${r.afterPct}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {noLoadCount > 0 && (
            <div className="text-[11px] text-amber-800">
              {noLoadCount} card(s) are missing gate lead time or normal shift minutes.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-base-300 bg-base-200/20 flex items-center justify-end gap-2">
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
            disabled={noLoadCount > 0}
            onClick={() => onConfirm(lots, targetDate)}
            className="btn btn-sm h-9 px-5 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] text-white border-none text-xs font-semibold cursor-pointer shadow-sm"
          >
            Confirm Move
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
