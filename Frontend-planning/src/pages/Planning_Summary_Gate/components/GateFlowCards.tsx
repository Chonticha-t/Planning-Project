import React from "react";
import type { GateFlowSummary, GateUnit } from "../types";
import { formatGateQuantity, GATE_UNIT_LABELS } from "../gateUnits";

interface GateFlowCardsProps {
  gateFlowList: GateFlowSummary[];
  selectedGate: string;
  onSelectGate: (gateName: string) => void;
  unit: GateUnit;
}

export const GateFlowCards: React.FC<GateFlowCardsProps> = ({
  gateFlowList,
  selectedGate,
  onSelectGate,
  unit,
}) => {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-base-content/60">Summary for selected arrival period</p>
      {/* Gate Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {gateFlowList.map((g) => {
          const isSelected = selectedGate === g.gate_name;
          const hasHold = g.hold_count > 0;

          return (
            <div key={g.gate_name} className="relative flex items-center">
              {/* Card Container */}
              <div
                onClick={() => onSelectGate(g.gate_name)}
                className={`w-full flex flex-col justify-between p-3.5 rounded-2xl border transition-all cursor-pointer select-none ${
                  isSelected
                    ? "bg-[#316be8] border-[#316be8] text-white shadow-md shadow-blue-600/15"
                    : "bg-base-100 border-base-300/80 hover:border-base-300 hover:shadow-xs hover:bg-base-200/30"
                }`}
              >
                {/* Top: Gate Title & Hold Badge */}
                <div className="flex items-center justify-between gap-1 mb-1.5">
                  <h4
                    className={`font-semibold text-[15px] tracking-normal ${
                      isSelected ? "text-white" : "text-base-content"
                    }`}
                  >
                    {g.gate_name}
                  </h4>
                  {hasHold && (
                    <span
                      className={`badge badge-xs font-bold px-2 py-0.5 text-[10px] shadow-2xs border-0 ${
                        isSelected
                          ? "bg-amber-300 text-slate-900"
                          : "bg-amber-600 text-white"
                      }`}
                    >
                      {g.hold_count} hold
                    </span>
                  )}
                </div>

                {/* Primary Stats: In Gate & Coming */}
                <div className="flex flex-col gap-0.5">
                  <div
                    className={`flex flex-wrap items-baseline gap-1.5 text-xs ${
                      isSelected ? "text-blue-100" : "text-base-content/80"
                    }`}
                  >
                    <span
                      className={`font-bold text-sm tabular-nums ${
                        isSelected ? "text-white" : "text-base-content"
                      }`}
                    >
                      {formatGateQuantity(g.quantities.in_gate[unit], unit)}
                    </span>
                    <span className="text-[11.5px]">{GATE_UNIT_LABELS[unit]} in gate</span>
                    <span
                      className="inline-flex flex-col pl-1"
                      title="Coming within the selected planned-arrival period."
                    >
                      <span className="inline-flex items-baseline gap-1.5">
                        <span
                          className={`font-semibold tabular-nums ${
                            isSelected ? "text-white" : "text-primary"
                          }`}
                        >
                          {formatGateQuantity(g.quantities.coming[unit], unit)}
                        </span>
                        <span
                          className={`text-[11px] ${
                            isSelected ? "text-blue-100/90" : "text-base-content/60"
                          }`}
                        >
                          {GATE_UNIT_LABELS[unit]} coming
                        </span>
                      </span>
                    </span>
                  </div>

                  <div
                    className={`text-[11.5px] flex items-center gap-1 ${
                      isSelected ? "text-blue-100/95" : "text-base-content/60"
                    }`}
                  >
                    <span className="font-semibold tabular-nums">
                      {g.in_gate_count.toLocaleString()} actual lots
                    </span>
                    {g.need_wip_count > 0 && (
                      <>
                        <span>•</span>
                        <span
                          className={`font-bold ${
                            isSelected ? "text-amber-200" : "text-amber-600"
                          }`}
                        >
                          {unit === "lot" ? `${g.need_wip_count} Need WIP requests` : `${formatGateQuantity(g.quantities.need_wip[unit], unit)} ${GATE_UNIT_LABELS[unit]} Need WIP`}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {g.quantities.unidentifiedCount > 0 && <p className="mt-1 text-[10px] opacity-80">Some rows have no lot number and are excluded from actual lots.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
