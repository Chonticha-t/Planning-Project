import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Calendar,
  Search,
  ChevronDown,
  ChevronRight,
  RotateCw,
} from "lucide-react";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type {
  ProcessFilter,
  ForecastUnit,
  ChartGroupMode,
  TableGroupMode,
  ForecastWeekMeta,
  ForecastProductItem,
  ForecastApiResponse,
  AggregatedForecastRow,
} from "../types";

const FORECAST_API_URL = `${getApiBaseUrl()}/forecast`;

const SERIES_COLORS = [
  "#1d63dc", // Blue
  "#06b6d4", // Cyan
  "#ea580c", // Orange
  "#8b5cf6", // Purple
  "#10b981", // Emerald
  "#ef4444", // Red
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#6366f1", // Indigo
  "#84cc16", // Lime
  "#0284c7", // Sky
];
const OTHERS_COLOR = "#f59e0b"; // Amber Gold

const matchesProcessFilter = (prdType: string, filter: ProcessFilter): boolean => {
  if (filter === "ALL") return true;
  const upper = (prdType || "").toUpperCase();
  if (filter === "FPC") return upper === "E-FPC" || upper.includes("FPC");
  if (filter === "SMT") return upper === "M-SMT" || upper.includes("SMT");
  return true;
};

const formatQty = (val: number, unit: ForecastUnit): string => {
  if (unit === "Lot") {
    return val.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
  }
  return Math.round(val).toLocaleString();
};

const Forecast: React.FC = () => {
  // Filter states
  const [processFilter, setProcessFilter] = useState<ProcessFilter>("SMT");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("ALL");
  const [unit, setUnit] = useState<ForecastUnit>("Pcs");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Section view states (synced between Chart & Table)
  const [chartGroupMode, setChartGroupMode] = useState<ChartGroupMode>("Customer");
  const [tableGroupMode, setTableGroupMode] = useState<TableGroupMode>("Customer");
  const [hoveredWeek, setHoveredWeek] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    () => new Set()
  );

  const handleGroupModeChange = useCallback((mode: ChartGroupMode) => {
    setChartGroupMode(mode);
    setTableGroupMode(mode);
  }, []);

  const toggleCustomerExpand = useCallback((custName: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(custName)) {
        next.delete(custName);
      } else {
        next.add(custName);
      }
      return next;
    });
  }, []);

  // API Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<ForecastWeekMeta[]>([]);
  const [products, setProducts] = useState<ForecastProductItem[]>([]);
  const [lastUpdated, setLastUpdated] = useState<{ date: string; time: string }>({
    date: "-",
    time: "",
  });

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get<ForecastApiResponse>(FORECAST_API_URL, {
        timeout: 15000,
      });
      if (res.data && res.data.status === "OK") {
        setWeeks(res.data.weeks || []);
        setProducts(res.data.products || []);
        if (res.data.lastUpdated) {
          setLastUpdated({
            date: res.data.lastUpdated.date || "-",
            time: res.data.lastUpdated.time || "",
          });
        }
      } else {
        setError("Unable to load forecast data");
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to fetch forecast data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  // Reset customer selection if not in new process group
  const productsByProcess = useMemo(() => {
    return products.filter((p) => matchesProcessFilter(p.prdType, processFilter));
  }, [products, processFilter]);

  const availableCustomers = useMemo(() => {
    const set = new Set<string>();
    productsByProcess.forEach((p) => {
      if (p.customer) set.add(p.customer);
    });
    return Array.from(set).sort((a, b) => {
      if (a === "OTHERS") return 1;
      if (b === "OTHERS") return -1;
      return a.localeCompare(b);
    });
  }, [productsByProcess]);

  useEffect(() => {
    if (selectedCustomer !== "ALL" && !availableCustomers.includes(selectedCustomer)) {
      setSelectedCustomer("ALL");
    }
  }, [availableCustomers, selectedCustomer]);

  // Products matching processFilter + customer + searchQuery
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return productsByProcess.filter((p) => {
      if (selectedCustomer !== "ALL" && p.customer !== selectedCustomer) {
        return false;
      }
      if (
        q &&
        !p.product.toLowerCase().includes(q) &&
        !p.customer.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [productsByProcess, selectedCustomer, searchQuery]);

  // Helper to convert a product's pcs for a week into active unit (Pcs or Lot)
  const getProductWeekVal = useCallback(
    (item: ForecastProductItem, weekCode: string): number => {
      const pcs = item.weeklyPcs[weekCode] || 0;
      if (pcs === 0) return 0;
      if (unit === "Lot") {
        return item.pcsLot && item.pcsLot > 0 ? pcs / item.pcsLot : 0;
      }
      return pcs;
    },
    [unit]
  );

  // Aggregate by Customer
  const customerRows = useMemo<AggregatedForecastRow[]>(() => {
    const map = new Map<string, Record<string, number>>();
    const totals = new Map<string, number>();

    filteredProducts.forEach((p) => {
      const cust = p.customer || "OTHERS";
      if (!map.has(cust)) {
        map.set(cust, {});
        totals.set(cust, 0);
      }
      const wMap = map.get(cust)!;
      let sum = totals.get(cust)!;
      weeks.forEach(({ code }) => {
        const val = getProductWeekVal(p, code);
        if (val !== 0) {
          wMap[code] = (wMap[code] || 0) + val;
          sum += val;
        }
      });
      totals.set(cust, sum);
    });

    // Sort customers by total descending, keeping OTHERS at the end
    const sortedNames = Array.from(map.keys()).sort((a, b) => {
      if (a === "OTHERS") return 1;
      if (b === "OTHERS") return -1;
      return (totals.get(b) || 0) - (totals.get(a) || 0);
    });

    let colorIdx = 0;
    return sortedNames.map((name) => {
      const isOthers = name === "OTHERS";
      const color = isOthers
        ? OTHERS_COLOR
        : SERIES_COLORS[colorIdx++ % SERIES_COLORS.length];
      return {
        id: name,
        name,
        color,
        weekly: map.get(name)!,
        rowTotal: totals.get(name) || 0,
      };
    });
  }, [filteredProducts, weeks, getProductWeekVal]);

  // Aggregate by Product
  const productRows = useMemo<AggregatedForecastRow[]>(() => {
    const list: Omit<AggregatedForecastRow, "color">[] = filteredProducts.map((p) => {
      const weekly: Record<string, number> = {};
      let rowTotal = 0;
      weeks.forEach(({ code }) => {
        const val = getProductWeekVal(p, code);
        if (val !== 0) {
          weekly[code] = val;
          rowTotal += val;
        }
      });
      return {
        id: `${p.prdType}::${p.product}`,
        name: p.product,
        subLabel: p.customer,
        weekly,
        rowTotal,
      };
    });

    list.sort((a, b) => b.rowTotal - a.rowTotal || a.name.localeCompare(b.name));

    return list.map((item, idx) => ({
      ...item,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    }));
  }, [filteredProducts, weeks, getProductWeekVal]);

  // Chart series (Top 6 + Others so chart & legend stay crisp)
  const chartSeriesRows = useMemo<AggregatedForecastRow[]>(() => {
    const source = chartGroupMode === "Customer" ? customerRows : productRows;
    const nonZero = source.filter((r) => r.rowTotal > 0);
    const MAX_SERIES = 6;
    if (nonZero.length <= MAX_SERIES) return nonZero;

    const top = nonZero.slice(0, MAX_SERIES).map((r, idx) => ({
      ...r,
      color: SERIES_COLORS[idx % SERIES_COLORS.length],
    }));
    const rest = nonZero.slice(MAX_SERIES);
    const othersWeekly: Record<string, number> = {};
    let othersTotal = 0;
    rest.forEach((r) => {
      weeks.forEach(({ code }) => {
        const v = r.weekly[code] || 0;
        if (v !== 0) {
          othersWeekly[code] = (othersWeekly[code] || 0) + v;
          othersTotal += v;
        }
      });
    });

    if (othersTotal > 0) {
      top.push({
        id: "__CHART_OTHERS__",
        name: "Others",
        color: OTHERS_COLOR,
        weekly: othersWeekly,
        rowTotal: othersTotal,
      });
    }
    return top;
  }, [chartGroupMode, customerRows, productRows, weeks]);

  // Active rows for the bottom table
  const tableRows = useMemo<AggregatedForecastRow[]>(() => {
    return tableGroupMode === "Customer" ? customerRows : productRows;
  }, [tableGroupMode, customerRows, productRows]);

  // Products grouped by Customer (sorted alphabetically by product code like CAD..., CAE...)
  const productsByCustomer = useMemo(() => {
    const map = new Map<string, AggregatedForecastRow[]>();
    productRows.forEach((pRow) => {
      const cust = pRow.subLabel || "OTHERS";
      if (!map.has(cust)) map.set(cust, []);
      map.get(cust)!.push(pRow);
    });
    map.forEach((list) => {
      list.sort((a, b) => a.name.localeCompare(b.name));
    });
    return map;
  }, [productRows]);

  const hasExpandedCustomer =
    tableGroupMode === "Customer" && expandedCustomers.size > 0;

  // Weekly totals & Grand total
  const { weekTotals, grandTotal, grandTotalPcs, grandTotalLots } = useMemo(() => {
    const wTotals: Record<string, number> = {};
    let gTotal = 0;
    let gPcs = 0;
    let gLots = 0;

    weeks.forEach(({ code }) => {
      wTotals[code] = 0;
    });

    filteredProducts.forEach((p) => {
      weeks.forEach(({ code }) => {
        const pcs = p.weeklyPcs[code] || 0;
        const lot = p.pcsLot && p.pcsLot > 0 ? pcs / p.pcsLot : 0;
        gPcs += pcs;
        gLots += lot;
        const val = unit === "Lot" ? lot : pcs;
        wTotals[code] += val;
        gTotal += val;
      });
    });

    return {
      weekTotals: wTotals,
      grandTotal: gTotal,
      grandTotalPcs: gPcs,
      grandTotalLots: gLots,
    };
  }, [filteredProducts, weeks, unit]);

  // KPI calculations
  const kpiStats = useMemo(() => {
    const avgPerWeek = weeks.length > 0 ? grandTotal / weeks.length : 0;

    let peakWeekCode = "-";
    let peakWeekVal = 0;
    weeks.forEach(({ code }) => {
      if ((weekTotals[code] || 0) > peakWeekVal) {
        peakWeekVal = weekTotals[code] || 0;
        peakWeekCode = code;
      }
    });

    const distinctCustSet = new Set<string>();
    const distinctPrdSet = new Set<string>();
    filteredProducts.forEach((p) => {
      if (p.customer) distinctCustSet.add(p.customer);
      if (p.product) distinctPrdSet.add(p.product);
    });

    return {
      total: grandTotal,
      avgPerWeek,
      secondaryTotalLabel:
        unit === "Pcs"
          ? `${formatQty(grandTotalLots, "Lot")} lots total`
          : `${formatQty(grandTotalPcs, "Pcs")} pcs total`,
      peakWeekCode,
      peakWeekVal,
      customerCount: distinctCustSet.size,
      productCount: distinctPrdSet.size,
    };
  }, [
    grandTotal,
    grandTotalLots,
    grandTotalPcs,
    unit,
    weeks,
    weekTotals,
    filteredProducts,
  ]);

  // Customer Mix sorted by share descending (top 6 + Others if > 7)
  const customerMixRows = useMemo(() => {
    const nonZero = customerRows.filter((r) => r.rowTotal > 0);
    const sorted = [...nonZero].sort((a, b) => b.rowTotal - a.rowTotal);
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
  }, [customerRows, grandTotal]);

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

  const unitLabelLower = unit === "Pcs" ? "pcs" : "lots";
  const unitTitleLabel = unit === "Pcs" ? "Piece" : "Lot";
  const prdTypeDisplay =
    processFilter === "SMT"
      ? "M-SMT"
      : processFilter === "FPC"
        ? "E-FPC"
        : "ALL (M-SMT + E-FPC)";

  const weekRangeLabel = useMemo(() => {
    if (weeks.length === 0) return "-";
    return `${weeks[0].code} – ${weeks[weeks.length - 1].code}`;
  }, [weeks]);

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

  const formatAxisTick = (val: number) => {
    if (val === 0) return "0";
    if (val >= 1_000_000) {
      const m = val / 1_000_000;
      return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
    }
    if (val >= 1000) {
      const k = val / 1000;
      return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
    }
    return Number.isInteger(val) ? String(val) : val.toFixed(1);
  };

  return (
    <div className="relative flex flex-col gap-3.5 w-full pb-6 select-none">
      {/* 1. Top Filter & Control Card */}
      <div className="bg-base-100 border border-base-300 rounded-2xl p-3.5 shadow-xs flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
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

            {/* Customer Selector */}
            <div className="relative">
              <select
                aria-label="Filter by customer"
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="appearance-none h-8 pl-3 pr-8 rounded-lg text-xs font-medium bg-base-100 border border-base-300 text-base-content focus:outline-none cursor-pointer"
              >
                <option value="ALL">
                  All Customers ({availableCustomers.length})
                </option>
                {availableCustomers.map((c) => (
                  <option key={c} value={c}>
                    {c}
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

            {/* Unit Switcher: Pcs | Lot */}
            <div className="inline-flex h-8 items-center bg-base-200/70 p-0.5 rounded-lg border border-base-300">
              {(["Pcs", "Lot"] as ForecastUnit[]).map((u) => {
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
            <div className="relative flex-1 min-w-[200px] max-w-[280px]">
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

          {/* Refresh Button */}
          <button
            type="button"
            onClick={fetchForecast}
            disabled={loading}
            title="Refresh forecast data"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-base-300 bg-base-100 hover:bg-base-200 text-xs font-medium text-base-content/75 transition-colors cursor-pointer"
          >
            <RotateCw size={13} className={loading ? "animate-spin text-primary" : ""} />
            <span>Refresh</span>
          </button>
        </div>

        {error && (
          <div role="alert" className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* 2. Summary KPI Section */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-base-content/50 px-0.5">
          Summary for selected forecast ({prdTypeDisplay})
        </span>

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
                      onClick={() => handleGroupModeChange(mode)}
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
            {(() => {
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
              );
            })()}

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
                    onClick={() => {
                      handleGroupModeChange("Customer");
                      toggleCustomerExpand(row.name);
                    }}
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
      </div>

      {/* 4. Bottom Card: FORECAST TABLE */}
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
                    onClick={() => handleGroupModeChange(mode)}
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
              onClick={() => setExpandedCustomers(new Set())}
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
                                onClick={() => toggleCustomerExpand(row.name)}
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
                      onClick={() => toggleCustomerExpand(row.name)}
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
    </div>
  );
};

export default Forecast;
