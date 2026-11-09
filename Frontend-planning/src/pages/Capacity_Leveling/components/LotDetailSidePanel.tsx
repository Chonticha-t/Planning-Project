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
import type { LotItem, DayGateLoad, MoveHistoryEntry } from "../types";
import { computeDragPreview } from "../utils/levelingCalculations";
import { GATES_CONFIG } from "../mock/levelingMockData";
import { DatePickerPopover } from "./DatePickerPopover";

interface LotDetailSidePanelProps {
  lot: LotItem | null;
  previewDate: string;
  onPreviewDateChange: (newDate: string) => void;
  gridData: DayGateLoad[];
  onApply: (lot: LotItem, newDate: string) => void;
  onCancel: () => void;
  onOpenCapacityModal: () => void;
  isMoving?: boolean;
  isDraggingCard?: boolean;
  frozenUntilDate?: string;
}

export const LotDetailSidePanel: React.FC<LotDetailSidePanelProps> = ({
  lot,
  gridData,
  onApply,
  onCancel,
  onOpenCapacityModal,
  isDraggingCard = false,
  frozenUntilDate = "2026-11-02",
}) => {
  const releaseBoxRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [inspectedGateId, setInspectedGateId] = useState<string>("FADL");

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

  const diffDays = dayjs(activeLot.mustStartDate).diff(
    dayjs(activeLot.releaseDate),
    "day"
  );
  const isLate = diffDays < 0;

  const preview = computeDragPreview(
    gridData,
    activeLot,
    activeLot.releaseDate
  );

  // Find currently inspected route row (defaults to FADL or first row)
  const inspectedRow =
    preview.routeTableRows.find((r) => r.gateId === inspectedGateId) ||
    preview.routeTableRows.find((r) => r.gateId === "FADL") ||
    preview.routeTableRows[0];

  const gateDef =
    GATES_CONFIG.find((g) => g.id === inspectedRow?.gateId) || GATES_CONFIG[2];

  const getPctPillClass = (pct: number) => {
    if (pct > 100) {
      return "bg-[#fee2e2] text-[#991b1b] font-semibold";
    }
    if (pct >= 80) {
      return "bg-[#fef3c7] text-[#92400e] font-semibold";
    }
    return "bg-[#d1fae5] text-[#065f46] font-semibold";
  };

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

      {/* Full-Height Right Navigation Drawer (Details & Capacity Inspection Only) */}
      <aside
        role="dialog"
        aria-label="Lot detail drawer"
        aria-modal="true"
        className={`planning-summary-gate fixed inset-y-0 right-0 z-[100] w-[410px] max-w-[92vw] h-dvh bg-base-100 border-l border-base-300 shadow-2xl flex flex-col text-base-content transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
      >
        {/* 1. Sticky Drawer Header */}
        <div className="px-5 py-4 border-b border-base-300 bg-base-100 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-base font-bold text-base-content">
              {activeLot.id} · {activeLot.product}
            </h4>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md text-xs font-semibold bg-base-200 text-base-content/75 border border-base-300">
                Selected
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
            {activeLot.qty.toLocaleString()} pcs ·{" "}
            {activeLot.routeId.replace(/_/g, " ")} · Ship P1{" "}
            {activeLot.shipDate}/2026
          </div>
        </div>

        {/* 2. Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* System start & Must start */}
          <div className="flex flex-col text-xs">
            <div className="flex items-center justify-between py-2 border-b border-base-200">
              <span className="text-base-content/60 font-medium">
                System start
              </span>
              <span className="font-semibold text-base-content tabular-nums">
                {dayjs(activeLot.systemStartDate).format("DD/MM/YYYY")}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-base-200">
              <span className="text-base-content/60 font-medium">
                Must start
              </span>
              <span className="font-semibold text-base-content tabular-nums">
                {dayjs(activeLot.mustStartDate).format("DD/MM/YYYY")}
              </span>
            </div>
          </div>

          {/* Release Date Box */}
          <div>
            <label className="text-xs font-semibold text-base-content block mb-1.5">
              Release date
            </label>
            <div
              ref={releaseBoxRef}
              onClick={() => setPopoverOpen((prev) => !prev)}
              className="relative flex items-center justify-between border-[1.5px] border-primary rounded-xl px-3 py-2.5 bg-base-100 cursor-pointer hover:bg-base-200/30 transition-colors select-none"
            >
              <div className="flex items-center gap-2">
                <CalendarIcon size={14} className="text-primary shrink-0" />
                <span className="text-xs font-bold text-base-content tabular-nums">
                  {dayjs(activeLot.releaseDate).format("DD/MM/YYYY")}
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                  isLate
                    ? "bg-[#fee2e2] text-[#991b1b]"
                    : "bg-[#d1fae5] text-[#065f46]"
                }`}
              >
                {isLate ? "late" : `fits · +${diffDays}d slack`}
              </span>
            </div>

            {popoverOpen && (
              <DatePickerPopover
                lot={activeLot}
                frozenUntilDate={frozenUntilDate}
                anchorEl={releaseBoxRef.current}
                onSelectDate={(newDate) => {
                  setPopoverOpen(false);
                  if (newDate !== activeLot.releaseDate) {
                    onApply(activeLot, newDate);
                  }
                }}
                onClose={() => setPopoverOpen(false)}
              />
            )}
          </div>

          {/* Effect on its route Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-base-content uppercase tracking-wide">
                Effect on its route
              </span>
              <span className="text-xs text-base-content/50">minutes / day</span>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-base-200 text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-1.5 pr-1">GATE</th>
                  <th className="py-1.5 px-1">ARRIVES</th>
                  <th className="py-1.5 px-1 text-right">CAPACITY</th>
                  <th className="py-1.5 px-1 text-right">LOT</th>
                  <th className="py-1.5 px-1 text-center">BEFORE</th>
                  <th className="py-1.5 pl-1 text-center">AFTER</th>
                </tr>
              </thead>
              <tbody className="text-xs tabular-nums">
                {preview.routeTableRows.map((r) => {
                  const isRowActive = inspectedRow?.gateId === r.gateId;
                  return (
                    <tr
                      key={r.gateId}
                      onClick={() => setInspectedGateId(r.gateId)}
                      title="Click to inspect this gate's capacity breakdown"
                      className={`border-b border-base-200/80 last:border-0 cursor-pointer transition-colors ${
                        isRowActive ? "bg-base-200/50" : "hover:bg-base-200/25"
                      }`}
                    >
                      <td className="py-2 pl-1.5 pr-1 font-bold text-base-content">
                        {r.gateName}
                      </td>
                      <td className="py-2 px-1 text-base-content/70">
                        {r.displayDate}
                      </td>
                      <td className="py-2 px-1 text-right text-base-content/80 font-medium whitespace-nowrap">
                        <span>{r.capacityMin.toLocaleString()}</span>
                        {r.hasOt && (
                          <span className="ml-1 px-1.5 py-0.2 rounded-sm text-[10px] font-bold bg-amber-100 text-amber-800">
                            OT
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-1 text-right text-base-content/70 font-medium">
                        +{r.lotMinutes}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <span
                          className={`inline-block min-w-[40px] px-1.5 py-0.5 rounded-md text-[11px] ${getPctPillClass(
                            r.beforePct
                          )}`}
                        >
                          {r.beforePct}%
                        </span>
                      </td>
                      <td className="py-2 pl-1 pr-1 text-center">
                        <span
                          className={`inline-block min-w-[40px] px-1.5 py-0.5 rounded-md text-[11px] ${getPctPillClass(
                            r.afterPct
                          )}`}
                        >
                          {r.afterPct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Gate Capacity Status Box (OT, Break 1, Break 2, Lunch status) */}
          <div className="bg-base-200/40 border border-base-300 rounded-xl p-3.5 flex flex-col gap-2.5 text-xs tabular-nums">
            {/* Top Header of Box */}
            <div className="flex items-center justify-between">
              <span className="font-bold text-base-content">
                Capacity · {inspectedRow?.gateName} ({inspectedRow?.displayDate})
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

            {/* 2x2 Status Grid for OT, Break 1, Break 2, Lunch */}
            <div className="grid grid-cols-2 gap-1.5">
              {/* 1. OT Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-200">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      inspectedRow?.hasOt ? "bg-amber-500" : "bg-slate-300"
                    }`}
                  />
                  <span className="font-semibold text-base-content">OT</span>
                </div>
                <span
                  className={`text-[11px] font-semibold ${
                    inspectedRow?.hasOt
                      ? "text-amber-700"
                      : "text-base-content/45"
                  }`}
                >
                  {inspectedRow?.hasOt ? `On (${gateDef.otMinutes}m)` : "Off"}
                </span>
              </div>

              {/* 2. Break 1 Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-200">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-semibold text-base-content">
                    Break 1
                  </span>
                </div>
                <span className="text-[11px] font-medium text-base-content/70">
                  On (10m)
                </span>
              </div>

              {/* 3. Break 2 Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-200">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-semibold text-base-content">
                    Break 2
                  </span>
                </div>
                <span className="text-[11px] font-medium text-base-content/70">
                  On (10m)
                </span>
              </div>

              {/* 4. Lunch Status */}
              <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-100 border border-base-200">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-semibold text-base-content">Lunch</span>
                </div>
                <span className="text-[11px] font-medium text-base-content/70">
                  On (45m)
                </span>
              </div>
            </div>
          </div>

          {/* Move History Section */}
          {(() => {
            const historyEntries: MoveHistoryEntry[] = [
              ...(activeLot.moveHistory || []),
              ...(activeLot.moveHistory?.length
                ? []
                : activeLot.releaseDate !== activeLot.initialReleaseDate
                ? [
                    {
                      id: "mh-initial-move",
                      fromDate: activeLot.initialReleaseDate,
                      toDate: activeLot.releaseDate,
                      changedAt: "08/11/2026 16:20",
                      changedBy: "Planner · Plan v2",
                      note: "Level gate workload",
                    },
                  ]
                : []),
            ];

            return (
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
                    <span>No moves yet (on initial system start date)</span>
                    <span className="font-semibold text-base-content/75">
                      {dayjs(activeLot.systemStartDate).format("DD/MM/YYYY")}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {historyEntries.map((entry, idx) => {
                      const delta = dayjs(entry.toDate).diff(
                        dayjs(entry.fromDate),
                        "day"
                      );
                      return (
                        <div
                          key={entry.id}
                          className="p-2.5 rounded-lg bg-base-200/40 border border-base-200 flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-base-content">
                              <span className="text-base-content/65">
                                {dayjs(entry.fromDate).format("DD/MM/YYYY")}
                              </span>
                              <ArrowRight
                                size={12}
                                className="text-primary shrink-0"
                              />
                              <span className="text-primary">
                                {dayjs(entry.toDate).format("DD/MM/YYYY")}
                              </span>
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
                            <span>
                              {idx === 0 ? `${entry.changedAt}` : entry.changedAt}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </aside>
    </>,
    document.body
  );
};
