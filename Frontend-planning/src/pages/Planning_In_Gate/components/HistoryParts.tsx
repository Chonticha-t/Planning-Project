import React from "react";
import { ArrowDown, ArrowRight, ArrowUp, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { OrderDiff, OrderMove } from "../types";

/** One moved lot: ↑ / ↓  from → to */
export const MoveLine: React.FC<{ move: OrderMove }> = ({ move }) => {
  const up = move.to < move.from;
  return (
    <li className="flex items-center gap-2.5 py-1 tabular-nums">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${
          up ? "bg-[#eef2ff] text-[#4f46e5]" : "bg-base-200 text-base-content/60"
        }`}
        title={up ? "Moved up" : "Moved down"}
      >
        {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <b>{move.lotId}</b>
        {move.product && <span className="text-base-content/60"> · {move.product}</span>}
      </span>
      <span className="text-base-content/50">{move.from}</span>
      <ArrowRight size={12} className="text-base-content/40" />
      <span className={`font-bold ${up ? "text-[#4f46e5]" : ""}`}>{move.to}</span>
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
