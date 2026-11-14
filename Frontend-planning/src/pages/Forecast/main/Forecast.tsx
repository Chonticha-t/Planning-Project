import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Calendar,
  Search,
  TrendingUp,
  TrendingDown,
  ChevronDown,
} from "lucide-react";
import type {
  ProcessFilter,
  ForecastUnit,
  ChartGroupMode,
  TableDisplayMode,
  ForecastVersionOption,
  ForecastWeekMeta,
  CustomerForecastRow,
  ProductSeriesItem,
} from "../types";

const Forecast: React.FC = () => {
  // Filter states
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("SMT");
  const [selectedForecast, setSelectedForecast] = useState<string>("");
  const [compareForecast, setCompareForecast] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("ALL");
  const [unit, setUnit] = useState<ForecastUnit>("Pcs");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Section view states
  const [chartGroupMode, setChartGroupMode] = useState<ChartGroupMode>("Customer");
  const [tableMode, setTableMode] = useState<TableDisplayMode>("Forecast");
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);

  // Data states (ready for API integration)
  const [forecastVersions] = useState<ForecastVersionOption[]>([]);
  const [compareVersions] = useState<ForecastVersionOption[]>([]);
  const [weeks] = useState<ForecastWeekMeta[]>([]);
  const [rows] = useState<CustomerForecastRow[]>([]);
  const [productSeries] = useState<ProductSeriesItem[]>([]);
  const [compareLineTotals] = useState<Record<string, number>>({});
  const [totalCustomersCount] = useState<number>(0);
  const [totalProductsCount] = useState<number>(0);

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

  // Filtered rows
  const displayRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (selectedCustomer !== "ALL" && row.name !== selectedCustomer) {
        return false;
      }
      if (q && !row.name.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [rows, selectedCustomer, searchQuery]);

  // Weekly column totals & grand total
  const { weekTotals, compareWeekTotals, grandTotal, compareGrandTotal } =
    useMemo(() => {
      const wTotals: Record<string, number> = {};
      const cTotals: Record<string, number> = {};
      let gTotal = 0;
      let cGrandTotal = 0;

      weeks.forEach(({ code }) => {
        wTotals[code] = 0;
        cTotals[code] = 0;
      });

      displayRows.forEach((row) => {
        weeks.forEach(({ code }) => {
          wTotals[code] += row.weekly[code] || 0;
          cTotals[code] += row.compareWeekly[code] || 0;
        });
        gTotal += row.rowTotal;
        cGrandTotal += row.compareRowTotal;
      });

      return {
        weekTotals: wTotals,
        compareWeekTotals: cTotals,
        grandTotal: gTotal,
        compareGrandTotal: cGrandTotal,
      };
    }, [displayRows, weeks]);

  // KPI calculations
  const kpiStats = useMemo(() => {
    const hasCompare = Boolean(compareForecast) && compareGrandTotal > 0;
    const diff = grandTotal - compareGrandTotal;
    const pct = hasCompare
      ? ((diff / compareGrandTotal) * 100).toFixed(1)
      : null;

    let peakWeekCode = "-";
    let peakWeekVal = 0;
    weeks.forEach(({ code }) => {
      if ((weekTotals[code] || 0) > peakWeekVal) {
        peakWeekVal = weekTotals[code] || 0;
        peakWeekCode = code;
      }
    });

    const versionMeta = forecastVersions.find(
      (v) => v.value === selectedForecast
    );
    const [lastUpdateDate, lastUpdateTime] = versionMeta?.uploadedAt
      ? versionMeta.uploadedAt.split(" ")
      : ["-", ""];

    return {
      total: grandTotal,
      hasCompare,
      diff,
      pct,
      peakWeekCode,
      peakWeekVal,
      lastUpdateDate,
      lastUpdateTime,
      customerCount: totalCustomersCount,
      productCount: totalProductsCount,
    };
  }, [
    grandTotal,
    compareGrandTotal,
    compareForecast,
    weekTotals,
    weeks,
    forecastVersions,
    selectedForecast,
    totalCustomersCount,
    totalProductsCount,
  ]);

  // Customer Mix sorted by share descending
  const customerMixRows = useMemo(() => {
    const sorted = [...displayRows].sort((a, b) => b.rowTotal - a.rowTotal);
    const maxVal = sorted[0]?.rowTotal || 1;
    return sorted.map((r) => {
      const sharePct = grandTotal > 0 ? (r.rowTotal / grandTotal) * 100 : 0;
      const barWidthPct = maxVal > 0 ? (r.rowTotal / maxVal) * 100 : 0;
      return {
        ...r,
        sharePct,
        barWidthPct,
      };
    });
  }, [displayRows, grandTotal]);

  const unitLabelLower = unit === "Pcs" ? "pcs" : "sheets";
  const unitTitleLabel = unit === "Pcs" ? "Piece" : "Sheet";

  const weekRangeLabel = useMemo(() => {
    if (weeks.length === 0) return "-";
    return `${weeks[0].code} – ${weeks[weeks.length - 1].code}`;
  }, [weeks]);

  // Chart SVG dimensions & scales
  const chartMaxY = useMemo(() => {
    const rawMax = Math.max(
      0,
      ...weeks.map((w) => weekTotals[w.code] || 0)
    );
    if (rawMax === 0) return 600000;
    if (unit === "Sheet") {
      return Math.ceil(rawMax / 10000) * 10000;
    }
    return rawMax > 600000 ? Math.ceil(rawMax / 150000) * 150000 : 600000;
  }, [weekTotals, weeks, unit]);

  const yTicks = useMemo(() => {
    return [
      chartMaxY,
      Math.round(chartMaxY * 0.75),
      Math.round(chartMaxY * 0.5),
      Math.round(chartMaxY * 0.25),
      0,
    ];
  }, [chartMaxY]);

  const formatAxisK = (val: number) => {
    if (val === 0) return "0";
    if (val >= 1000) return `${Math.round(val / 1000)}K`;
    return String(val);
  };

  return (
    <div className="relative flex flex-col gap-3.5 w-full pb-6 select-none">
      {/* 1. Top Filter & Control Card */}
      <div className="bg-base-100 border border-base-300 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Process Switcher: ALL | FPC | SMT */}
          <div className="inline-flex h-8 items-center bg-base-200/70 p-0.5 rounded-lg border border-base-300">
            {(["ALL", "FPC", "SMT"] as ProcessFilter[]).map((proc) => {
              const active = processFilter === proc;
              return (
                <button
                  key={proc}
                  type="button"
                  onClick={() => setProcessFilter(proc)}
                  className={`px-3 h-full rounded-md text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? "bg-[#3b38c8] text-white shadow-xs"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  {proc}
                </button>
              );
            })}
          </div>

          {/* Forecast Version Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-base-content/60 font-medium">
              Forecast
            </span>
            <div className="relative">
              <select
                aria-label="Forecast version"
                value={selectedForecast}
                onChange={(e) => setSelectedForecast(e.target.value)}
                className="appearance-none h-8 pl-3 pr-7 rounded-lg text-xs font-semibold bg-[#eef2ff] border border-[#a5b4fc] text-[#1e293b] focus:outline-none cursor-pointer min-w-[120px]"
              >
                {forecastVersions.length === 0 ? (
                  <option value="">-</option>
                ) : (
                  forecastVersions.map((v) => (
                    <option
                      key={v.value}
                      value={v.value}
                      className="bg-base-100 text-base-content"
                    >
                      {v.label}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#4f46e5]"
              />
            </div>
          </div>

          {/* Compare Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-base-content/60 font-medium">
              Compare
            </span>
            <div className="relative">
              <select
                aria-label="Compare forecast version"
                value={compareForecast}
                onChange={(e) => setCompareForecast(e.target.value)}
                className="appearance-none h-8 pl-3 pr-7 rounded-lg text-xs font-medium bg-base-100 border border-base-300 text-base-content focus:outline-none cursor-pointer min-w-[96px]"
              >
                {compareVersions.length === 0 ? (
                  <option value="">-</option>
                ) : (
                  compareVersions.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))
                )}
              </select>
              <ChevronDown
                size={13}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-base-content/60"
              />
            </div>
          </div>

          {/* Customer Selector */}
          <div className="relative">
            <select
              aria-label="Filter by customer"
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="appearance-none h-8 pl-3 pr-8 rounded-lg text-xs font-medium bg-base-100 border border-base-300 text-base-content focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Customers</option>
              {rows.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-base-content/60"
            />
          </div>

          {/* Week Range Pill */}
          <div className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-base-300 bg-base-100 text-xs font-medium text-base-content/80">
            <Calendar size={13} className="text-base-content/50" />
            <span>{weekRangeLabel}</span>
          </div>

          {/* Unit Switcher: Pcs | Sheet */}
          <div className="inline-flex h-8 items-center bg-base-200/70 p-0.5 rounded-lg border border-base-300">
            {(["Pcs", "Sheet"] as ForecastUnit[]).map((u) => {
              const active = unit === u;
              return (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`px-3 h-full rounded-md text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? "bg-[#3b38c8] text-white shadow-xs"
                      : "text-base-content/70 hover:text-base-content"
                  }`}
                >
                  {u}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-[260px]">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Product / Customer"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-base-300 bg-base-100 text-xs text-base-content placeholder:text-base-content/40 focus:outline-none focus:border-indigo-400"
            />
          </div>
        </div>
      </div>

      {/* 2. Summary KPI Section */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-base-content/50 px-0.5">
          Summary for selected forecast
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Total forecast */}
          <div className="rounded-xl p-4 bg-gradient-to-br from-[#1d5bd6] to-[#2563eb] text-white shadow-sm flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-medium text-white/85">
              Total forecast
            </span>
            <div className="text-2xl font-extrabold tracking-tight my-0.5">
              {kpiStats.total > 0 ? kpiStats.total.toLocaleString() : "-"}
            </div>
            <span className="text-[11px] text-white/80">
              {unitLabelLower} · {weekRangeLabel}
            </span>
          </div>

          {/* Card 2: Change vs Compare */}
          <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-medium text-base-content/60">
              Change vs {compareForecast || "-"}
            </span>
            {kpiStats.hasCompare && kpiStats.pct !== null ? (
              <>
                <div
                  className={`flex items-center gap-1.5 text-xl font-extrabold my-0.5 ${
                    kpiStats.diff >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {kpiStats.diff >= 0 ? (
                    <TrendingUp size={18} strokeWidth={2.5} />
                  ) : (
                    <TrendingDown size={18} strokeWidth={2.5} />
                  )}
                  <span>
                    {kpiStats.diff >= 0
                      ? `+${kpiStats.pct}%`
                      : `${kpiStats.pct}%`}
                  </span>
                </div>
                <span className="text-[11px] text-base-content/50">
                  {kpiStats.diff >= 0
                    ? `+${kpiStats.diff.toLocaleString()}`
                    : kpiStats.diff.toLocaleString()}{" "}
                  {unitLabelLower}
                </span>
              </>
            ) : (
              <>
                <div className="text-xl font-extrabold text-base-content my-0.5">
                  -
                </div>
                <span className="text-[11px] text-base-content/50">
                  - {unitLabelLower}
                </span>
              </>
            )}
          </div>

          {/* Card 3: Peak week */}
          <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-medium text-base-content/60">
              Peak week
            </span>
            <div className="text-xl font-extrabold text-base-content my-0.5">
              {kpiStats.peakWeekCode}
            </div>
            <span className="text-[11px] text-base-content/50">
              {kpiStats.peakWeekVal > 0
                ? `${kpiStats.peakWeekVal.toLocaleString()} ${unitLabelLower}`
                : `- ${unitLabelLower}`}
            </span>
          </div>

          {/* Card 4: Last update date */}
          <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-medium text-base-content/60">
              Last update date
            </span>
            <div className="text-xl font-extrabold text-base-content my-0.5">
              {kpiStats.lastUpdateDate}
            </div>
            <span className="text-[11px] text-base-content/50">
              {kpiStats.lastUpdateTime
                ? `${kpiStats.lastUpdateTime} · ${selectedForecast}`
                : "-"}
            </span>
          </div>

          {/* Card 5: Customers / Products */}
          <div className="rounded-xl p-4 bg-base-100 border border-base-300 shadow-xs flex flex-col justify-between min-h-[96px]">
            <span className="text-xs font-medium text-base-content/60">
              Customers / Products
            </span>
            <div className="text-xl font-extrabold text-base-content my-0.5">
              {kpiStats.customerCount > 0 || kpiStats.productCount > 0
                ? `${kpiStats.customerCount} / ${kpiStats.productCount}`
                : "- / -"}
            </div>
            <span className="text-[11px] text-base-content/50">
              {selectedForecast ? `in forecast ${selectedForecast}` : "-"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. Middle Row: Forecast By Week Chart (Left) + Customer Mix (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        {/* Left: FORECAST BY WEEK Chart */}
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
                      onClick={() => setChartGroupMode(mode)}
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
              {chartGroupMode === "Customer"
                ? displayRows.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: r.color }}
                      />
                      {r.name}
                    </span>
                  ))
                : productSeries.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  ))}
              {compareForecast && (
                <span className="inline-flex items-center gap-1.5 text-base-content/60 font-medium">
                  <span className="w-3.5 border-t-2 border-dashed border-slate-500" />
                  {compareForecast}
                </span>
              )}
            </div>
          </div>

          {/* SVG Stacked Bar + Comparison Line Chart */}
          <div
            ref={chartContainerRef}
            className="relative flex-1 w-full min-h-[340px]"
          >
            {(() => {
              const svgWidth = Math.max(600, chartSize.width);
              const svgHeight = Math.max(300, chartSize.height);
              const padLeft = 36;
              const padRight = 6;
              const padTop = 10;
              const padBottom = 34;
              const plotWidth = svgWidth - padLeft - padRight;
              const plotHeight = svgHeight - padTop - padBottom;
              const colCount = Math.max(1, weeks.length);
              const colWidth = plotWidth / colCount;
              const barWidth = Math.max(14, Math.min(38, colWidth * 0.68));

              const linePoints = weeks
                .map((w, idx) => {
                  const rawLineVal = compareLineTotals[w.code] || 0;
                  const x = padLeft + idx * colWidth + colWidth / 2;
                  const y =
                    padTop +
                    plotHeight -
                    Math.min(1, rawLineVal / chartMaxY) * plotHeight;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");

              return (
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
                          {formatAxisK(tickVal)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Empty state text when no weeks loaded */}
                  {weeks.length === 0 && (
                    <text
                      x={padLeft + plotWidth / 2}
                      y={padTop + plotHeight / 2}
                      textAnchor="middle"
                      className="fill-base-content/35 text-xs font-medium"
                    >
                      No forecast data available
                    </text>
                  )}

                  {/* Columns & Stacked Bars */}
                  {weeks.map((week, idx) => {
                    const colX = padLeft + idx * colWidth;
                    const barX = colX + (colWidth - barWidth) / 2;
                    const weekTotal = weekTotals[week.code] || 0;

                    const segments: {
                      key: string;
                      label: string;
                      val: number;
                      color: string;
                    }[] = [];

                    if (chartGroupMode === "Customer") {
                      displayRows.forEach((r) => {
                        segments.push({
                          key: r.id,
                          label: r.name,
                          val: r.weekly[week.code] || 0,
                          color: r.color,
                        });
                      });
                    } else {
                      productSeries.forEach((p) => {
                        segments.push({
                          key: p.id,
                          label: p.name,
                          val: Math.round(weekTotal * p.share),
                          color: p.color,
                        });
                      });
                    }

                    let currentTopY = padTop + plotHeight;

                    return (
                      <g
                        key={week.code}
                        onMouseEnter={() => setHoveredWeek(week.code)}
                        onMouseLeave={() => setHoveredWeek(null)}
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
                          {week.shortNum}
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

                  {/* Comparison Dashed Line */}
                  {weeks.length > 0 && Object.keys(compareLineTotals).length > 0 && (
                    <polyline
                      fill="none"
                      stroke="#475569"
                      strokeWidth={1.6}
                      strokeDasharray="4 3"
                      points={linePoints}
                    />
                  )}
                </svg>
              );
            })()}

            {hoveredWeek && (
              <div className="pointer-events-none absolute top-2 right-4 bg-base-100/95 backdrop-blur-xs border border-base-300 rounded-xl px-3 py-2 shadow-md text-xs z-10 min-w-[170px]">
                <div className="flex items-center justify-between font-bold text-base-content border-b border-base-200 pb-1 mb-1">
                  <span>{hoveredWeek}</span>
                  <span className="text-primary">
                    {(weekTotals[hoveredWeek] || 0).toLocaleString()}{" "}
                    {unitLabelLower}
                  </span>
                </div>
                {compareForecast && (
                  <div className="flex items-center justify-between text-[11px] text-base-content/60">
                    <span>{compareForecast} baseline:</span>
                    <span>
                      {(compareLineTotals[hoveredWeek] || 0).toLocaleString()}{" "}
                      {unitLabelLower}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: CUSTOMER MIX Card */}
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
              {displayRows.map((row) => {
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
                  ? `100% = ${grandTotal.toLocaleString()} ${unitLabelLower}`
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
                No customer data
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-base-200/60">
                {customerMixRows.map((row) => (
                  <div key={row.id} className="py-2 flex flex-col gap-1">
                    <div className="grid grid-cols-12 items-center text-xs">
                      <div className="col-span-6 flex items-center gap-1.5 font-bold text-base-content">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: row.color }}
                        />
                        <span className="truncate">{row.name}</span>
                      </div>
                      <div className="col-span-3 text-right text-base-content/70 font-medium tabular-nums">
                        {row.rowTotal.toLocaleString()}
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
              {grandTotal > 0 ? grandTotal.toLocaleString() : "-"}
            </div>
            <div className="col-span-3 text-right tabular-nums">
              {grandTotal > 0 ? "100%" : "-"}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Bottom Card: FORECAST TABLE • CUSTOMER × WEEK */}
      <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-xs flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-base-content">
              FORECAST TABLE • CUSTOMER × WEEK
            </h2>
            <div className="inline-flex h-6 items-center bg-base-200/80 p-0.5 rounded-md border border-base-300">
              <button
                type="button"
                onClick={() => setTableMode("Forecast")}
                className={`px-2.5 h-full rounded text-[11px] font-bold transition-all cursor-pointer ${
                  tableMode === "Forecast"
                    ? "bg-[#3b38c8] text-white shadow-2xs"
                    : "text-base-content/65 hover:text-base-content"
                }`}
              >
                Forecast
              </button>
              <button
                type="button"
                onClick={() => setTableMode("Change")}
                className={`px-2.5 h-full rounded text-[11px] font-bold transition-all cursor-pointer ${
                  tableMode === "Change"
                    ? "bg-[#3b38c8] text-white shadow-2xs"
                    : "text-base-content/65 hover:text-base-content"
                }`}
              >
                Change vs {compareForecast || "-"}
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-base-300 text-base-content/55">
                <th className="sticky left-0 z-10 bg-base-100 py-2.5 pl-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider min-w-[110px] border-r border-base-200">
                  CUSTOMER
                </th>
                {weeks.map((week) => (
                  <th
                    key={week.code}
                    className={`py-2 px-2.5 text-right min-w-[78px] whitespace-nowrap border-r border-base-200 ${
                      week.isCurrentWeek
                        ? "bg-[#eef3ff] text-[#2563eb] font-extrabold"
                        : "font-semibold"
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
                <th className="sticky right-0 z-10 bg-base-100 py-2.5 pl-4 pr-2 text-right text-[11px] font-extrabold text-base-content min-w-[90px] border-l border-base-300">
                  Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-base-200/70">
              {displayRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={weeks.length + 2}
                    className="py-10 text-center text-xs text-base-content/35"
                  >
                    No forecast data available
                  </td>
                </tr>
              ) : (
                displayRows.map((row) => {
                  const rowDelta = row.rowTotal - row.compareRowTotal;
                  return (
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
                          <span>{row.name}</span>
                        </div>
                      </td>

                      {weeks.map((week) => {
                        const val = row.weekly[week.code] || 0;
                        const cmpVal = row.compareWeekly[week.code] || 0;
                        const delta = val - cmpVal;

                        return (
                          <td
                            key={week.code}
                            className={`py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap border-r border-base-200 ${
                              week.isCurrentWeek
                                ? "bg-[#eef3ff] font-extrabold text-[#1d4ed8]"
                                : "text-base-content/75 font-medium"
                            }`}
                          >
                            {tableMode === "Forecast" ? (
                              val.toLocaleString()
                            ) : (
                              <span
                                className={
                                  delta > 0
                                    ? "text-emerald-600 font-bold"
                                    : delta < 0
                                      ? "text-rose-600 font-bold"
                                      : "text-base-content/40"
                                }
                              >
                                {delta > 0
                                  ? `+${delta.toLocaleString()}`
                                  : delta.toLocaleString()}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      <td className="sticky right-0 z-10 bg-base-100 py-2.5 pl-4 pr-2 text-right font-extrabold text-base-content tabular-nums whitespace-nowrap border-l border-base-300">
                        {tableMode === "Forecast" ? (
                          row.rowTotal.toLocaleString()
                        ) : (
                          <span
                            className={
                              rowDelta > 0
                                ? "text-emerald-600"
                                : rowDelta < 0
                                  ? "text-rose-600"
                                  : "text-base-content/50"
                            }
                          >
                            {rowDelta > 0
                              ? `+${rowDelta.toLocaleString()}`
                              : rowDelta.toLocaleString()}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            <tfoot>
              <tr className="border-t-2 border-base-300 font-extrabold text-base-content">
                <td className="sticky left-0 z-10 bg-base-100 py-3 pl-2 pr-4 border-r border-base-200">
                  Total
                </td>
                {weeks.map((week) => {
                  const totalVal = weekTotals[week.code] || 0;
                  const cmpTotalVal = compareWeekTotals[week.code] || 0;
                  const delta = totalVal - cmpTotalVal;

                  return (
                    <td
                      key={week.code}
                      className={`py-3 px-2.5 text-right tabular-nums whitespace-nowrap border-r border-base-200 ${
                        week.isCurrentWeek
                          ? "bg-[#eef3ff] text-[#3b38c8]"
                          : ""
                      }`}
                    >
                      {tableMode === "Forecast" ? (
                        totalVal.toLocaleString()
                      ) : (
                        <span
                          className={
                            delta > 0
                              ? "text-emerald-600"
                              : delta < 0
                                ? "text-rose-600"
                                : "text-base-content/50"
                          }
                        >
                          {delta > 0
                            ? `+${delta.toLocaleString()}`
                            : delta.toLocaleString()}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="sticky right-0 z-10 bg-base-100 py-3 pl-4 pr-2 text-right tabular-nums whitespace-nowrap border-l border-base-300">
                  {grandTotal > 0
                    ? tableMode === "Forecast"
                      ? grandTotal.toLocaleString()
                      : `${grandTotal - compareGrandTotal >= 0 ? "+" : ""}${(
                          grandTotal - compareGrandTotal
                        ).toLocaleString()}`
                    : "-"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Table Footer Caption */}
        <div className="flex flex-wrap items-center justify-between text-[11px] text-base-content/45 pt-1">
          <span>
            {unitTitleLabel} · {weekRangeLabel}
          </span>
          <span>
            Source: {selectedForecast ? `Customer forecast ${selectedForecast}` : "-"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Forecast;
