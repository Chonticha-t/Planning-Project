import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ArrowRight, Calendar, AlertCircle, CheckCircle2, X } from "lucide-react";
import type { LotItem, DayGateLoad, LevelingData, MoveWarning } from "../types";
import { computeMovePreview, moveWarning, pctPillClass, WARNING_TEXT } from "../utils/levelingCalculations";

interface ConfirmMoveModalProps {
  isOpen: boolean;
  data: LevelingData;
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
  none: "bg-emerald-50 text-emerald-700 border-emerald-200",
  early: "bg-amber-50 text-amber-800 border-amber-200",
  late: "bg-rose-50 text-rose-700 border-rose-200",
  order: "bg-rose-100 text-rose-800 border-rose-400",
};
const WARNING_LABEL: Record<MoveWarning, string> = {
  none: "Fits",
  early: "Early",
  late: "Late",
  order: "Gate order",
};

const PctPill: React.FC<{ pct: number | null }> = ({ pct }) => (
  <span
    className={`inline-block min-w-[42px] px-1.5 py-0.5 rounded-md text-[11px] ${
      pct === null ? "bg-base-200 text-base-content/50 font-semibold" : pctPillClass(pct)
    }`}
  >
    {pct === null ? "—" : `${pct}%`}
  </span>
);

export const ConfirmMoveModal: React.FC<ConfirmMoveModalProps> = ({
  isOpen,
  data,
  lots,
  allLots,
  targetDate,
  gridData,
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
  const warnings = lots.map((item) => moveWarning(item, targetDate, plannedIndex));
  const count = (kind: MoveWarning) => warnings.filter((warning) => warning === kind).length;
  const worst: MoveWarning = count("order") ? "order" : count("late") ? "late" : count("early") ? "early" : "none";
  const shiftDays = dayjs(targetDate).diff(dayjs(lot.plannedDate), "day");
  const slackDays = dayjs(lot.mustOut).diff(dayjs(targetDate), "day");
  const { impactRows } = computeMovePreview(data, gridData, allLots, lots, targetDate);
  const noLoadCount = lots.filter((item) => item.loadMin === null).length;

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/35">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Confirm move at ${gate}`}
        className={`w-full ${isBatch ? "max-w-[620px]" : "max-w-[460px]"} max-h-[90vh] flex flex-col rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content`}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-300 flex items-center justify-between bg-base-200/40">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-primary" />
            <h3 className="text-sm font-bold text-base-content">
              {isBatch ? `Move ${lots.length} Cards at ${gate}` : `Confirm Move at ${gate}`}
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
          {/* Card Info */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-base-content break-all">
                {isBatch ? `${lots.length} selected cards` : `${lot.label} · ${lot.product}`}
              </div>
              <div className="text-xs text-base-content/60 mt-0.5">
                {isBatch
                  ? `${lots.reduce((sum, item) => sum + item.qty, 0).toLocaleString()} pcs total`
                  : `${lot.qty.toLocaleString()} pcs · Must out ${dayjs(lot.mustOut).format("DD/MM/YYYY")}`}
              </div>
            </div>

            <span className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border ${WARNING_BADGE[worst]}`}>
              {worst === "none" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {isBatch
                ? worst === "none"
                  ? "All cards fit"
                  : `${count("late") + count("order")} late · ${count("early")} early`
                : worst === "none"
                ? `Fits (+${slackDays}d slack)`
                : worst === "early"
                ? "Early"
                : `${WARNING_LABEL[worst]} (${slackDays}d)`}
            </span>
          </div>

          {/* From -> To Box */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-base-200/50 border border-base-300 p-3.5">
            <div className="flex flex-col">
              <span className="text-[10.5px] font-bold uppercase text-base-content/45">
                From Date
              </span>
              <span className="text-sm font-bold text-base-content/80 mt-0.5">
                {sourceDates.size > 1 ? `${sourceDates.size} source dates` : dayjs(lot.plannedDate).format("ddd DD/MM/YYYY")}
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
                  worst === "late" || worst === "order" ? "text-rose-600" : "text-primary"
                }`}
              >
                {dayjs(targetDate).format("ddd DD/MM/YYYY")}
              </span>
            </div>
          </div>

          {/* What the warning means; the move is still allowed */}
          {worst !== "none" && (
            <div className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${WARNING_BADGE[worst]}`}>
              {(["order", "late", "early"] as const).filter((kind) => count(kind) > 0).map((kind) => (
                <div key={kind}>
                  <strong>{isBatch ? `${count(kind)} card(s): ` : ""}</strong>
                  {WARNING_TEXT[kind]}.
                </div>
              ))}
              <div className="mt-1 opacity-80">
                Only {gate} moves. The other gates of this work keep their dates.
              </div>
            </div>
          )}

          {isBatch && (
            <div className="max-h-52 overflow-auto rounded-xl border border-base-300">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-base-200 text-base-content/70">
                  <tr><th className="p-2 text-left">Lot / Product</th><th className="p-2">From</th><th className="p-2">Must Out</th><th className="p-2">Slack</th><th className="p-2">Result</th></tr>
                </thead>
                <tbody>
                  {lots.map((item, index) => {
                    const slack = dayjs(item.mustOut).diff(dayjs(targetDate), "day");
                    return <tr key={item.id} className="border-t border-base-200">
                      <td className="p-2"><strong className="break-all">{item.label}</strong><div className="text-base-content/60">{item.product}</div></td>
                      <td className="p-2 text-center">{dayjs(item.plannedDate).format("DD/MM")}</td>
                      <td className="p-2 text-center">{dayjs(item.mustOut).format("DD/MM")}</td>
                      <td className={`p-2 text-center font-semibold ${slack < 0 ? "text-rose-600" : "text-emerald-600"}`}>{slack >= 0 ? "+" : ""}{slack}d</td>
                      <td className="p-2 text-center">
                        <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${WARNING_BADGE[warnings[index]]}`}>
                          {WARNING_LABEL[warnings[index]]}
                        </span>
                      </td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Load of this gate on the days that change */}
          <div>
            <div className="text-[11px] font-bold uppercase text-base-content/55 tracking-wide mb-1.5">
              {gate} Load % on the Affected Days
            </div>
            <div className="rounded-xl border border-base-300 overflow-hidden">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-base-200/60 border-b border-base-300 text-[10.5px] font-bold text-base-content/60 uppercase">
                    <th className="py-1.5 px-2.5 text-left">Date</th>
                    <th className="py-1.5 px-2 text-right">Capacity</th>
                    <th className="py-1.5 px-2 text-center">Before</th>
                    <th className="py-1.5 px-2.5 text-center">After</th>
                  </tr>
                </thead>
                <tbody>
                  {impactRows.map((r) => (
                    <tr
                      key={r.date}
                      className={`border-b border-base-200 last:border-0 ${r.isTarget ? "bg-[#eef2ff]/50" : ""}`}
                    >
                      <td className="py-1.5 px-2.5 font-bold text-base-content">
                        {dayjs(r.date).format("ddd DD/MM/YYYY")}
                        {r.isTarget && <span className="ml-1.5 text-[10px] font-semibold text-primary">target</span>}
                      </td>
                      <td className="py-1.5 px-2 text-right text-base-content/70 whitespace-nowrap">
                        {r.capacityMin === null ? "MC not set" : `${Math.round(r.capacityMin).toLocaleString()} min`}
                        {r.hasOt && (
                          <span className="ml-1 px-1.5 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-800">OT</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center"><PctPill pct={r.beforePct} /></td>
                      <td className="py-1.5 px-2.5 text-center"><PctPill pct={r.afterPct} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {noLoadCount > 0 && (
              <div className="mt-1.5 text-[11px] text-amber-800">
                {noLoadCount} of these card(s) have no target UPH, so they do not change Load %.
              </div>
            )}
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
            Confirm Move {isBatch ? `${lots.length} Cards ` : ""}→ {dayjs(targetDate).format("DD/MM/YYYY")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
