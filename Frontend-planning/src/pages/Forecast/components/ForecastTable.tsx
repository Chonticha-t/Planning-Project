import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatQty } from "../utils";
import type {
  TableGroupMode,
  ForecastWeekMeta,
  AggregatedForecastRow,
  ForecastUnit,
} from "../types";

interface ForecastTableProps {
  tableGroupMode: TableGroupMode;
  onGroupModeChange: (mode: TableGroupMode) => void;
  hasExpandedCustomer: boolean;
  onCollapseAll: () => void;
  weeks: ForecastWeekMeta[];
  tableRows: AggregatedForecastRow[];
  customerRows: AggregatedForecastRow[];
  productRows: AggregatedForecastRow[];
  productsByCustomer: Map<string, AggregatedForecastRow[]>;
  expandedCustomers: Set<string>;
  onToggleCustomerExpand: (name: string) => void;
  weekTotals: Record<string, number>;
  grandTotal: number;
  unit: ForecastUnit;
  unitTitleLabel: string;
  weekRangeLabel: string;
  prdTypeDisplay: string;
  loading: boolean;
}

export const ForecastTable: React.FC<ForecastTableProps> = ({
  tableGroupMode,
  onGroupModeChange,
  hasExpandedCustomer,
  onCollapseAll,
  weeks,
  tableRows,
  customerRows,
  productRows,
  productsByCustomer,
  expandedCustomers,
  onToggleCustomerExpand,
  weekTotals,
  grandTotal,
  unit,
  unitTitleLabel,
  weekRangeLabel,
  prdTypeDisplay,
  loading,
}) => {
  return (
    <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-base-content">
            FORECAST TABLE • {tableGroupMode.toUpperCase()} × WEEK
          </h2>
          <div className="inline-flex h-6 items-center bg-base-200/80 p-0.5 rounded-md border border-base-300">
            {(["Customer", "Product"] as TableGroupMode[]).map((mode) => {
              const active = tableGroupMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onGroupModeChange(mode)}
                  className={`px-2.5 h-full rounded text-[11px] font-bold transition-all cursor-pointer ${
                    active
                      ? "bg-[#3b38c8] text-white shadow-2xs"
                      : "text-base-content/65 hover:text-base-content"
                  }`}
                >
                  {mode}
                </button>
              );
            })}
          </div>
          {tableGroupMode === "Customer" && (
            <span className="text-[11px] text-base-content/45">
              (Click customer name to view products)
            </span>
          )}
        </div>

        {hasExpandedCustomer && (
          <button
            type="button"
            onClick={onCollapseAll}
            className="text-[11px] font-semibold text-[#3b38c8] hover:underline cursor-pointer"
          >
            Collapse all
          </button>
        )}
      </div>

      {/* Scrollable Matrix Table */}
      <div className="w-full overflow-x-auto max-h-[520px]">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-base-100">
            <tr className="border-b border-base-300 text-base-content/55">
              <th className="sticky left-0 z-20 bg-base-100 py-2.5 pl-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider min-w-[140px] border-r border-base-200">
                {tableGroupMode.toUpperCase()}
              </th>
              {hasExpandedCustomer && (
                <th className="py-2.5 px-3 text-left text-[10px] font-semibold uppercase tracking-wider min-w-[155px] border-r border-base-200 bg-base-100">
                  PRODUCT
                </th>
              )}
              {weeks.map((week) => (
                <th
                  key={week.code}
                  className={`py-2 px-2.5 text-right min-w-[78px] whitespace-nowrap border-r border-base-200 ${
                    week.isCurrentWeek
                      ? "bg-[#eef3ff] text-[#2563eb] font-extrabold"
                      : "bg-base-100 font-semibold"
                  }`}
                >
                  <div className="flex flex-col items-end justify-end leading-tight">
                    {week.isCurrentWeek && (
                      <span className="text-[9px] uppercase text-[#2563eb] font-extrabold">
                        THIS WEEK
                      </span>
                    )}
                    <span
                      className={`text-[11px] ${
                        week.isCurrentWeek
                          ? "text-[#1d4ed8] font-extrabold"
                          : "text-base-content/75 font-bold"
                      }`}
                    >
                      {week.code}
                    </span>
                  </div>
                </th>
              ))}
              <th className="sticky right-0 z-20 bg-base-100 py-2.5 pl-4 pr-2 text-right text-[11px] font-extrabold text-base-content min-w-[95px] border-l border-base-300">
                Total
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-base-200/70">
            {tableRows.length === 0 ? (
              <tr>
                <td
                  colSpan={weeks.length + (hasExpandedCustomer ? 3 : 2)}
                  className="py-10 text-center text-xs text-base-content/35"
                >
                  {loading
                    ? "Loading forecast data..."
                    : "No forecast data available"}
                </td>
              </tr>
            ) : tableGroupMode === "Customer" ? (
              customerRows.map((row) => {
                const isExpanded = expandedCustomers.has(row.name);
                const custProducts = productsByCustomer.get(row.name) || [];

                if (isExpanded && custProducts.length > 0) {
                  return (
                    <React.Fragment key={row.id}>
                      {custProducts.map((prd, pIdx) => (
                        <tr
                          key={prd.id}
                          className="hover:bg-base-200/30 transition-colors border-b border-base-200/70"
                        >
                          {pIdx === 0 && (
                            <td
                              rowSpan={custProducts.length}
                              onClick={() => onToggleCustomerExpand(row.name)}
                              className="sticky left-0 z-10 bg-base-100 align-top py-2.5 pl-2 pr-4 font-extrabold text-base-content whitespace-nowrap border-r border-base-300 cursor-pointer hover:bg-base-200/40 select-none"
                              title="Click to collapse"
                            >
                              <div className="flex items-center gap-1.5">
                                <ChevronDown
                                  size={13}
                                  className="text-base-content/60 shrink-0"
                                />
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: row.color }}
                                />
                                <span>{row.name}</span>
                              </div>
                            </td>
                          )}

                          <td className="py-2 px-3 font-semibold text-base-content whitespace-nowrap border-r border-base-200 bg-base-100">
                            {prd.name}
                          </td>

                          {weeks.map((week) => {
                            const val = prd.weekly[week.code] || 0;
                            return (
                              <td
                                key={week.code}
                                className={`py-2 px-2.5 text-right tabular-nums whitespace-nowrap border-r border-base-200 ${
                                  week.isCurrentWeek
                                    ? "bg-[#eef3ff] font-extrabold text-[#1d4ed8]"
                                    : val > 0
                                      ? "text-base-content/80 font-medium"
                                      : "text-base-content/30"
                                }`}
                              >
                                {formatQty(val, unit)}
                              </td>
                            );
                          })}

                          <td className="sticky right-0 z-10 bg-base-100 py-2 pl-4 pr-2 text-right font-extrabold text-base-content tabular-nums whitespace-nowrap border-l border-base-300">
                            {formatQty(prd.rowTotal, unit)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                }

                return (
                  <tr
                    key={row.id}
                    onClick={() => onToggleCustomerExpand(row.name)}
                    className="hover:bg-base-200/40 transition-colors cursor-pointer"
                    title="Click to view products"
                  >
                    <td className="sticky left-0 z-10 bg-base-100 py-2.5 pl-2 pr-4 font-bold text-base-content whitespace-nowrap border-r border-base-200">
                      <div className="flex items-center gap-1.5">
                        <ChevronRight
                          size={13}
                          className="text-base-content/45 shrink-0"
                        />
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span>{row.name}</span>
                      </div>
                    </td>

                    {hasExpandedCustomer && (
                      <td className="py-2.5 px-3 text-base-content/45 text-[11px] whitespace-nowrap border-r border-base-200">
                        {custProducts.length} products
                      </td>
                    )}

                    {weeks.map((week) => {
                      const val = row.weekly[week.code] || 0;
                      return (
                        <td
                          key={week.code}
                          className={`py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap border-r border-base-200 ${
                            week.isCurrentWeek
                              ? "bg-[#eef3ff] font-extrabold text-[#1d4ed8]"
                              : val > 0
                                ? "text-base-content/80 font-medium"
                                : "text-base-content/30"
                          }`}
                        >
                          {formatQty(val, unit)}
                        </td>
                      );
                    })}

                    <td className="sticky right-0 z-10 bg-base-100 py-2.5 pl-4 pr-2 text-right font-extrabold text-base-content tabular-nums whitespace-nowrap border-l border-base-300">
                      {formatQty(row.rowTotal, unit)}
                    </td>
                  </tr>
                );
              })
            ) : (
              productRows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-base-200/30 transition-colors"
                >
                  <td className="sticky left-0 z-10 bg-base-100 py-2.5 pl-2 pr-4 font-bold text-base-content whitespace-nowrap border-r border-base-200">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: row.color }}
                      />
                      <div className="flex flex-col">
                        <span>{row.name}</span>
                        {row.subLabel && (
                          <span className="text-[10px] font-normal text-base-content/50">
                            {row.subLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {weeks.map((week) => {
                    const val = row.weekly[week.code] || 0;
                    return (
                      <td
                        key={week.code}
                        className={`py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap border-r border-base-200 ${
                          week.isCurrentWeek
                            ? "bg-[#eef3ff] font-extrabold text-[#1d4ed8]"
                            : val > 0
                              ? "text-base-content/80 font-medium"
                              : "text-base-content/30"
                        }`}
                      >
                        {formatQty(val, unit)}
                      </td>
                    );
                  })}

                  <td className="sticky right-0 z-10 bg-base-100 py-2.5 pl-4 pr-2 text-right font-extrabold text-base-content tabular-nums whitespace-nowrap border-l border-base-300">
                    {formatQty(row.rowTotal, unit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>

          <tfoot className="sticky bottom-0 z-20 bg-base-100">
            <tr className="border-t-2 border-base-300 font-extrabold text-base-content">
              <td
                colSpan={hasExpandedCustomer ? 2 : 1}
                className="sticky left-0 z-20 bg-base-100 py-3 pl-2 pr-4 border-r border-base-200"
              >
                Total
              </td>
              {weeks.map((week) => {
                const totalVal = weekTotals[week.code] || 0;
                return (
                  <td
                    key={week.code}
                    className={`py-3 px-2.5 text-right tabular-nums whitespace-nowrap border-r border-base-200 ${
                      week.isCurrentWeek
                        ? "bg-[#eef3ff] text-[#3b38c8]"
                        : "bg-base-100"
                    }`}
                  >
                    {formatQty(totalVal, unit)}
                  </td>
                );
              })}
              <td className="sticky right-0 z-20 bg-base-100 py-3 pl-4 pr-2 text-right tabular-nums whitespace-nowrap border-l border-base-300">
                {grandTotal > 0 ? formatQty(grandTotal, unit) : "-"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Table Footer Caption */}
      <div className="flex flex-wrap items-center justify-between text-[11px] text-base-content/45 pt-1">
        <span>
          {unitTitleLabel} · {weekRangeLabel} ({tableRows.length}{" "}
          {tableGroupMode.toLowerCase()}s)
        </span>
        <span>Source: planning.forecast ({prdTypeDisplay})</span>
      </div>
    </div>
  );
};
export default ForecastTable;
