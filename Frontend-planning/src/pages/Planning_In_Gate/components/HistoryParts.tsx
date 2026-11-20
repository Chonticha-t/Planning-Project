import React from "react";
import { ArrowDown, ArrowRight, ArrowUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { OrderDiff, OrderMove } from "../types";

/** One moved lot: ↑ / ↓  from → to */
export const MoveLine: React.FC<{ move: OrderMove }> = ({ move }) => {
  const up = move.to < move.from;
  return (
    <li className="flex items-center justify-between py-1.5 px-1 text-xs tabular-nums hover:bg-base-200/40 rounded transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={`text-xs font-bold shrink-0 ${up ? "text-[#316be8]" : "text-base-content/40"}`}
          title={up ? "Moved up" : "Moved down"}
        >
          {up ? "↑" : "↓"}
        </span>
        <span className="font-semibold text-base-content shrink-0 tabular-nums">
          {move.lotId}
        </span>
        {move.product && (
          <span className="text-base-content/50 text-[11px] truncate">
            · {move.product}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 text-xs">
        <span className="text-base-content/50 font-medium">{move.from}</span>
        <ArrowRight size={11} className="text-base-content/30" />
        <span className={`font-bold ${up ? "text-[#316be8]" : "text-base-content"}`}>{move.to}</span>
      </div>
    </li>
  );
};

/** Capacity effect badges (red line) */
export const CapacityEffect: React.FC<{ diff: Pick<OrderDiff, "pushedOut" | "nowFit"> }> = ({ diff }) => (
  <>
    {diff.pushedOut.length > 0 && (
      <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs text-rose-800">
        <AlertTriangle size={13} className="mt-px shrink-0" />
        <span>
          <b>{diff.pushedOut.join(", ")}</b> {diff.pushedOut.length === 1 ? "no longer fits" : "no longer fit"} today →
          next day / OT
        </span>
      </div>
    )}
    {diff.nowFit.length > 0 && (
      <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
        <CheckCircle2 size={13} className="mt-px shrink-0" />
        <span>
          <b>{diff.nowFit.join(", ")}</b> {diff.nowFit.length === 1 ? "now fits" : "now fit"} today
        </span>
      </div>
    )}
  </>
);
