import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import {
  GripVertical,
  Calendar as CalendarIcon,
  Info,
  AlertCircle,
} from "lucide-react";
import type { LotItem } from "../types";
import { DatePickerPopover } from "./DatePickerPopover";

interface LotCardProps {
  lot: LotItem;
  isSelected: boolean;
  isBeingDragged: boolean;
  isMovingPreview?: boolean;
  previewTargetDate?: string | null;
  frozenUntilDate: string;
  onSelect: (lot: LotItem) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, lot: LotItem) => void;
  onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  onDateChange: (lot: LotItem, newDate: string) => void;
}

export const LotCard: React.FC<LotCardProps> = ({
  lot,
  isSelected,
  isBeingDragged,
  isMovingPreview = false,
  previewTargetDate,
  frozenUntilDate,
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
  }, [isLifted]);

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

  const isMoved =
    lot.releaseDate !== lot.initialReleaseDate || Boolean(lot.wasDate);
  const isLate = dayjs(lot.releaseDate).isAfter(dayjs(lot.mustStartDate));

  const releaseDisplay = dayjs(lot.releaseDate).format("DD/MM/YYYY");
  const wasDisplay = lot.wasDate
    ? lot.wasDate.length <= 5
      ? `${lot.wasDate}/${dayjs(lot.initialReleaseDate).format("YYYY")}`
      : lot.wasDate
    : dayjs(lot.initialReleaseDate).format("DD/MM/YYYY");
  const mustStartDisplay = dayjs(lot.mustStartDate).format("DD/MM/YYYY");

  // Moving preview state (ghost card + lifted card)
  if ((isBeingDragged || isMovingPreview) && previewTargetDate) {
    const targetDisplay = dayjs(previewTargetDate).format("DD/MM/YYYY");
    return (
      <div className="relative">
        {/* Ghost placeholder (keeps the card's place in the column) */}
        <div
          ref={ghostRef}
          draggable
          onDragStart={(e) => onDragStart(e, lot)}
          onDragEnd={onDragEnd}
          onClick={() => onSelect(lot)}
          className="rounded-xl p-2.5 border border-dashed border-base-300 bg-base-200/50 opacity-60 text-base-content/50 select-none cursor-grab"
        >
          <div className="text-xs font-semibold leading-snug">
            {lot.id} · {lot.product}
          </div>
          <div className="text-[10.5px] italic mt-1">dragging...</div>
        </div>

        {/* Lifted tilted card — portal so it floats over the next day column.
            pointer-events-none: drag-over / drop still reach the day columns underneath. */}
        {liftPos &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              style={{ top: liftPos.top, left: liftPos.left }}
              className="planning-summary-gate pointer-events-none fixed z-[60] w-[160px] -rotate-2 rounded-xl p-2.5 bg-base-100 border-[1.5px] border-primary shadow-lg select-none"
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-xs font-bold text-base-content leading-snug">
                  {lot.id} · {lot.product}
                </span>
                <GripVertical size={13} className="text-base-content/30 shrink-0" />
              </div>
              <div className="mt-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums bg-[#eef2ff] text-[#4f46e5] border border-indigo-200">
                  <CalendarIcon size={11} className="text-primary" />
                  <span>
                    {releaseDisplay} → {targetDisplay}
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
    borderClass = "border-[1.5px] border-rose-500 bg-rose-50/30 text-base-content";
  } else if (isMoved) {
    borderClass = "border-[1.5px] border-indigo-300 bg-base-100 text-base-content";
  }

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lot)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(lot)}
      className={`relative group rounded-xl p-2.5 shadow-2xs transition-all cursor-grab active:cursor-grabbing select-none ${borderClass}`}
    >
      {/* Top Row: PO · Product & Drag Grip */}
      <div className="flex items-start justify-between gap-1">
        <div
          className={`text-xs font-bold leading-snug ${
            isSelected ? "text-white" : "text-base-content"
          }`}
        >
          <div>{lot.id}</div>
          <div
            className={`font-semibold ${
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

      {/* Date Chip + Note Indicator Icon */}
      <div className="mt-2 relative flex items-center gap-1">
        <button
          ref={chipBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPopoverOpen((prev) => !prev);
          }}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold tabular-nums border transition-colors cursor-pointer whitespace-nowrap min-w-0 ${
            isSelected
              ? "bg-white/20 text-white border-white/30 hover:bg-white/30"
              : isLate
              ? "bg-rose-50 text-rose-700 border-rose-200"
              : isMoved
              ? "bg-[#eef2ff] text-[#4f46e5] border-indigo-200"
              : "bg-base-200/70 text-base-content border-base-300 hover:bg-base-200"
          }`}
        >
          <CalendarIcon
            size={10}
            className={`shrink-0 ${isSelected ? "text-white" : "text-primary"}`}
          />
          <span>{releaseDisplay}</span>
        </button>

        {/* Trailing Note Button for Moved / Late */}
        {(isMoved || isLate) && (
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
              isLate
                ? `Must start ${mustStartDisplay}${
                    isMoved ? ` · Was ${wasDisplay}` : ""
                  }`
                : `Moved from ${wasDisplay}`
            }
            className={`inline-flex items-center justify-center w-[21px] h-[21px] rounded-md border transition-colors cursor-pointer shrink-0 ${
              isSelected
                ? "bg-white/20 border-white/30 text-white hover:bg-white/30"
                : isLate
                ? "bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100"
                : "bg-[#eef2ff] border-indigo-200 text-[#4f46e5] hover:bg-indigo-100"
            }`}
          >
            {isLate ? <AlertCircle size={11} /> : <Info size={11} />}
          </button>
        )}

        {popoverOpen && (
          <DatePickerPopover
            lot={lot}
            frozenUntilDate={frozenUntilDate}
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
              <div className="font-bold text-base-content border-b border-base-200 pb-1 flex items-center justify-between">
                <span>
                  {lot.id} · {lot.product}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isLate
                      ? "bg-rose-50 text-rose-700"
                      : "bg-[#eef2ff] text-[#4f46e5]"
                  }`}
                >
                  {isLate ? "Late" : "Moved"}
                </span>
              </div>
              {isMoved && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-base-content/55">Was date:</span>
                  <span className="font-semibold text-[#4f46e5]">
                    {wasDisplay}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-base-content/55">Must start:</span>
                <span
                  className={`font-semibold ${
                    isLate ? "text-rose-600" : "text-base-content"
                  }`}
                >
                  {mustStartDisplay}
                </span>
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};
