import React from "react";
import { ChevronRight } from "lucide-react";
import type { GateKpiSummary } from "../types";

interface GateFlowCardsProps {
  gateFlowList: GateKpiSummary[];
  selectedGate: string;
  onSelectGate: (gateName: string) => void;
}

export const GateFlowCards: React.FC<GateFlowCardsProps> = ({
  gateFlowList,
  selectedGate,
  onSelectGate,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">
          Gate WIP Overview
        </h3>
      </div>

      {/* Connected Gate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {gateFlowList.map((g, idx) => {
          const isSelected = selectedGate === g.gate_name;
          const hasHold = g.hold_count > 0;

          return (
            <div key={g.gate_name} className="relative flex items-center">
              {/* Card Container */}
              <div
                onClick={() => onSelectGate(g.gate_name)}
                className={`w-full flex flex-col justify-between p-3.5 rounded-2xl border transition-all cursor-pointer select-none bg-base-100 ${
                  isSelected
                    ? "border-primary ring-2 ring-primary/20 bg-primary/[0.03] shadow-md shadow-primary/5"
                    : "border-base-300/80 hover:border-base-300 hover:shadow-xs hover:bg-base-200/30"
                }`}
              >
                {/* Top: Gate Title & Hold Badge */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <h4 className="font-semibold text-[15px] text-base-content tracking-normal">
                    {g.gate_name}
                  </h4>
                  {hasHold && (
                    <span className="badge badge-xs bg-amber-600 text-white font-bold px-2 py-0.5 text-[10px] shadow-2xs">
                      {g.hold_count} hold
                    </span>
                  )}
                </div>

                {/* Primary Stats: In Gate & Coming */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-baseline gap-1.5 text-xs text-base-content/80">
                    <span className="font-bold text-sm text-base-content tabular-nums">
                      {g.in_gate_count}
                    </span>
                    <span className="text-[11.5px]">in gate</span>
                    <span className="font-semibold text-primary tabular-nums pl-1">
                      +{g.coming_3d_count}
                    </span>
                    <span className="text-[11px] text-base-content/60">coming (3d)</span>
                  </div>

                  <div className="text-[11.5px] text-base-content/60 flex items-center gap-1">
                    <span className="font-semibold tabular-nums">
                      {g.in_gate_qty.toLocaleString()} pcs
                    </span>
                    {g.need_wip_count > 0 && (
                      <>
                        <span>•</span>
                        <span className="font-bold text-amber-600">
                          {g.need_wip_count} need WIP
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Chevron Arrow to next gate (visible on desktop between cards) */}
              {idx < gateFlowList.length - 1 && (
                <div className="hidden lg:flex absolute -right-2 z-10 p-0.5 rounded-full bg-base-200 text-base-content/40 border border-base-300">
                  <ChevronRight size={12} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
