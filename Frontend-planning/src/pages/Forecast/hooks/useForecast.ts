import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { fetchForecastApi } from "./api";
import {
  matchesProcessFilter,
  formatQty,
  SERIES_COLORS,
  OTHERS_COLOR,
} from "../utils";
import type {
  ProcessFilter,
  ForecastUnit,
  ChartGroupMode,
  TableGroupMode,
  ForecastWeekMeta,
  ForecastProductItem,
  AggregatedForecastRow,
  CustomerMixRow,
  ForecastKpiStats,
} from "../types";

export const useForecast = () => {
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

  const handleGroupModeChange = useCallback((mode: ChartGroupMode | TableGroupMode) => {
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

  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchForecast = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const data = await fetchForecastApi(controller.signal);
      if (data && data.status === "OK") {
        setWeeks(data.weeks || []);
        setProducts(data.products || []);
        if (data.lastUpdated) {
          setLastUpdated({
            date: data.lastUpdated.date || "-",
            time: data.lastUpdated.time || "",
          });
        }
      } else {
        setError("Unable to load forecast data");
      }
    } catch (err: any) {
      if (axiosIsCancel(err)) return;
      setError(err?.response?.data?.message || err?.message || "Failed to fetch forecast data");
    } finally {
      setLoading(false);
    }
  }, []);

  function axiosIsCancel(err: any): boolean {
    return err?.name === "CanceledError" || err?.code === "ERR_CANCELED";
  }

  useEffect(() => {
    fetchForecast();
    return () => {
      abortControllerRef.current?.abort();
    };
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
  const kpiStats = useMemo<ForecastKpiStats>(() => {
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

  // Customer Mix sorted by share descending
  const customerMixRows = useMemo<CustomerMixRow[]>(() => {
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

  return {
    // States
    processFilter,
    setProcessFilter,
    selectedCustomer,
    setSelectedCustomer,
    unit,
    setUnit,
    searchQuery,
    setSearchQuery,
    chartGroupMode,
    tableGroupMode,
    hoveredWeek,
    setHoveredWeek,
    expandedCustomers,
    setExpandedCustomers,
    handleGroupModeChange,
    toggleCustomerExpand,

    // API & Data
    loading,
    error,
    weeks,
    products,
    lastUpdated,
    fetchForecast,

    // Aggregates & Lists
    availableCustomers,
    filteredProducts,
    customerRows,
    productRows,
    chartSeriesRows,
    tableRows,
    productsByCustomer,
    hasExpandedCustomer,
    weekTotals,
    grandTotal,
    kpiStats,
    customerMixRows,

    // Labels
    unitLabelLower,
    unitTitleLabel,
    prdTypeDisplay,
    weekRangeLabel,
  };
};

export default useForecast;
