import React from "react";
import { ArrowRight, ArrowDown, ArrowUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { InGateLot } from "../types";

const MAX_LISTED = 5;

interface MoveSummaryProps {
  lot: InGateLot;
  from: number; // 0-based
  to: number; // 0-based
  shifted: InGateLot[]; // lots between old and new position, in their current order
  nowFit: InGateLot[]; // below the red line before, fit today after
  pushedOut: InGateLot[]; // fit today before, below the red line after
}

/** Body of the "Move lot up / down?" confirm dialog */
export const MoveSummary: React.FC<MoveSummaryProps> = ({
  lot,
  from,
  to,
  shifted,
  nowFit,
  pushedOut,
}) => {
  const movingUp = to < from;
  // Moving up → the others go down one place; moving down → the others go up one place
  const firstOldPos = movingUp ? to : from + 1;
  const delta = movingUp ? 1 : -1;
  const listed = shifted.slice(0, MAX_LISTED);
  const hidden = shifted.length - listed.length;
  const ShiftIcon = movingUp ? ArrowDown : ArrowUp;
  const shiftWord = movingUp ? "down" : "up";

  return (
    <div className="mt-2 space-y-3 text-sm text-base-content">
      {/* Moving lot: old → new position */}
      <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-[#eef2ff]/60 p-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold">{lot.id}</div>
          <div className="text-xs text-base-content/60 tabular-nums">
            {lot.product} · {lot.qty.toLocaleString()} pcs · {lot.sheet.toLocaleString()} sheet
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 tabular-nums">
          <span className="rounded-lg bg-base-200 px-2.5 py-1 font-bold text-base-content/60">{from + 1}</span>
          <ArrowRight size={16} className="text-[#4f46e5]" />
          <span className="rounded-lg bg-[#4f46e5] px-2.5 py-1 font-bold text-white">{to + 1}</span>
        </div>
      </div>

      {/* Lots that shift the other way */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-base-content/60">
          <ShiftIcon size={13} />
          {shifted.length === 1
            ? `1 lot moves ${shiftWord} one place`
            : `${shifted.length} lots move ${shiftWord} one place`}
        </div>
        <ul className="divide-y divide-base-200 rounded-xl border border-base-300">
          {listed.map((l, i) => {
            const oldPos = firstOldPos + i + 1;
            return (
              <li key={l.id} className="flex items-center gap-3 px-3 py-1.5 tabular-nums">
                <span className="flex-1 min-w-0 truncate">
                  <b>{l.id}</b> <span className="text-base-content/60">· {l.product}</span>
                </span>
                <span className="text-base-content/50">{oldPos}</span>
                <ArrowRight size={12} className="text-base-content/40" />
                <span className="font-semibold">{oldPos + delta}</span>
              </li>
            );
          })}
          {hidden > 0 && (
            <li className="px-3 py-1.5 text-xs text-base-content/50">+ {hidden} more lots</li>
          )}
        </ul>
      </div>

      {/* Capacity effect */}
      {nowFit.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>{nowFit.map((l) => l.id).join(", ")}</b> {nowFit.length === 1 ? "now fits" : "now fit"} today&apos;s
            capacity.
          </span>
        </div>
      )}
      {pushedOut.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-rose-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b>{pushedOut.map((l) => l.id).join(", ")}</b>{" "}
            {pushedOut.length === 1 ? "no longer fits" : "no longer fit"} today → next day / OT.
          </span>
        </div>
      )}
    </div>
  );
};
