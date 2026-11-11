import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import {
  Calendar as CalendarIcon,
  Settings,
  X,
  History,
  ArrowRight,
} from "lucide-react";
import type { CapacityDay, LotItem, DayGateLoad, MoveHistoryEntry, LevelingData, ProcessCategory } from "../types";
import { adjacentGateDates, expandBoardLots, occupancyWindow, buildGrid, cellPct, formatMinutes, moveWarning, plannedArrivalDate, pctPillClass, WARNING_TEXT } from "../utils/levelingCalculations";
import { DatePickerPopover } from "./DatePickerPopover";

interface LotDetailSidePanelProps {
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

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between py-2 border-b border-base-200">
    <span className="text-base-content/60 font-medium">{label}</span>
    <span className="font-semibold text-base-content tabular-nums text-right">{children}</span>
  </div>
);

export const LotDetailSidePanel: React.FC<LotDetailSidePanelProps> = ({
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

  // Moves made in this draft, then the move stored in the last saved plan.
  const historyEntries: MoveHistoryEntry[] = [
    ...(activeLot.moveHistory || []),
    ...(activeLot.savedDate !== activeLot.baseDate
      ? [{
          id: "mh-saved-plan",
          fromDate: activeLot.baseDate,
          toDate: activeLot.savedDate,
          changedAt: "",
          changedBy: planVersion > 0 ? `Saved plan v${planVersion}` : "Saved plan",
        }]
      : []),
  ];

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
        className={`planning-summary-gate fixed inset-y-0 right-0 z-[100] w-[410px] max-w-[92vw] h-dvh bg-base-100 border-l border-base-300 shadow-2xl flex flex-col text-base-content transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        {/* 1. Sticky Drawer Header */}
        <div className="px-5 py-4 border-b border-base-300 bg-base-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-base font-bold text-base-content break-all">
              {activeLot.label} · {activeLot.product}
            </h4>
            <div className="flex items-center gap-2 shrink-0">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#eef2ff] text-[#4f46e5] border border-indigo-200">
                {activeLot.gate}
              </span>
              <button
                type="button"
                onClick={onCancel}
                className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/60 hover:text-base-content hover:bg-base-200 cursor-pointer"
                title="Close drawer (Esc)"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="text-xs text-base-content/60 mt-1 tabular-nums">
            {formatGateQuantity(activeLot.qty, "piece")} pcs
            {activeLot.sheets !== null ? ` · ${formatGateQuantity(activeLot.sheets, "sheet")} sheets` : ""}
            {activeLot.item ? ` · ${activeLot.item}` : ""} · PO due {formatDate(activeLot.dueDate)}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-base-200 text-base-content/70 border border-base-300">
              {activeLot.gateState === "in_gate" ? "In gate" : activeLot.gateState === "need_wip" ? "Need WIP" : "Coming"}
              {activeLot.currentProc ? ` · ${activeLot.currentProc}` : ""}
            </span>
            {activeLot.isHold && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">HOLD</span>
            )}
            {activeLot.overdue && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">Overdue</span>
            )}
          </div>
        </div>

        {/* 2. Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Dates of this gate and its neighbours */}
          <div className="flex flex-col text-xs">
            {activeLot.prevGate && <Row label={`Previous gate · ${activeLot.prevGate}`}>{formatDate(prevPlanned)}</Row>}
            <Row label="Source arrival">{formatDate(activeLot.arriveBy)}</Row>
            <Row label="Must out">{formatDate(activeLot.mustOut)}</Row>
            <Row label="Projected completion">{formatDate(projectedEnd ?? null)}</Row>
            {activeLot.nextGate && <Row label={`Next gate · ${activeLot.nextGate}`}>{formatDate(nextPlanned)}</Row>}
          </div>

          <details className="rounded-xl border border-base-300 p-3 text-xs">
            <summary className="cursor-pointer font-semibold">Source allocations ({activeLot.allocations?.length ?? 0})</summary>
            <div className="mt-2 max-h-56 overflow-auto">
              <table className="w-full text-left"><thead><tr><th>Product / PO / Item</th><th>Due</th><th>Source arrival</th><th>Qty</th></tr></thead>
                <tbody>{activeLot.allocations?.map((row, index) => (
                  <tr key={`${row.workKey}-${index}`} className="border-t border-base-200">
                    <td className="py-2">{row.prd_name}<br />{row.po_no || "-"} / {row.item || "-"}</td>
                    <td>{formatDate(row.due_date)}</td><td>{formatDate(row.arrive_by ?? null)}</td>
                    <td>{formatGateQuantity(row.qty ?? null, "piece")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </details>

          {/* Arrival date at this gate */}
          <div>
            <label className="text-xs font-semibold text-base-content block mb-1.5">
              {activeLot.gate} arrival date
            </label>
            <div
              ref={releaseBoxRef}
              onClick={() => setPopoverOpen((prev) => !prev)}
              className="relative flex items-center justify-between border-[1.5px] border-primary rounded-xl px-3 py-2.5 bg-base-100 cursor-pointer hover:bg-base-200/30 transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon size={14} className="text-primary shrink-0" />
                <span className="text-xs font-bold text-base-content tabular-nums">
                  {formatDate(activeLot.plannedDate)}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                  isLate
                    ? "bg-[#fee2e2] text-[#991b1b]"
                    : warning === "early"
                    ? "bg-[#fef3c7] text-[#92400e]"
                    : "bg-[#d1fae5] text-[#065f46]"
                }`}
              >
                {diffDays === null ? "Check completion" : warning === "order" ? "gate order" : isLate ? `late · ${diffDays}d` : warning === "early" ? "early" : `fits · +${diffDays}d slack`}
              </span>
            </div>
            {warning !== "none" && (
              <div className={`mt-1.5 text-[11.5px] font-semibold leading-snug ${isLate ? "text-rose-700" : "text-amber-800"}`}>
                {WARNING_TEXT[warning]}.
              </div>
            )}
            {activeLot.sourceChanged && (
              <div className="mt-1.5 text-[11.5px] font-semibold leading-snug text-amber-800">
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

          {/* Load on the arrival date, separate from the board's release date. */}
          <div className="bg-base-200/40 border border-base-300 rounded-xl p-3.5 flex flex-col gap-2.5 text-xs tabular-nums">
            <div className="flex items-center justify-between">
              <span className="font-bold text-base-content">
                {activeLot.gate} arrival load · {arrivalDate ? dayjs(arrivalDate).format("DD/MM") : "Unknown date"}
              </span>
              <button
                type="button"
                onClick={onOpenCapacityModal}
                className="text-primary hover:underline font-semibold text-[11.5px] inline-flex items-center gap-1 cursor-pointer"
              >
                <Settings size={12} />
                <span>Edit capacity</span>
              </button>
            </div>

            {!cell ? (
              <div className="text-base-content/55">This date is outside the period shown.</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Normal minutes / actual arrival lot</span>
                  <span className="font-semibold text-base-content">
                    {isNeed ? "0 min (Need WIP)" : normalMinutes === null || normalMinutes <= 0
                      ? "Check normal shift minutes"
                      : `${Math.round(normalMinutes).toLocaleString()} min`}
                  </span>
                </div>
                <div className="text-[11px] leading-snug text-base-content/60">
                  Actual lots are counted once per gate/arrival date, excluding Need WIP. All allocations in this card move together.
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Arrival load / capacity ({formatDate(arrivalDate)})</span>
                  <span className="font-semibold text-base-content">
                    {Math.round(cell.loadMin).toLocaleString()} / {cell.off ? "OFF" : formatMinutes(cell.capacityMin)}
                    {cell.hasOt && (
                      <span className="ml-1 px-1.5 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-800">OT</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60">Load % without → with this card</span>
                  <span className="inline-flex items-center gap-1.5">
                    {pct === null || pctWithout === null ? (
                      <span className="font-semibold text-base-content/50">{cell.off ? "Gate off" : "Set MC first"}</span>
                    ) : (
                      <>
                        <span className={`inline-block min-w-[40px] text-center px-1.5 py-0.5 rounded-md text-[11px] ${pctPillClass(pctWithout)}`}>{pctWithout}%</span>
                        <ArrowRight size={11} className="text-base-content/40" />
                        <span className={`inline-block min-w-[40px] text-center px-1.5 py-0.5 rounded-md text-[11px] ${pctPillClass(pct)}`}>{pct}%</span>
                      </>
                    )}
                  </span>
                </div>

                {/* Capacity of each shift on this day */}
                {dayCapacity && (
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {(["day", "night"] as const).map((code) => {
                      const shift = dayCapacity.shifts[code];
                      return (
                        <div key={code} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-200">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${!shift.open ? "bg-slate-300" : shift.otOn ? "bg-amber-500" : "bg-primary"}`} />
                            <span className="font-semibold text-base-content">{code === "day" ? "D/S" : "N/S"}</span>
                          </div>
                          <span className="text-[11px] font-medium text-base-content/70">
                            {!shift.open ? "Off" : `${formatMinutes(shift.capacityMin)}${shift.otOn ? " · OT" : ""}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Move History Section */}
          <div className="border border-base-300 rounded-xl p-3.5 bg-base-100 flex flex-col gap-2.5 text-xs tabular-nums">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <History size={13} className="text-primary" />
                <span className="font-bold text-base-content uppercase tracking-wide text-[11.5px]">
                  Move History
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-base-200 text-base-content/65 font-semibold text-[11px]">
                {historyEntries.length}{" "}
                {historyEntries.length === 1 ? "move" : "moves"}
              </span>
            </div>

            {historyEntries.length === 0 ? (
              <div className="py-2.5 px-3 rounded-lg bg-base-200/40 border border-dashed border-base-300 text-base-content/55 text-xs flex items-center justify-between">
                <span>Not moved (on its must-out date)</span>
                <span className="font-semibold text-base-content/75">
                  {formatDate(activeLot.baseDate)}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {historyEntries.map((entry) => {
                  const delta = dayjs(entry.toDate).diff(dayjs(entry.fromDate), "day");
                  return (
                    <div
                      key={entry.id}
                      className="p-2.5 rounded-lg bg-base-200/40 border border-base-200 flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-bold text-base-content">
                          <span className="text-base-content/65">{formatDate(entry.fromDate)}</span>
                          <ArrowRight size={12} className="text-primary shrink-0" />
                          <span className="text-primary">{formatDate(entry.toDate)}</span>
                        </div>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${
                            delta < 0
                              ? "bg-indigo-50 text-[#4f46e5]"
                              : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {delta < 0 ? `${delta}d` : `+${delta}d`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-base-content/55">
                        <span>
                          {entry.changedBy}
                          {entry.note ? ` · ${entry.note}` : ""}
                        </span>
                        <span>{entry.changedAt}</span>
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
