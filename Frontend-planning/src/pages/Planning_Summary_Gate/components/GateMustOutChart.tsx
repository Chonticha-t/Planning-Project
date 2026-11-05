import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceArea,
} from "recharts";
import type { GateDailyChartData } from "../types";
import { ARRIVAL_GATE_WIDTH, getArrivalMinWidth } from "../arrivalLayout";

interface GateMustOutChartProps {
  gateName: string;
  chartData: GateDailyChartData[];
  selectedDate: string | null;
  onSelectDate: (dateStr: string | null) => void;
}

export const GateMustOutChart: React.FC<GateMustOutChartProps> = ({
  gateName,
  chartData,
  selectedDate,
  onSelectDate,
}) => {
  const selectedBar = chartData.find((item) => item.fullDate === selectedDate);
  const holidayPatternId = `arrival-holiday-${React.useId().replace(/:/g, "")}`;

  const handleBarClick = (data: { activeTooltipIndex?: number | string | null }) => {
    const activeIndex = data?.activeTooltipIndex;
    if (activeIndex == null || activeIndex === "") return;
    const index = Number(activeIndex);
    if (!Number.isInteger(index) || index < 0) return;
    const item = chartData[index];
    if (!item) return;
    onSelectDate(selectedDate === item.fullDate ? null : item.fullDate);
  };

  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-base-100 border border-base-200 shadow-xs">
      {/* Title & Legend Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h4 className="font-bold text-sm tracking-wide text-base-content uppercase">
            Daily Arrival Trend • <span className="text-primary">{gateName}</span>
          </h4>
          {selectedDate && (
            <button
              type="button"
              onClick={() => onSelectDate(null)}
              className="badge badge-primary badge-sm font-bold gap-1 cursor-pointer"
            >
              <span>Selected: {selectedDate}</span>
              <span>✕</span>
            </button>
          )}
        </div>

        {/* Custom Legend */}
        <div className="flex items-center gap-3 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#2563eb]" />
            <span className="text-base-content/80">In gate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#06b6d4]" />
            <span className="text-base-content/80">Coming</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#f97316]" />
            <span className="text-base-content/80">Need WIP</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="w-full mt-1 overflow-x-auto" data-arrival-scroll>
      <div className="h-48 w-full outline-none select-none [&_*]:outline-none [&_*]:focus:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none" style={{ minWidth: getArrivalMinWidth(chartData.length) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            onClick={handleBarClick}
            tabIndex={-1}
            style={{ outline: "none", border: "none" }}
            margin={{ top: 10, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <pattern id={holidayPatternId} width={8} height={8} patternUnits="userSpaceOnUse">
                <rect width={8} height={8} fill="var(--color-base-content, #64748b)" fillOpacity={0.025} />
                <path d="M-2 2L2-2 M0 8L8 0 M6 10L10 6" stroke="var(--color-base-content, #64748b)" strokeOpacity={0.12} strokeWidth={1} />
              </pattern>
            </defs>
            {chartData.filter((day) => day.isHoliday).map((day) => (
              <ReferenceArea
                key={day.fullDate}
                x1={day.dateLabel}
                x2={day.dateLabel}
                fill={`url(#${holidayPatternId})`}
                fillOpacity={1}
                stroke="none"
                zIndex={50}
                pointerEvents="none"
              />
            ))}
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
            <XAxis
              dataKey="dateLabel"
              interval={0}
              height={44}
              padding={{ left: 0, right: 0 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(150, 150, 150, 0.2)" }}
              tick={({ x, y, payload }) => {
                const isHoliday = chartData.some((day) => day.dateLabel === payload.value && day.isHoliday);
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text y={12} textAnchor="middle" fontSize={10} fill="var(--color-base-content, #666)" fillOpacity={isHoliday ? 0.55 : 1}>
                      {payload.value}
                    </text>
                    {isHoliday && (
                      <text y={26} textAnchor="middle" fontSize={9} fontWeight={600} fill="var(--color-base-content, #64748b)" fillOpacity={0.6}>OFF</text>
                    )}
                  </g>
                );
              }}
            />
            <YAxis
              width={ARRIVAL_GATE_WIDTH}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--color-base-content, #666)" }}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload as GateDailyChartData;
                return (
                  <div className="p-2.5 rounded-xl border border-base-300 bg-base-100 shadow-xl text-xs flex flex-col gap-1 min-w-[140px]">
                    <div className="font-bold text-base-content pb-1 border-b border-base-200">
                      {label} ({d.fullDate})
                      {d.isHoliday && <span className="ml-2 text-base-content/60 font-medium">OFF</span>}
                    </div>
                    <div className="flex items-center justify-between text-blue-600">
                      <span>In gate:</span>
                      <strong className="tabular-nums">{d.in_gate} lots</strong>
                    </div>
                    <div className="flex items-center justify-between text-cyan-600">
                      <span>Coming:</span>
                      <strong className="tabular-nums">{d.coming} lots</strong>
                    </div>
                    <div className="flex items-center justify-between text-orange-600">
                      <span>Need WIP:</span>
                      <strong className="tabular-nums">{d.need_wip} lots</strong>
                    </div>
                    <div className="flex items-center justify-between font-black pt-1 border-t border-base-200 text-base-content">
                      <span>Total:</span>
                      <strong className="tabular-nums">{d.total} lots</strong>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="in_gate" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} cursor="pointer">
              {chartData.map((item) => (
                <Cell key={item.fullDate} fillOpacity={!selectedBar || item.fullDate === selectedDate ? 1 : 0.5} style={{ transition: "fill-opacity 160ms ease" }} />
              ))}
            </Bar>
            <Bar dataKey="coming" stackId="a" fill="#06b6d4" radius={[0, 0, 0, 0]} cursor="pointer">
              {chartData.map((item) => (
                <Cell key={item.fullDate} fillOpacity={!selectedBar || item.fullDate === selectedDate ? 1 : 0.5} style={{ transition: "fill-opacity 160ms ease" }} />
              ))}
            </Bar>
            <Bar dataKey="need_wip" stackId="a" fill="#f97316" radius={[3, 3, 0, 0]} cursor="pointer">
              {chartData.map((item) => (
                <Cell key={item.fullDate} fillOpacity={!selectedBar || item.fullDate === selectedDate ? 1 : 0.5} style={{ transition: "fill-opacity 160ms ease" }} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      </div>
    </div>
  );
};

