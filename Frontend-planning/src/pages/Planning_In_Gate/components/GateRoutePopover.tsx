import React from "react";
import { Check, X } from "lucide-react";
import type { InGateGate, InGateLot } from "../types";

interface GateRoutePopoverProps {
  lot: InGateLot;
  currentGate: InGateGate;
  routeGates: InGateGate[];
  onClose: () => void;
}

export const GateRoutePopover: React.FC<GateRoutePopoverProps> = ({
  lot,
  currentGate,
  routeGates,
  onClose,
}) => {
  const currentIdx = Math.max(
    0,
    routeGates.findIndex((g) => g.id === currentGate.id)
  );
  const steps = lot.gateSteps ?? [];
  const stepTotal = lot.stepTotal ?? Math.max(1, steps.length);
  const stepNow = Math.min(stepTotal, Math.max(1, lot.stepNow ?? 1));

  const fromGate = lot.fromGate ?? currentGate.name;
  const toGate = lot.nextGate ?? "FG Ship";

  return (
    <div
      role="dialog"
      aria-label={`Gate route for ${lot.id}`}
      onClick={(e) => e.stopPropagation()}
      className="w-[340px] sm:w-[360px] rounded-2xl border border-base-300 bg-base-100 p-4 text-left text-base-content shadow-[0_18px_45px_-10px_rgba(15,23,42,0.24)] ring-1 ring-slate-900/5"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/55">
          LOT {lot.id} · {lot.product}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gate route"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-base-content/50 hover:bg-base-200 hover:text-base-content cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* 5-Gate horizontal route bar */}
      <div className="mt-2.5 rounded-xl border border-base-200 bg-base-200/30 px-3 py-2.5">
        <div className="relative flex items-center justify-between">
          <div className="absolute left-4 right-4 top-[7px] h-[2px] bg-base-300" />
          {currentIdx > 0 && (
            <div
              className="absolute left-4 top-[7px] h-[2px] bg-[#316be8]/60 transition-all"
              style={{
                width: `${(currentIdx / Math.max(1, routeGates.length - 1)) * 88}%`,
              }}
            />
          )}

          {routeGates.map((g, i) => {
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            const isNext = i === currentIdx + 1;
            return (
              <div
                key={g.id}
                className="relative z-10 flex flex-col items-center"
              >
                <div className="flex h-4 items-center justify-center">
                  {isDone ? (
                    <span className="h-3 w-3 rounded-full bg-[#316be8]/65 ring-2 ring-base-100" />
                  ) : isCurrent ? (
                    <span className="h-3.5 w-3.5 rounded-full bg-[#316be8] ring-4 ring-blue-200" />
                  ) : isNext ? (
                    <span className="h-3 w-3 rounded-full border-2 border-[#316be8] bg-base-100 ring-2 ring-base-100" />
                  ) : (
                    <span className="h-3 w-3 rounded-full bg-base-300 ring-2 ring-base-100" />
                  )}
                </div>
                <span
                  className={`mt-1 text-[11px] ${
                    isCurrent
                      ? "font-extrabold text-[#316be8]"
                      : isNext
                        ? "font-bold text-base-content/80"
                        : isDone
                          ? "font-semibold text-base-content/60"
                          : "font-medium text-base-content/40"
                  }`}
                >
                  {g.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sub-process header */}
      <div className="mt-3.5 mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-base-content/55">
        <span>
          PROCESS IN GATE ({fromGate} → {toGate})
        </span>
        <span className="text-[#316be8] tabular-nums">
          {lot.status === "done"
            ? `${stepTotal} / ${stepTotal} DONE`
            : `STEP ${stepNow} OF ${stepTotal}`}
        </span>
      </div>

      {/* Sub-process list (no time labels) */}
      <div className="space-y-1.5">
        {steps.map((s, idx) => {
          const stepNum = idx + 1;
          const isLotDone = lot.status === "done";
          const isCurrentStep = !isLotDone && stepNum === stepNow;
          const isDone = isLotDone || stepNum < stepNow || s.status === "done";
          const isHold = lot.status === "hold" && isCurrentStep;

          return (
            <div
              key={s.code}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors ${
                isCurrentStep
                  ? isHold
                    ? "border border-[#f5c542] bg-[#fef3c7]/70"
                    : "border border-[#316be8]/40 bg-[#e6f0fd]/80 shadow-2xs"
                  : isDone
                    ? "border border-base-200 bg-base-100"
                    : "border border-transparent bg-base-200/25"
              }`}
            >
              {isDone ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#316be8]/20 text-[#316be8]">
                  <Check size={13} strokeWidth={3} />
                </span>
              ) : isCurrentStep ? (
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                    isHold ? "bg-[#d97706]" : "bg-[#316be8]"
                  }`}
                >
                  {stepNum}
                </span>
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-200 text-xs font-bold text-base-content/50">
                  {stepNum}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs leading-tight ${
                      isCurrentStep || isDone
                        ? "font-extrabold text-base-content"
                        : "font-bold text-base-content/55"
                    }`}
                  >
                    {s.code}
                  </span>
                  {isCurrentStep && (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-extrabold uppercase ${
                        isHold
                          ? "bg-[#fdecb3] text-[#8a5a00]"
                          : "bg-[#316be8] text-white"
                      }`}
                    >
                      {isHold ? "HOLD" : "NOW"}
                    </span>
                  )}
                </div>
                <div
                  className={`text-xs leading-tight truncate ${
                    isCurrentStep
                      ? "font-semibold text-base-content/80"
                      : isDone
                        ? "text-base-content/60"
                        : "text-base-content/45"
                  }`}
                >
                  {s.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
