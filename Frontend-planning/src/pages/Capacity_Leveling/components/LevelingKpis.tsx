import React from "react";
import type { LevelingKpiData } from "../types";

interface LevelingKpisProps {
  kpis: LevelingKpiData;
}

export const LevelingKpis: React.FC<LevelingKpisProps> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. Red cells in planning zone */}
      <div className="flex flex-col justify-between p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
        <span className="text-xs font-semibold text-base-content/60">
          Red cells in planning zone
        </span>
        <div className="flex items-baseline gap-2 my-1.5 tabular-nums">
          <span className="text-2xl font-bold text-base-content/40 leading-none">
            {kpis.redCellsPlanningBefore}
          </span>
          <span
            className={`text-lg font-semibold leading-none ${
              kpis.redCellsPlanningAfter > 0
                ? "text-amber-600"
                : "text-emerald-600"
            }`}
          >
            →
          </span>
          <span
            className={`text-2xl font-bold leading-none ${
              kpis.redCellsPlanningAfter > 0
                ? "text-amber-600"
                : "text-emerald-600"
            }`}
          >
            {kpis.redCellsPlanningAfter}
          </span>
        </div>
        <div className="text-xs text-base-content/60 truncate">
          {kpis.redCellPlanningDetail}
        </div>
      </div>

      {/* 2. POs at risk */}
      <div className="flex flex-col justify-between p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
        <span className="text-xs font-semibold text-base-content/60">
          POs at risk
        </span>
        <div className="flex items-baseline gap-2 my-1.5 tabular-nums">
          <span className="text-2xl font-bold text-base-content/40 leading-none">
            {kpis.posAtRiskBefore}
          </span>
          <span
            className={`text-lg font-semibold leading-none ${
              kpis.posAtRiskAfter > 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            →
          </span>
          <span
            className={`text-2xl font-bold leading-none ${
              kpis.posAtRiskAfter > 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {kpis.posAtRiskAfter}
          </span>
        </div>
        <div className="text-xs text-base-content/60 truncate">
          {kpis.posAtRiskDetail}
        </div>
      </div>

      {/* 3. Releases moved */}
      <div className="flex flex-col justify-between p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
        <span className="text-xs font-semibold text-base-content/60">
          Releases moved
        </span>
        <div className="flex items-baseline gap-1.5 my-1.5 tabular-nums">
          <span className="text-2xl font-bold text-base-content leading-none">
            {kpis.releasesMovedCount}
          </span>
          <span className="text-xs font-medium text-base-content/60 leading-none">
            of {kpis.releasesTotalCount} new lots
          </span>
        </div>
        <div className="text-xs text-base-content/60 tabular-nums">
          {kpis.releasesMovedEarlier} earlier · {kpis.releasesMovedLater} later
        </div>
      </div>

      {/* 4. Week 1 (production zone) */}
      <div className="flex flex-col justify-between p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
        <span className="text-xs font-semibold text-base-content/60">
          Week 1 (production zone)
        </span>
        <div className="flex items-baseline gap-2 my-1.5 tabular-nums">
          <span className="text-2xl font-bold text-base-content/60 leading-none">
            {kpis.week1RedCells} red
          </span>
        </div>
        <div className="text-xs text-base-content/50">
          Info only · on In Gate
        </div>
      </div>
    </div>
  );
};
