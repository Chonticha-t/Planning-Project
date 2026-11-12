import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import {
  GripVertical,
  Calendar as CalendarIcon,
  Info,
  AlertCircle,
  Sun,
  Moon,
  SunMoon,
  AlertTriangle,
  Clock3,
} from "lucide-react";
import type { BoardShiftAllocation, DayGateLoad, LotItem, MoveWarning } from "../types";
import { formatMinutes, isMoved as cardIsMoved, WARNING_TEXT } from "../utils/levelingCalculations";
import { DatePickerPopover } from "./DatePickerPopover";

const SHIFT_THEMES = {
  day: { label: "Day Shift", Icon: Sun, badge: "bg-yellow-100 text-yellow-950 border-yellow-300", background: "color-mix(in oklab, #facc15 10%, var(--color-base-100))" },
  night: { label: "Night Shift", Icon: Moon, badge: "bg-indigo-100 text-indigo-950 border-indigo-200", background: "color-mix(in oklab, #4f46e5 7%, var(--color-base-100))" },
  split: { label: "Day + Night", Icon: SunMoon, badge: "bg-violet-100 text-violet-950 border-violet-200", background: "linear-gradient(115deg, color-mix(in oklab, #facc15 10%, var(--color-base-100)), color-mix(in oklab, #4f46e5 7%, var(--color-base-100)))" },
  over: { label: "Over capacity", Icon: AlertTriangle, badge: "bg-rose-100 text-rose-900 border-rose-200", background: "color-mix(in oklab, #f43f5e 6%, var(--color-base-100))" },
  unassigned: { label: "Shift pending", Icon: Clock3, badge: "bg-base-200 text-base-content/70 border-base-300", background: undefined },
  none: { label: "No shift", Icon: Clock3, badge: "", background: undefined },
} as const;

interface LotCardProps {
  lot: LotItem;
  shiftAllocation?: BoardShiftAllocation;
  isSelected: boolean;
  isBatchSelected: boolean;
  showSelection: boolean;
  compact?: boolean;
  onToggleSelection: (lot: LotItem) => void;
  isBeingDragged: boolean;
  isMovingPreview?: boolean;
  previewTargetDate?: string | null;
  /** Result of this card's date against its own must-out, arrive-by and next gate */
  warning: MoveWarning;
  /** Days on which this card's gate is open */
  days: DayGateLoad[];
  onSelect: (lot: LotItem) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, lot: LotItem) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onDateChange: (lot: LotItem, newDate: string) => void;
}

export const LotCard: React.FC<LotCardProps> = ({
  lot,
  shiftAllocation,
  isSelected,
  isBatchSelected,
  showSelection,
  compact = false,
  onToggleSelection,
  isBeingDragged,
  isMovingPreview = false,
  previewTargetDate,
  warning,
  days,
  onSelect,
  onDragStart,
  onDragEnd,
  onDateChange,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notePos, setNotePos] = useState<{ top: number; left: number } | null>(
    null
  );
  const chipBtnRef = useRef<HTMLButtonElement>(null);
  const noteBtnRef = useRef<HTMLButtonElement>(null);

  // Lifted (tilted) card while moving: rendered in a portal on top of the page,
  // positioned over the ghost so the column's overflow can't clip it and
  // neighbouring day columns can't cover it.
  const isLifted = (isBeingDragged || isMovingPreview) && Boolean(previewTargetDate);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [liftPos, setLiftPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!isLifted) {
      setLiftPos(null);
      return;
    }
    const update = () => {
      const r = ghostRef.current?.getBoundingClientRect();
      if (r) setLiftPos({ top: r.top + 10, left: r.left + 6 });
    };
    update();
    window.addEventListener("scroll", update, true); // board + column scrolls
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isLifted, compact]);

  useEffect(() => {
    if (!noteOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        noteBtnRef.current &&
        !noteBtnRef.current.contains(e.target as Node)
      ) {
        setNoteOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [noteOpen]);

  const isMoved = cardIsMoved(lot);
  const isLate = warning === "late" || warning === "order";
  const isEarly = warning === "early";
  const hasNote = isMoved || warning !== "none" || lot.sourceChanged || lot.loadMin === null || !lot.leadDays;

  const releaseDisplay = dayjs(lot.plannedDate).format("DD/MM/YYYY");
  const wasDisplay = dayjs(lot.baseDate).format("DD/MM/YYYY");
  const mustStartDisplay = lot.mustOut ? dayjs(lot.mustOut).format("DD/MM/YYYY") : "N/A";
  const shiftTheme = shiftAllocation ? SHIFT_THEMES[shiftAllocation.status] : null;
  const ShiftIcon = shiftTheme?.Icon ?? Clock3;
  const shiftBadge = shiftAllocation && shiftTheme && shiftAllocation.status !== "none" ? (
    <span
      data-shift-status={shiftAllocation.status}
      aria-label={`Planned shift: ${shiftTheme.label}`}
      title={shiftAllocation.reason ?? `Planned allocation · Day: ${formatMinutes(shiftAllocation.dayMin)} · Night: ${formatMinutes(shiftAllocation.nightMin)}${shiftAllocation.overflowMin > 0 ? ` · Unallocated: ${formatMinutes(shiftAllocation.overflowMin)}` : ""}`}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-tight ${isSelected && !isLifted ? "bg-white/20 text-white border-white/30" : shiftTheme.badge}`}
    >
      <ShiftIcon size={11} className="shrink-0" aria-hidden="true" />
      <span>{shiftTheme.label}</span>
    </span>
  ) : null;

  // Moving preview state (ghost card + lifted card)
  if ((isBeingDragged || isMovingPreview) && previewTargetDate) {
    const targetDisplay = dayjs(previewTargetDate).format("DD/MM/YYYY");
    return (
      <div className="relative" data-lot-id={lot.id}>
        {/* Ghost placeholder (keeps the card's place in the column) */}
        <div
          ref={ghostRef}
          draggable
          onDragStart={(e) => onDragStart(e, lot)}
          onDragEnd={onDragEnd}
          onClick={() => onSelect(lot)}
          className={`rounded-xl ${compact ? "p-2" : "p-2.5"} border border-dashed border-base-300 bg-base-200/50 opacity-60 text-base-content/50 select-none cursor-grab`}
        >
          <div className="text-xs font-semibold leading-snug">
            {lot.label} · {lot.product}
          </div>
          <div className="text-[10.5px] italic mt-1">dragging...</div>
        </div>

        {/* Lifted tilted card — portal so it floats over the next day column.
            pointer-events-none: drag-over / drop still reach the day columns underneath. */}
        {liftPos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              style={{ top: liftPos.top, left: liftPos.left, background: shiftTheme?.background }}
              className={`planning-summary-gate pointer-events-none fixed z-[60] ${compact ? "w-[132px] p-2" : "w-[160px] p-2.5"} -rotate-2 rounded-xl bg-base-100 border-[1.5px] border-primary shadow-lg select-none`}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs font-bold text-base-content leading-snug">
                  {lot.label} · {lot.product}
                </span>
                <GripVertical size={13} className="text-base-content/30 shrink-0" />
              </div>
              {shiftBadge && <div className="mt-1.5">{shiftBadge}</div>}
              <div className="mt-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums bg-[#eef2ff] text-[#4f46e5] border border-indigo-200">
                  <CalendarIcon size={11} className="text-primary" />
                  <span title={`${releaseDisplay} → ${targetDisplay}`}>
                    {compact ? dayjs(lot.plannedDate).format("DD/MM") : releaseDisplay} → {compact ? dayjs(previewTargetDate).format("DD/MM") : targetDisplay}
                  </span>
                </span>
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  }

  let borderClass =
    "border border-base-300 bg-base-100 hover:border-base-content/30 text-base-content";
  if (isSelected) {
    borderClass =
      "border-[1.5px] border-[#4f46e5] bg-[#4f46e5] text-white shadow-md ring-2 ring-[#4f46e5]/25";
  } else if (isLate) {
    borderClass = warning === "order"
      ? "border-2 border-rose-700 bg-rose-100/60 text-base-content"
      : "border-[1.5px] border-rose-500 bg-rose-50/30 text-base-content";
  } else if (isEarly) {
    borderClass = "border-[1.5px] border-amber-400 bg-amber-50/40 text-base-content";
  } else if (isMoved) {
    borderClass = "border-[1.5px] border-indigo-300 bg-base-100 text-base-content";
  }

  return (
    <div
      data-lot-id={lot.id}
      data-planned-shift={shiftAllocation?.status}
      style={{ background: !isSelected && !isLate && !isEarly ? shiftTheme?.background : undefined }}
      draggable
      onDragStart={(e) => onDragStart(e, lot)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(lot)}
      className={`relative group rounded-xl ${compact ? "p-2" : "p-2.5"} shadow-2xs transition-all cursor-grab active:cursor-grabbing select-none ${borderClass} ${isBatchSelected ? "ring-2 ring-primary ring-offset-1 ring-offset-base-100" : ""}`}
    >
      {/* Top Row: PO · Product & Drag Grip */}
      <div className="flex items-start justify-between gap-1">
        {showSelection && <input type="checkbox" aria-label={`Select ${lot.label} ${lot.product}`}
          checked={isBatchSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelection(lot)}
          className="checkbox checkbox-xs checkbox-primary mt-0.5 shrink-0 cursor-pointer" />}
        <div
          className={`min-w-0 flex-1 font-bold ${compact ? "text-[11px] leading-tight" : "text-xs leading-snug"} ${
            isSelected ? "text-white" : "text-base-content"
          }`}
        >
          <div className={compact ? "truncate" : "break-all"} title={lot.label}>{lot.label}</div>
          <div
            title={lot.product}
            className={`font-semibold ${compact ? "truncate" : ""} ${
              isSelected ? "text-white/90" : "text-base-content/80"
            }`}
          >
            {lot.product}
          </div>
        </div>
        <GripVertical
          size={13}
          className={`shrink-0 mt-0.5 ${
            isSelected
              ? "text-white/70 group-hover:text-white"
              : "text-base-content/30 group-hover:text-base-content/60"
          }`}
        />
      </div>

      {shiftBadge && <div className={compact ? "mt-1" : "mt-1.5"}>{shiftBadge}</div>}

      {/* Date Chip + Note Indicator Icon */}
      <div className={`${compact ? "mt-1" : "mt-2"} relative flex items-center gap-1`}>
        <button
          ref={chipBtnRef}
          type="button"
          title={`${lot.gate} date: ${releaseDisplay}`}
          aria-label={`Change ${lot.gate} date for ${lot.label}, ${releaseDisplay}`}
          onClick={(e) => {
            e.stopPropagation();
            setPopoverOpen((prev) => !prev);
          }}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold tabular-nums border transition-colors cursor-pointer whitespace-nowrap min-w-0 ${
            isSelected
              ? "bg-white/20 text-white border-white/30 hover:bg-white/30"
              : isLate
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : isEarly
              ? "bg-amber-50 text-amber-800 border-amber-200"
              : isMoved
              ? "bg-[#eef2ff] text-[#4f46e5] border-indigo-200"
              : "bg-base-200/70 text-base-content border-base-300 hover:bg-base-200"
          }`}
        >
          <CalendarIcon
            size={10}
            className={`shrink-0 ${isSelected ? "text-white" : "text-primary"}`}
          />
          <span>{compact ? dayjs(lot.plannedDate).format("DD/MM") : releaseDisplay}</span>
        </button>

        {/* Trailing note button: warning, moved, changed source or incomplete planning data */}
        {hasNote && (
          <button
            ref={noteBtnRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!noteOpen && noteBtnRef.current) {
                const rect = noteBtnRef.current.getBoundingClientRect();
                setNotePos({
                  top: rect.bottom + 6,
                  left: Math.min(rect.left, window.innerWidth - 220),
                });
              }
              setNoteOpen((prev) => !prev);
            }}
            title={
              warning !== "none"
                ? `${WARNING_TEXT[warning]} · Must out ${mustStartDisplay}`
                : isMoved
                ? `Moved from ${wasDisplay}`
                : lot.sourceChanged
                ? "Must-out changed after this move was saved"
                : "Check gate lead time and normal shift minutes"
            }
            className={`inline-flex items-center justify-center w-[21px] h-[21px] rounded-md border transition-colors cursor-pointer shrink-0 ${
              isSelected
                ? "bg-white/20 border-white/30 text-white hover:bg-white/30"
                : isLate
                ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
                : isEarly || !isMoved
                ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                : "bg-[#eef2ff] border-indigo-200 text-[#4f46e5] hover:bg-indigo-100"
            }`}
          >
            {warning !== "none" ? <AlertCircle size={11} /> : <Info size={11} />}
          </button>
        )}

        {popoverOpen && (
          <DatePickerPopover
            lot={lot}
            days={days}
            anchorEl={chipBtnRef.current}
            onSelectDate={(newDate) => {
              onDateChange(lot, newDate);
              setPopoverOpen(false);
            }}
            onClose={() => setPopoverOpen(false)}
          />
        )}

        {noteOpen &&
          notePos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ top: notePos.top, left: notePos.left }}
              className="planning-summary-gate fixed z-[140] w-[205px] rounded-xl bg-base-100 border border-base-300 shadow-xl p-2.5 text-xs text-base-content tabular-nums space-y-1.5"
            >
              <div className="font-bold text-base-content border-b border-base-200 pb-1 flex items-center justify-between gap-2">
                <span className="min-w-0 break-all">
                  {lot.label} · {lot.gate}
                </span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isLate
                      ? "bg-rose-50 text-rose-700"
                      : isEarly
                      ? "bg-amber-50 text-amber-800"
                      : "bg-[#eef2ff] text-[#4f46e5]"
                  }`}
                >
                  {warning === "order" ? "Gate order" : isLate ? "Late" : isEarly ? "Early" : isMoved ? "Moved" : "Note"}
                </span>
              </div>
              {warning !== "none" && (
                <div className={`text-[11px] font-semibold leading-snug ${isLate ? "text-rose-700" : "text-amber-800"}`}>
                  {WARNING_TEXT[warning]}
                </div>
              )}
              {isMoved && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-base-content/55">Was date:</span>
                  <span className="font-semibold text-[#4f46e5]">
                    {wasDisplay}
                  </span>
                </div>
              )}
              {lot.arriveBy && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-base-content/55">Arrive by:</span>
                  <span className="font-semibold text-base-content">
                    {dayjs(lot.arriveBy).format("DD/MM/YYYY")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-base-content/55">Must out:</span>
                <span
                  className={`font-semibold ${
                    isLate ? "text-rose-600" : "text-base-content"
                  }`}
                >
                  {mustStartDisplay}
                </span>
              </div>
              {lot.sourceChanged && (
                <div className="text-[11px] font-semibold leading-snug text-amber-800">
                  Source arrival changed in Summary Gate after this move was saved.
                </div>
              )}
              {lot.loadMin === null && (
                <div className="text-[11px] font-semibold leading-snug text-amber-800">
                  Normal shift minutes are missing; arrival load cannot be calculated.
                </div>
              )}
              {!lot.leadDays && <div className="text-[11px] text-amber-800">Gate lead time is missing; this arrival cannot be moved until it is configured.</div>}
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};
