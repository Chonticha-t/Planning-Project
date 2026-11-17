import React from "react";
import { formatQty } from "../utils";
import type {
  ForecastWeekMeta,
  ForecastUnit,
  ProcessFilter,
  CustomerMixRow,
} from "../types";

interface ForecastCustomerMixProps {
  weeks: ForecastWeekMeta[];
  unit: ForecastUnit;
  unitTitleLabel: string;
  unitLabelLower: string;
  processFilter: ProcessFilter;
  customerMixRows: CustomerMixRow[];
  grandTotal: number;
  loading: boolean;
  onSelectCustomer: (custName: string) => void;
}

export const ForecastCustomerMix: React.FC<ForecastCustomerMixProps> = ({
  weeks,
  unit,
  unitTitleLabel,
  unitLabelLower,
  processFilter,
  customerMixRows,
  grandTotal,
  loading,
  onSelectCustomer,
}) => {
  return (
    <div className="xl:col-span-3 bg-base-100 border border-base-300 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-base-content">
            CUSTOMER MIX
          </h2>
          <span className="text-[11px] text-base-content/50">
            {weeks.length > 0 ? `${weeks.length} weeks` : "-"} ·{" "}
            {unitTitleLabel}
          </span>
        </div>

        {/* 100% Stacked Horizontal Bar */}
        <div className="w-full h-7 rounded-lg overflow-hidden flex gap-[1px] bg-base-200">
          {customerMixRows.map((row) => {
            const pct =
              grandTotal > 0 ? (row.rowTotal / grandTotal) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={row.id}
                style={{
                  width: `${pct}%`,
                  backgroundColor: row.color,
                }}
                className="h-full flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                title={`${row.name}: ${pct.toFixed(1)}%`}
              >
                {pct >= 11 ? `${Math.round(pct)}%` : ""}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] text-base-content/50 mt-1.5 mb-3">
          <span>
            {processFilter} ·{" "}
            {weeks.length > 0 ? `${weeks.length} weeks` : "-"}
          </span>
          <span>
            {grandTotal > 0
              ? `100% = ${formatQty(grandTotal, unit)} ${unitLabelLower}`
              : `- ${unitLabelLower}`}
          </span>
        </div>

        <div className="grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider text-base-content/45 pb-1.5 border-b border-base-200">
          <div className="col-span-6">CUSTOMER</div>
          <div className="col-span-3 text-right">{unit.toUpperCase()}</div>
          <div className="col-span-3 text-right">SHARE</div>
        </div>

        {customerMixRows.length === 0 ? (
          <div className="py-12 text-center text-xs text-base-content/35">
            {loading ? "Loading..." : "No customer data"}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-base-200/60 max-h-[260px] overflow-y-auto pr-0.5">
            {customerMixRows.map((row) => (
              <div
                key={row.id}
                onClick={() => onSelectCustomer(row.name)}
                className="py-2 flex flex-col gap-1 cursor-pointer hover:bg-base-200/40 rounded px-1 -mx-1 transition-colors"
                title="Click to expand/collapse products in table"
              >
                <div className="grid grid-cols-12 items-center text-xs">
                  <div className="col-span-6 flex items-center gap-1.5 font-bold text-base-content">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="truncate" title={row.name}>
                      {row.name}
                    </span>
                  </div>
                  <div className="col-span-3 text-right text-base-content/70 font-medium tabular-nums">
                    {formatQty(row.rowTotal, unit)}
                  </div>
                  <div className="col-span-3 text-right font-extrabold text-base-content tabular-nums">
                    {row.sharePct.toFixed(1)}%
                  </div>
                </div>
                <div className="w-full h-1 bg-base-200/80 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${row.barWidthPct}%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 items-center pt-2.5 mt-1 border-t border-base-300 text-xs font-extrabold text-base-content">
        <div className="col-span-5">Total</div>
        <div className="col-span-4 text-right tabular-nums">
          {grandTotal > 0 ? formatQty(grandTotal, unit) : "-"}
        </div>
        <div className="col-span-3 text-right tabular-nums">
          {grandTotal > 0 ? "100%" : "-"}
        </div>
      </div>
    </div>
  );
};
export default ForecastCustomerMix;
