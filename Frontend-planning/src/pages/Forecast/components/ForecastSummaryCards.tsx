import React from "react";
import { formatQty } from "../utils";
import type { ForecastKpiStats, ForecastUnit } from "../types";

interface ForecastSummaryCardsProps {
  kpiStats: ForecastKpiStats;
  lastUpdated: { date: string; time: string };
  unit: ForecastUnit;
  unitLabelLower: string;
  weekRangeLabel: string;
  prdTypeDisplay: string;
}

export const ForecastSummaryCards: React.FC<ForecastSummaryCardsProps> = ({
  kpiStats,
  lastUpdated,
  unit,
  unitLabelLower,
  weekRangeLabel,
  prdTypeDisplay,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total forecast */}
        <div className="rounded-xl p-4 bg-gradient-to-br from-[#1d5bd6] to-[#2563eb] text-white shadow-sm flex flex-col justify-between min-h-[96px]">
          <span className="text-xs font-medium text-white/85">
            Total forecast
          </span>
          <div className="text-2xl font-extrabold tracking-tight my-0.5 tabular-nums">
            {kpiStats.total > 0 ? formatQty(kpiStats.total, unit) : "-"}
          </div>
          <span className="text-[11px] text-white/80">
            {unitLabelLower} · {weekRangeLabel}
          </span>
        </div>

        {/* Card 2: Average / week */}
        <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
          <span className="text-xs font-medium text-base-content/60">
            Average / week
          </span>
          <div className="text-xl font-extrabold text-base-content my-0.5 tabular-nums">
            {kpiStats.avgPerWeek > 0
              ? formatQty(kpiStats.avgPerWeek, unit)
              : "-"}
          </div>
          <span className="text-[11px] text-base-content/50">
            {kpiStats.total > 0 ? kpiStats.secondaryTotalLabel : `- ${unitLabelLower}`}
          </span>
        </div>

        {/* Card 3: Peak week */}
        <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
          <span className="text-xs font-medium text-base-content/60">
            Peak week
          </span>
          <div className="text-xl font-extrabold text-base-content my-0.5">
            {kpiStats.peakWeekCode}
          </div>
          <span className="text-[11px] text-base-content/50 tabular-nums">
            {kpiStats.peakWeekVal > 0
              ? `${formatQty(kpiStats.peakWeekVal, unit)} ${unitLabelLower}`
              : `- ${unitLabelLower}`}
          </span>
        </div>

        {/* Card 4: Last update date */}
        <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
          <span className="text-xs font-medium text-base-content/60">
            Last update date
          </span>
          <div className="text-xl font-extrabold text-base-content my-0.5">
            {lastUpdated.date}
          </div>
          <span className="text-[11px] text-base-content/50">
            {lastUpdated.time
              ? `${lastUpdated.time} · ${prdTypeDisplay}`
              : prdTypeDisplay}
          </span>
        </div>

        {/* Card 5: Customers / Products */}
        <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
          <span className="text-xs font-medium text-base-content/60">
            Customers / Products
          </span>
          <div className="text-xl font-extrabold text-base-content my-0.5 tabular-nums">
            {kpiStats.customerCount > 0 || kpiStats.productCount > 0
              ? `${kpiStats.customerCount} / ${kpiStats.productCount}`
              : "- / -"}
          </div>
          <span className="text-[11px] text-base-content/50">
            in {prdTypeDisplay}
          </span>
        </div>
      </div>
  );
};
export default ForecastSummaryCards;
