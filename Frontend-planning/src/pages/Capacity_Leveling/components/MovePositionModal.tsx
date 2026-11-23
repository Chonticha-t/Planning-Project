import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ArrowDownToLine, ArrowUpToLine, X } from "lucide-react";
import type { LotItem } from "../types";

interface MovePositionModalProps {
  lot: LotItem;
  position: number;
  total: number;
  onMove: (lot: LotItem, targetPosition: number) => void;
  onClose: () => void;
}

export const MovePositionModal: React.FC<MovePositionModalProps> = ({
  lot,
  position,
  total,
  onMove,
  onClose,
}) => {
  const [posInput, setPosInput] = useState(String(position));

  useEffect(() => {
    setPosInput(String(position));
  }, [lot.id, position]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const parsed = Number(posInput);
  const canSubmit =
    Boolean(posInput.trim()) &&
    Number.isInteger(parsed) &&
    parsed >= 1 &&
    parsed <= total &&
    parsed !== position;

  return createPortal(
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className="planning-summary-gate fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/35"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Move queue position"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] rounded-2xl bg-base-100 border border-base-300 shadow-2xl overflow-hidden text-base-content tabular-nums"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-base-content">Move Position</h3>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#4f46e5] text-white">
              {lot.gate}
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="btn btn-xs btn-ghost btn-square h-7 w-7 rounded-lg text-base-content/50 hover:text-base-content"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) {
              onClose();
              onMove(lot, parsed);
            }
          }}
        >
          <div className="p-5 flex flex-col gap-4">
            {/* Card Info */}
            <div className="rounded-xl border border-base-200 bg-base-200/40 px-3.5 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold text-base-content truncate">{lot.product}</div>
                <div className="text-[11px] font-mono font-semibold text-base-content/60 mt-0.5">
                  {lot.label} · {dayjs(lot.plannedDate).format("DD/MM/YYYY")}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] font-bold uppercase tracking-wider text-base-content/45">Current</div>
                <div className="text-sm font-extrabold text-base-content">
                  {position} <span className="text-xs font-medium text-base-content/50">/ {total}</span>
                </div>
              </div>
            </div>

            {/* New Position Input */}
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-base-content/55 block mb-1.5">
                New Position (1 – {total})
              </label>
              <input
                type="number"
                min={1}
                max={total}
                value={posInput}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setPosInput(e.target.value)}
                className="w-full h-10 px-3.5 rounded-xl border border-base-300 bg-base-100 text-sm font-bold text-base-content focus:outline-none focus:border-[#4f46e5] focus:ring-2 focus:ring-[#4f46e5]/15"
              />
            </div>

            {/* Quick Jump Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={position === 1}
                onClick={() => {
                  onClose();
                  onMove(lot, 1);
                }}
                className="btn btn-sm h-9 rounded-xl bg-base-200/70 hover:bg-base-200 disabled:opacity-40 border border-base-300 text-base-content text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowUpToLine size={13} />
                <span>Move to Top (1)</span>
              </button>
              <button
                type="button"
                disabled={position === total}
                onClick={() => {
                  onClose();
                  onMove(lot, total);
                }}
                className="btn btn-sm h-9 rounded-xl bg-base-200/70 hover:bg-base-200 disabled:opacity-40 border border-base-300 text-base-content text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowDownToLine size={13} />
                <span>Bottom ({total})</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-base-200 bg-base-200/20 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm h-9 px-4 rounded-xl bg-base-100 border border-base-300 hover:bg-base-200 text-xs font-semibold text-base-content cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-sm h-9 px-4 rounded-xl bg-[#4f46e5] hover:bg-[#4338ca] disabled:bg-base-200 disabled:text-base-content/35 text-white border-none text-xs font-semibold cursor-pointer shadow-xs"
            >
              Move
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
