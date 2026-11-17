import React, { useRef, useState, useEffect, useMemo } from "react";
import { formatQty, formatAxisTick } from "../utils";
import type {
  ProcessFilter,
  ForecastUnit,
  ChartGroupMode,
  ForecastWeekMeta,
  AggregatedForecastRow,
} from "../types";

interface ForecastChartProps {
  processFilter: ProcessFilter;
  unit: ForecastUnit;
  unitTitleLabel: string;
  unitLabelLower: string;
  chartGroupMode: ChartGroupMode;
  onGroupModeChange: (mode: ChartGroupMode) => void;
  chartSeriesRows: AggregatedForecastRow[];
  weeks: ForecastWeekMeta[];
  weekTotals: Record<string, number>;
  hoveredWeek: string | null;
  onHoverWeek: (week: string | null) => void;
  loading: boolean;
}

export const ForecastChart: React.FC<ForecastChartProps> = ({
  processFilter,
  unit,
  unitTitleLabel,
  unitLabelLower,
  chartGroupMode,
  onGroupModeChange,
  chartSeriesRows,
  weeks,
  weekTotals,
  hoveredWeek,
  onHoverWeek,
  loading,
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState<{ width: number; height: number }>({
    width: 1100,
    height: 340,
  });

  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setChartSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Chart SVG dimensions & nice Y-axis scale
  const chartMaxY = useMemo(() => {
    const rawMax = Math.max(
      0,
      ...weeks.map((w) => weekTotals[w.code] || 0)
    );
    if (rawMax <= 0) return unit === "Lot" ? 100 : 600000;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const normalized = rawMax / magnitude;
    let niceNormalized = 1;
    if (normalized <= 1.2) niceNormalized = 1.2;
    else if (normalized <= 1.5) niceNormalized = 1.5;
    else if (normalized <= 2) niceNormalized = 2;
    else if (normalized <= 3) niceNormalized = 3;
    else if (normalized <= 4) niceNormalized = 4;
    else if (normalized <= 5) niceNormalized = 5;
    else if (normalized <= 6) niceNormalized = 6;
    else if (normalized <= 8) niceNormalized = 8;
    else niceNormalized = 10;
    return niceNormalized * magnitude;
  }, [weekTotals, weeks, unit]);

  const yTicks = useMemo(() => {
    return [
      chartMaxY,
      chartMaxY * 0.75,
      chartMaxY * 0.5,
      chartMaxY * 0.25,
      0,
    ];
  }, [chartMaxY]);

  const svgWidth = Math.max(600, chartSize.width);
  const svgHeight = Math.max(300, chartSize.height);
  const padLeft = 42;
  const padRight = 6;
  const padTop = 10;
  const padBottom = 34;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;
  const colCount = Math.max(1, weeks.length);
  const colWidth = plotWidth / colCount;
  const barWidth = Math.max(14, Math.min(38, colWidth * 0.68));

  return (
    <div className="xl:col-span-9 bg-base-100 border border-base-300 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
      {/* Chart Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-base-content">
            FORECAST BY WEEK • {processFilter}
          </h2>
          <span className="text-xs text-base-content/50">
            {unitTitleLabel}
          </span>
          <div className="inline-flex h-6 items-center bg-base-200/80 p-0.5 rounded-md border border-base-300 ml-1">
            {(["Customer", "Product"] as ChartGroupMode[]).map((mode) => {
              const active = chartGroupMode === mode;
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
        </div>

        {/* Chart Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-base-content/75">
          {chartSeriesRows.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
            </span>
          ))}
        </div>
      </div>

      {/* SVG Stacked Bar Chart */}
      <div
        ref={chartContainerRef}
        className="relative flex-1 w-full min-h-[340px]"
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full block overflow-visible"
        >
          {/* Horizontal Grid Lines & Y-Axis Labels */}
          {yTicks.map((tickVal, idx) => {
            const y =
              padTop +
              plotHeight -
              (tickVal / chartMaxY) * plotHeight;
            return (
              <g key={idx}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-base-300/70"
                  strokeDasharray={tickVal === 0 ? undefined : "3 3"}
                  strokeWidth={1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-base-content/45 text-[10px] font-medium"
                >
                  {formatAxisTick(tickVal)}
                </text>
              </g>
            );
          })}

          {/* Empty / Loading state text */}
          {weeks.length === 0 && (
            <text
              x={padLeft + plotWidth / 2}
              y={padTop + plotHeight / 2}
              textAnchor="middle"
              className="fill-base-content/35 text-xs font-medium"
            >
              {loading ? "Loading forecast data..." : "No forecast data available"}
            </text>
          )}

          {/* Columns & Stacked Bars */}
          {weeks.map((week, idx) => {
            const colX = padLeft + idx * colWidth;
            const barX = colX + (colWidth - barWidth) / 2;

            const segments = chartSeriesRows
              .map((r) => ({
                key: r.id,
                label: r.name,
                val: r.weekly[week.code] || 0,
                color: r.color,
              }))
              .filter((s) => s.val > 0);

            let currentTopY = padTop + plotHeight;

            return (
              <g
                key={week.code}
                onMouseEnter={() => onHoverWeek(week.code)}
                onMouseLeave={() => onHoverWeek(null)}
                className="cursor-pointer"
              >
                {week.isCurrentWeek && (
                  <rect
                    x={colX + 1}
                    y={padTop}
                    width={colWidth - 2}
                    height={plotHeight + 34}
                    rx={4}
                    fill="#eef3ff"
                  />
                )}

                {hoveredWeek === week.code && !week.isCurrentWeek && (
                  <rect
                    x={colX + 2}
                    y={padTop}
                    width={colWidth - 4}
                    height={plotHeight}
                    rx={4}
                    className="fill-base-content/5"
                  />
                )}

                {segments.map((seg, sIdx) => {
                  const segH = Math.max(
                    0,
                    (seg.val / chartMaxY) * plotHeight
                  );
                  currentTopY -= segH;
                  const isTopSegment = sIdx === segments.length - 1;
                  return (
                    <rect
                      key={seg.key}
                      x={barX}
                      y={currentTopY}
                      width={barWidth}
                      height={Math.max(0, segH)}
                      fill={seg.color}
                      rx={isTopSegment ? 2.5 : 0}
                    />
                  );
                })}

                <text
                  x={colX + colWidth / 2}
                  y={padTop + plotHeight + 16}
                  textAnchor="middle"
                  className={`text-[10px] ${
                    week.isCurrentWeek
                      ? "fill-[#2563eb] font-extrabold"
                      : "fill-base-content/55 font-medium"
                  }`}
                >
                  {week.code}
                </text>

                {week.isCurrentWeek && (
                  <text
                    x={colX + colWidth / 2}
                    y={padTop + plotHeight + 28}
                    textAnchor="middle"
                    className="fill-[#2563eb] text-[8.5px] font-extrabold tracking-tight"
                  >
                    THIS WEEK
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hoveredWeek && (
          <div className="pointer-events-none absolute top-2 right-4 bg-base-100/95 backdrop-blur-xs border border-base-300 rounded-xl px-3 py-2.5 shadow-md text-xs z-10 min-w-[190px]">
            <div className="flex items-center justify-between font-bold text-base-content border-b border-base-200 pb-1 mb-1.5 gap-3">
              <span>{hoveredWeek}</span>
              <span className="text-[#1d4ed8] tabular-nums">
                {formatQty(weekTotals[hoveredWeek] || 0, unit)}{" "}
                {unitLabelLower}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {chartSeriesRows.map((s) => {
                const v = s.weekly[hoveredWeek] || 0;
                if (v <= 0) return null;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="inline-flex items-center gap-1.5 text-base-content/75 truncate max-w-[110px]">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {formatQty(v, unit)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default ForecastChart;
