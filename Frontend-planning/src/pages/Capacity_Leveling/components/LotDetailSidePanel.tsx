import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import {
  Calendar as CalendarIcon,
  Settings,
  X,
  ArrowRight,
} from "lucide-react";
import type { CapacityDay, LotItem, DayGateLoad, MoveHistoryEntry, LevelingData, ProcessCategory } from "../types";
import { adjacentGateDates, expandBoardLots, occupancyWindow, buildGrid, cellPct, formatMinutes, lotKind, moveWarning, plannedArrivalDate, pctPillClass, WARNING_TEXT, ZERO_LOAD_TEXT, zeroLoadReason } from "../utils/levelingCalculations";
import { DatePickerPopover } from "./DatePickerPopover";
import { mergeMoveHistory } from "../utils/moveHistory";

interface LotDetailSidePanelProps {
  readOnly?: boolean;
  data: LevelingData;
  allLots: LotItem[];
  category: ProcessCategory;
  lot: LotItem | null;
  gridData: DayGateLoad[];
  capacity: Record<string, Record<string, CapacityDay>>;
  today: string;
  plannedIndex: Map<string, string>;
  /** 0 = no plan has been saved yet */
  planVersion: number;
  onApply: (lot: LotItem, newDate: string) => void;
  onCancel: () => void;
  onOpenCapacityModal: () => void;
  isDraggingCard?: boolean;
}

const formatDate = (value: string | null) => (value ? dayjs(value).format("DD/MM/YYYY") : "-");

const solidPctBadge = (val: number) => {
  if (val > 100) return "bg-rose-600 text-white font-bold";
  if (val > 85) return "bg-amber-600 text-white font-bold";
  return "bg-emerald-600 text-white font-bold";
};

const LotDetailSidePanelView: React.FC<LotDetailSidePanelProps> = ({
  data,
  allLots,
  category,
  lot,
  gridData,
  capacity,
  today,
  plannedIndex,
  planVersion,
  onApply,
  onCancel,
  onOpenCapacityModal,
  isDraggingCard = false,
  readOnly = false,
}) => {
  const releaseBoxRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Keep last non-null lot so the drawer can animate sliding out smoothly
  const [renderedLot, setRenderedLot] = useState<LotItem | null>(lot);
  useEffect(() => {
    if (lot) {
      setRenderedLot(lot);
    }
  }, [lot]);

  const isOpen = Boolean(lot) && !isDraggingCard;

  // Allow closing with Escape key when popover is not open
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !popoverOpen) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, popoverOpen, onCancel]);

  const activeLot = lot || renderedLot;
  if (!activeLot || typeof document === "undefined") {
    return null;
  }

  const warning = moveWarning(activeLot, activeLot.plannedDate, plannedIndex, data);
  const isNeed = activeLot.gateState === "need_wip" || activeLot.label.trim().toUpperCase() === "NEED WIP";
  const standard = data.gates.find((gate) => gate.gate === activeLot.gate)?.standardShiftMin;
  const normalMinutes = standard ? standard.day + standard.night : null;
  const lotMinutes = activeLot.loadMin ?? normalMinutes;
  const noLoad = zeroLoadReason(activeLot);
  const isLate = warning === "late" || warning === "order";
  const projectedEnd = occupancyWindow(data, activeLot)?.endDate;
  const diffDays = projectedEnd && activeLot.mustOut ? dayjs(activeLot.mustOut).diff(dayjs(projectedEnd), "day") : null;
  const openDays = gridData.filter((day) => day.date >= today && !day.gates[activeLot.gate]?.off);
  const arrivalDate = plannedArrivalDate(activeLot.arriveBy, activeLot);
  const cell = gridData.find((day) => day.date === arrivalDate)?.gates[activeLot.gate];
  const dayCapacity = arrivalDate ? capacity[activeLot.gate]?.[arrivalDate] : undefined;
  const pct = cellPct(cell);
  // Removing one allocation must not subtract a lot still represented by another allocation.
  const memberKeys = new Set(expandBoardLots(allLots, [activeLot]).map((lot) => lot.workKey));
  const withoutRows = data.arrivalRows.filter((row) => !memberKeys.has(row.workKey) || row.gate_name !== activeLot.gate);
  const withoutCell = arrivalDate ? buildGrid({ ...data, arrivalRows: withoutRows }, allLots, false, category)
    .find((day) => day.date === arrivalDate)?.gates[activeLot.gate] : undefined;
  const pctWithout = cellPct(withoutCell);
  const { previous: prevPlanned, next: nextPlanned } = adjacentGateDates(activeLot, plannedIndex);

  const savedOrderId = JSON.stringify([activeLot.gate, activeLot.savedDate, lotKind(activeLot),
    lotKind(activeLot) === "lot" ? activeLot.label.trim() : activeLot.workKey]);
  const savedOrder = data.boardCardOrder?.find((group) => group.gate === activeLot.gate && group.date === activeLot.savedDate);
  const savedPosition = (savedOrder?.cardIds.indexOf(savedOrderId) ?? -1) + 1;
  // Older plans have snapshots but no audit events. Label these summaries explicitly.
  const historyEntries: MoveHistoryEntry[] = mergeMoveHistory(
    activeLot.moveHistory,
    activeLot.savedDate !== activeLot.baseDate && !activeLot.moveHistory?.some((entry) => entry.planVersion && entry.kind !== "reorder")
      ? [{
          id: "mh-saved-plan",
          fromDate: activeLot.baseDate,
          toDate: activeLot.savedDate,
          changedAt: "",
          changedBy: planVersion > 0 ? `Saved plan v${planVersion}` : "Saved plan",
        }]
      : [],
    savedPosition > 0 && !activeLot.moveHistory?.some((entry) => entry.planVersion && entry.kind === "reorder")
      ? [{ id: "mh-saved-order", kind: "reorder", fromDate: activeLot.savedDate, toDate: activeLot.savedDate,
          toPosition: savedPosition, changedAt: data.plan?.savedAt ?? "", changedBy: data.plan?.savedBy ?? "Saved plan",
          planVersion: planVersion || undefined, note: "Saved order snapshot; earlier changes were not recorded" }]
      : []
  );

  return createPortal(
    <>
      {/* Subtle backdrop that closes the drawer when clicked (disabled while dragging) */}
      <div
        aria-hidden="true"
        onClick={onCancel}
        className={`fixed inset-0 z-[90] bg-slate-900/25 transition-opacity duration-300 ${
          isOpen
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Full-height right drawer with the details of one card */}
      <aside
        role="dialog"
        aria-label="Card detail drawer"
        aria-modal="true"
        className={`planning-summary-gate fixed inset-y-0 right-0 z-[100] w-[400px] max-w-[92vw] h-dvh bg-base-100 border-l border-base-300 shadow-2xl flex flex-col text-base-content transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        {/* 1. Header */}
        <div className="px-5 py-4 border-b border-base-200 bg-base-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-600 text-white">
                  {activeLot.gate}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700 text-white">
                  {activeLot.gateState === "in_gate" ? "In gate" : activeLot.gateState === "need_wip" ? "Need WIP" : "Coming"}
                  {activeLot.currentProc ? ` · ${activeLot.currentProc}` : ""}
                </span>
                {activeLot.isHold && (
                  <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-rose-600 text-white">HOLD</span>
                )}
                {activeLot.overdue && (
                  <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-rose-600 text-white">Overdue</span>
                )}
              </div>
              <h4 className="text-[16px] font-bold text-base-content leading-snug break-all">
                {activeLot.product}
              </h4>
              <div className="text-xs font-mono font-bold text-base-content/70 mt-0.5">
                {activeLot.label}
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="btn btn-xs btn-ghost btn-square h-7 w-7 text-base-content/50 hover:text-base-content hover:bg-base-200"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2.5 text-xs text-base-content/65 mt-2.5 pt-2 border-t border-base-200 tabular-nums">
            <span><strong>{formatGateQuantity(activeLot.qty, "piece")}</strong> pcs</span>
            {activeLot.sheets !== null && (
              <>
                <span className="text-base-content/30">•</span>
                <span><strong>{formatGateQuantity(activeLot.sheets, "sheet")}</strong> sheets</span>
              </>
            )}
            <span className="text-base-content/30">•</span>
            <span>SO Due: <strong className="text-base-content">{formatDate(activeLot.dueDate)}</strong></span>
          </div>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5 text-xs">

          {/* Key Dates Table */}
          <div className="rounded-xl border border-base-200 p-3 bg-base-100 flex flex-col gap-1 tabular-nums">
            <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50 mb-1">
              Dates
            </span>
            {activeLot.prevGate && (
              <div className="flex items-center justify-between py-1 border-b border-base-200">
                <span className="text-base-content/70">Previous gate · {activeLot.prevGate}</span>
                <span className="font-semibold">{formatDate(prevPlanned)}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-1 border-b border-base-200">
              <span className="text-base-content/70">Source arrival</span>
              <span className="font-semibold">{formatDate(activeLot.arriveBy)}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-base-200">
              <span className="font-semibold text-rose-700">Must out</span>
              <span className="font-bold text-rose-700">{formatDate(activeLot.mustOut)}</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-base-200">
              <span className="text-base-content/70">Projected completion</span>
              <span className="font-semibold">{formatDate(projectedEnd ?? null)}</span>
            </div>
            {activeLot.nextGate && (
              <div className="flex items-center justify-between py-1">
                <span className="text-base-content/70">Next gate · {activeLot.nextGate}</span>
                <span className="font-semibold">{formatDate(nextPlanned)}</span>
              </div>
            )}
          </div>

          {/* Planned Date */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-base-content/50 block mb-1">
              {activeLot.gate} Arrival Date
            </label>
            <div
              ref={releaseBoxRef}
              onClick={() => { if (!readOnly) setPopoverOpen((prev) => !prev); }}
              className="flex items-center justify-between border border-base-300 rounded-xl px-3 py-2 bg-base-100 cursor-pointer hover:border-primary transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon size={14} className="text-primary" />
                <span className="font-bold text-base-content tabular-nums text-xs">
                  {formatDate(activeLot.plannedDate)}
                </span>
              </div>
              <span
                className={`px-2.5 py-0.5 rounded text-[11px] font-bold tabular-nums text-white shadow-xs ${
                  isLate
                    ? "bg-rose-600"
                    : warning === "early"
                    ? "bg-amber-600"
                    : "bg-emerald-600"
                }`}
              >
                {diffDays === null ? "Check completion" : warning === "order" ? "gate order" : isLate ? `late · ${diffDays}d` : warning === "early" ? "early" : `fits · +${diffDays}d slack`}
              </span>
            </div>
            {warning !== "none" && (
              <div className={`mt-1 text-[11px] font-medium leading-snug ${isLate ? "text-rose-700" : "text-amber-800"}`}>
                {WARNING_TEXT[warning]}.
              </div>
            )}
            {activeLot.sourceChanged && (
              <div className="mt-1 text-[11px] font-medium leading-snug text-amber-800">
                Source arrival changed in Summary Gate after this move was saved.
              </div>
            )}

            {popoverOpen && (
              <DatePickerPopover
                lot={activeLot}
                days={openDays}
                anchorEl={releaseBoxRef.current}
                onSelectDate={(newDate) => {
                  setPopoverOpen(false);
                  if (newDate !== activeLot.plannedDate) {
                    onApply(activeLot, newDate);
                  }
                }}
                onClose={() => setPopoverOpen(false)}
              />
            )}
          </div>

          {/* Arrival Load & Capacity */}
          <div className="rounded-xl border border-base-200 bg-base-100 p-3 flex flex-col gap-2 tabular-nums">
            <div className="flex items-center justify-between">
              <span className="font-bold text-base-content text-[11.5px]">
                {activeLot.gate} arrival load · {arrivalDate ? dayjs(arrivalDate).format("DD/MM") : "-"}
              </span>
              <button
                type="button"
                disabled={readOnly}
                onClick={onOpenCapacityModal}
                className="text-primary hover:underline font-semibold text-[11px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Settings size={11} />
                <span>Edit capacity</span>
              </button>
            </div>

            {!cell ? (
              <div className="text-base-content/50 py-1">This date is outside the period shown.</div>
            ) : (
              <>
                <div className="flex items-center justify-between py-1 border-b border-base-200">
                  <span className="text-base-content/70">Lot Work</span>
                  <span className="font-semibold text-base-content">
                    {isNeed ? "0 min" : noLoad ? "0 min" : lotMinutes ? `${Math.round(lotMinutes).toLocaleString()} min` : "-"}
                    {activeLot.routeLeadDays ? ` (${activeLot.routeLeadDays}d / ${activeLot.routeTotalProc ?? 1} proc)` : ""}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-base-200">
                  <span className="text-base-content/70">Load / Capacity</span>
                  <span className="font-semibold text-base-content">
                    {Math.round(cell.loadMin).toLocaleString()} / {cell.off ? "OFF" : formatMinutes(cell.capacityMin)}
                    {cell.hasOt && <span className="ml-1 text-[10px] text-amber-700 font-bold">OT</span>}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-base-200">
                  <span className="text-base-content/70">Load %</span>
                  <div className="flex items-center gap-1.5 font-semibold">
                    {pctWithout !== null && (
                      <span className={`px-2 py-0.5 rounded text-[10.5px] text-white font-bold ${solidPctBadge(pctWithout)}`}>
                        {pctWithout}%
                      </span>
                    )}
                    <ArrowRight size={10} className="text-base-content/40" />
                    <span className={`px-2 py-0.5 rounded text-[10.5px] text-white font-bold ${solidPctBadge(pct)}`}>
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Shift Breakdown */}
                {dayCapacity && (
                  <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-200 border border-base-300">
                      <span className="font-medium text-base-content/70">Day</span>
                      <span className="font-semibold">{dayCapacity.shifts.day.open ? formatMinutes(dayCapacity.shifts.day.capacityMin) : "Off"}</span>
                    </div>
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-200 border border-base-300">
                      <span className="font-medium text-base-content/70">Night</span>
                      <span className="font-semibold">{dayCapacity.shifts.night.open ? formatMinutes(dayCapacity.shifts.night.capacityMin) : "Off"}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Source Allocations */}
          <details className="rounded-xl border border-base-200 p-3 bg-base-100">
            <summary className="cursor-pointer font-semibold text-xs text-base-content/80 select-none">
              Source allocations ({activeLot.allocations?.length ?? 0})
            </summary>
            <div className="mt-2 max-h-48 overflow-auto">
              <table className="w-full text-left text-[11px] tabular-nums">
                <thead className="text-base-content/50 border-b border-base-200">
                  <tr>
                    <th className="py-1">SO / Item</th>
                    <th className="py-1">Due</th>
                    <th className="py-1 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-200/50">
                  {activeLot.allocations?.map((row, index) => (
                    <tr key={`${row.workKey}-${index}`}>
                      <td className="py-1.5 font-medium">{row.po_no || "-"} · {row.item || "-"}</td>
                      <td className="py-1.5 text-base-content/70">{formatDate(row.due_date)}</td>
                      <td className="py-1.5 text-right font-semibold">{formatGateQuantity(row.qty ?? null, "piece")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* Move History */}
          <div className="rounded-xl border border-base-200 p-3 bg-base-100 flex flex-col gap-2 tabular-nums">
            <div className="flex items-center justify-between">
              <span className="font-bold text-base-content text-[11.5px]">
                Move History
              </span>
              <span className="text-base-content/50 text-[11px]">
                {historyEntries.length} {historyEntries.length === 1 ? "change" : "changes"}
              </span>
            </div>

            {historyEntries.length === 0 ? (
              <div className="text-base-content/50 text-[11px] py-1">
                No changes recorded (Base: {formatDate(activeLot.baseDate)})
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {historyEntries.map((entry) => {
                  const delta = dayjs(entry.toDate).diff(dayjs(entry.fromDate), "day");
                  const isReorder = entry.kind === "reorder";
                  return (
                    <div key={entry.id} className="p-2 rounded-lg bg-base-200 border border-base-300 flex flex-col gap-1 text-[11px]">
                      <div className="flex items-center justify-between font-semibold">
                        <div className="flex items-center gap-1 text-base-content">
                          <span>{isReorder ? `#${entry.fromPosition}` : formatDate(entry.fromDate)}</span>
                          <ArrowRight size={10} className="text-base-content/40" />
                          <span className="text-primary font-bold">{isReorder ? `#${entry.toPosition}` : formatDate(entry.toDate)}</span>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold text-white ${
                          isReorder || delta < 0 ? "bg-indigo-600" : "bg-amber-600"
                        }`}>
                          {isReorder ? "Reorder" : delta < 0 ? `${delta}d` : `+${delta}d`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[10.5px] text-base-content/60">
                        <span>{entry.changedBy}</span>
                        <span>{entry.changedAt ? dayjs(entry.changedAt).format("DD/MM/YY HH:mm") : ""}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </aside>
    </>,
    document.body
  );
};

export const LotDetailSidePanel = React.memo(LotDetailSidePanelView);
