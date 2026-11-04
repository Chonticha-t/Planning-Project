import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { GateDailyChartData } from "../types";

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
  const handleBarClick = (data: any) => {
    if (!data || !data.activePayload || !data.activePayload[0]) return;
    const item = data.activePayload[0].payload as GateDailyChartData;
    if (selectedDate === item.fullDate) {
      onSelectDate(null); // Toggle off if clicked again
    } else {
      onSelectDate(item.fullDate);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-base-100 border border-base-200 shadow-xs">
      {/* Title & Legend Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h4 className="font-bold text-sm tracking-wide text-base-content uppercase">
            Daily Must-Out Trend • <span className="text-primary">{gateName}</span>
          </h4>
          <span className="text-xs text-base-content/50">
            Click bar to inspect lots for that day
          </span>
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
      <div className="h-48 w-full mt-1 outline-none select-none [&_*]:outline-none [&_*]:focus:outline-none [&_.recharts-wrapper]:outline-none [&_.recharts-surface]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            onClick={handleBarClick}
            tabIndex={-1}
            style={{ outline: "none", border: "none" }}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
            <XAxis
              dataKey="dateLabel"
              tickLine={false}
              axisLine={{ stroke: "rgba(150, 150, 150, 0.2)" }}
              tick={{ fontSize: 10, fill: "var(--color-base-content, #666)" }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--color-base-content, #666)" }}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0].payload as GateDailyChartData;
                return (
                  <div className="p-2.5 rounded-xl border border-base-300 bg-base-100 shadow-xl text-xs flex flex-col gap-1 min-w-[140px]">
                    <div className="font-bold text-base-content pb-1 border-b border-base-200">
                      {label} ({d.fullDate})
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
            <Bar dataKey="in_gate" stackId="a" fill="#2563eb" radius={[0, 0, 0, 0]} cursor="pointer" />
            <Bar dataKey="coming" stackId="a" fill="#06b6d4" radius={[0, 0, 0, 0]} cursor="pointer" />
            <Bar dataKey="need_wip" stackId="a" fill="#f97316" radius={[3, 3, 0, 0]} cursor="pointer" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

