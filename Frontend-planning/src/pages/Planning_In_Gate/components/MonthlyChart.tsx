import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthDay } from "../types";

export interface ChartDay {
  date: string;
  label: string;
  off: boolean;
  phase: MonthDay["phase"];
  ds: number | null;
  ns: number | null;
  planFuture: number | null;
  plan: number | null;
}

interface MonthlyChartProps {
  data: ChartDay[];
  onPick: (date: string, el: Element) => void;
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

export const MonthlyChart: React.FC<MonthlyChartProps> = ({ data, onPick }) => {
  const today = data.find((d) => d.phase === "today" && !d.off);

  // Bar click → open the lot popover anchored to the bar
  const pick = (entry: unknown, _i: number, e: React.MouseEvent) => {
    const date = (entry as { payload?: ChartDay })?.payload?.date;
    if (date) onPick(date, e.target as Element);
  };

  const renderTick = ({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { index?: number } }) => {
    const d = data[payload?.index ?? 0];
    if (!d) return <g />;
    const isToday = d.phase === "today";
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          dy={14}
          textAnchor="middle"
          fontSize={12}
          fontWeight={isToday ? 700 : 400}
          fill={d.off ? "#f87171" : isToday ? "#4f46e5" : "currentColor"}
          opacity={d.off || isToday ? 1 : 0.7}
        >
          {d.label}
        </text>
        {d.off && (
          <text dy={-8} textAnchor="middle" fontSize={9} fill="currentColor" opacity={0.35}>
            OFF
          </text>
        )}
        {isToday && (
          <text dy={28} textAnchor="middle" fontSize={10} fontWeight={700} fill="#4f46e5">
            TODAY
          </text>
        )}
      </g>
    );
  };

  // Total above each actual bar (red when a past day is below plan)
  const rows = data.map((d) => {
    if (d.ds === null) return { ...d, totalOk: null, totalBelow: null };
    const total = d.ds + (d.ns ?? 0);
    const below = d.phase === "past" && d.plan !== null && total < d.plan;
    return { ...d, totalOk: below ? null : total, totalBelow: below ? total : null };
  });
  const label = { position: "top" as const, fontSize: 11, fontWeight: 700, formatter: (v: unknown) => (typeof v === "number" ? compact(v) : "") };

  return (
    <div className="h-[270px] w-full text-base-content">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 20, right: 8, bottom: 14, left: 0 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.1} />
          <XAxis dataKey="label" tick={renderTick} tickLine={false} axisLine={{ stroke: "currentColor", strokeOpacity: 0.2 }} interval={0} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "currentColor", opacity: 0.55 }}
            tickFormatter={compact}
            domain={[0, (max: number) => Math.ceil((max * 1.08) / 10) * 10]}
          />
          {today && <ReferenceArea x1={today.label} x2={today.label} fill="#4f46e5" fillOpacity={0.08} stroke="none" />}
          <Bar dataKey="ds" stackId="out" fill="#f5c542" radius={[0, 0, 2, 2]} cursor="pointer" isAnimationActive={false} onClick={pick} />
          <Bar dataKey="ns" stackId="out" fill="#6d4fd8" radius={[3, 3, 0, 0]} cursor="pointer" isAnimationActive={false} onClick={pick}>
            <LabelList dataKey="totalOk" fill="currentColor" {...label} />
            <LabelList dataKey="totalBelow" fill="#e11d48" {...label} />
          </Bar>
          <Bar
            dataKey="planFuture"
            stackId="out"
            fill="currentColor"
            fillOpacity={0.03}
            stroke="currentColor"
            strokeOpacity={0.3}
            strokeDasharray="4 3"
            cursor="pointer"
            isAnimationActive={false}
            onClick={pick}
          />
          <Line
            dataKey="plan"
            type="linear"
            stroke="#f97316"
            strokeWidth={2}
            dot={{ r: 2.5, fill: "#f97316", strokeWidth: 0 }}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
