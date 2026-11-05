import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import axios from "axios";
import dayjs from "dayjs";
import { useGateToday } from "./useGateToday";
import { formatGateName, formatGateTransition } from "../gatePresentation";
import {
  PLANNING_SUMMARY_GATE_TABLE_API,
  PLANNING_SUMMARY_GATE_SUMMARY_API,
  PLANNING_SUMMARY_GATE_CALENDAR_API,
} from "./api";
import type {
  PlanningSummaryGateRow,
  GateKpiSummary,
  GateFilterState,
  MatrixGateRow,
  MatrixDayCell,
  GateDailyChartData,
  PrdCategory,
  PlanWindow,
  GateStatusFilter,
} from "../types";

const DEFAULT_GATES_FPC = ["FFPC", "FVAC", "FADL", "FIN", "W/H"];
const DEFAULT_GATES_SMT = ["SMT", "FADL", "FIN", "W/H"];

// Use the visible process label; needed WIP has no current process.
const getCurrentProcess = (row: PlanningSummaryGateRow): string => {
  if (row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip") return "";
  return row.proc_disp?.trim() || row.current_gate?.trim() || "";
};

export const usePlanningSummaryGate = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [sourceRows, setRows] = useState<PlanningSummaryGateRow[]>([]);
  const [holidaySet, setHolidaySet] = useState<Set<string>>(() => new Set());
  const todayStr = useGateToday();
  const [kpis, setKpis] = useState<GateKpiSummary[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GateStatusFilter>("all");
  const [currentProcessFilter, setCurrentProcessFilter] = useState("");

  const [filters, setFilters] = useState<GateFilterState>({
    category: "FPC",
    planWindow: "2w",
    skipHolidays: true,
    selectedProduct: "",
    search: "",
    selectedGate: "FFPC",
    selectedDate: null,
    actionTab: "all",
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch data (fetch all categories and all stage dates for complete lot stage timelines)
  const fetchData = useCallback(async () => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setRows([]);
    setKpis([]);
    setHolidaySet(new Set());
    setLastUpdated("");

    try {
      const [tableRes, summaryRes, calendarRes] = await Promise.all([
        axios.get<{ status: string; data: PlanningSummaryGateRow[] }>(
          PLANNING_SUMMARY_GATE_TABLE_API,
          {
            params: {
              skip_holidays: filters.skipHolidays,
              startdate: "2000-01-01",
            },
            signal: controller.signal,
            timeout: 10000,
          }
        ),
        axios.get<{ status: string; data: GateKpiSummary[] }>(
          PLANNING_SUMMARY_GATE_SUMMARY_API,
          {
            params: {
              prd_category: filters.category === "ALL" ? undefined : filters.category,
              skip_holidays: filters.skipHolidays,
            },
            signal: controller.signal,
            timeout: 6000,
          }
        ),
        axios.get<{ status: string; data: { date: string; is_working: boolean }[] }>(
          PLANNING_SUMMARY_GATE_CALENDAR_API,
          {
            params: { startdate: todayStr, stopdate: dayjs(todayStr).add(28, "day").format("YYYY-MM-DD") },
            signal: controller.signal,
            timeout: 15000,
          }
        ),
      ]);

      if (controller.signal.aborted || abortControllerRef.current !== controller) return;
      if (
        tableRes.data?.status !== "OK" || !Array.isArray(tableRes.data.data) ||
        summaryRes.data?.status !== "OK" || !Array.isArray(summaryRes.data.data) ||
        calendarRes.data?.status !== "OK" || !Array.isArray(calendarRes.data.data)
      ) {
        throw new Error("Invalid planning gate response");
      }
      const calendar = new Map(calendarRes.data.data.map((day) => [day.date, day.is_working]));
      if (calendar.size !== 29 || Array.from({ length: 29 }, (_, i) =>
        dayjs(todayStr).add(i, "day").format("YYYY-MM-DD")
      ).some((date) => typeof calendar.get(date) !== "boolean")) {
        throw new Error("Incomplete working-day calendar response");
      }
      setHolidaySet(new Set([...calendar].filter(([, working]) => !working).map(([date]) => date)));
      setRows(tableRes.data.data);
      setKpis(summaryRes.data.data);
      setLastUpdated(dayjs().format("DD/MM/YYYY HH:mm"));
    } catch {
      if (controller.signal.aborted || abortControllerRef.current !== controller) return;
      setRows([]);
      setKpis([]);
      setHolidaySet(new Set());
      setError("Unable to load planning gate data. Please refresh to try again.");
    } finally {
      if (!controller.signal.aborted && abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  }, [filters.category, filters.skipHolidays, todayStr]);

  useEffect(() => {
    void fetchData();
    return () => abortControllerRef.current?.abort();
  }, [fetchData]);

  // Distinct gates based on category and data (deduplicated & canonical ordered)
  const availableGates = useMemo(() => {
    const defaultGates =
      filters.category === "SMT"
        ? DEFAULT_GATES_SMT
        : filters.category === "ALL"
          ? [...DEFAULT_GATES_FPC, ...DEFAULT_GATES_SMT.filter((g) => !DEFAULT_GATES_FPC.includes(g))]
          : DEFAULT_GATES_FPC;
    if (kpis.length > 0) {
      // Deduplicate gate names while preserving lowest gate_order
      const map = new Map<string, number>();
      kpis.forEach((k) => {
        if (!map.has(k.gate_name) || (k.gate_order < (map.get(k.gate_name) ?? 999))) {
          map.set(k.gate_name, k.gate_order);
        }
      });
      const distinct = Array.from(map.keys());

      // Canonical sort matching default sequence first
      return distinct.sort((a, b) => {
        const idxA = defaultGates.indexOf(a);
        const idxB = defaultGates.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return (map.get(a) || 0) - (map.get(b) || 0);
      });
    }
    return defaultGates;
  }, [kpis, filters.category]);

  // Select the source schedule without inventing dates when one variant is missing.
  // Contains ALL categories and ALL stage dates for the Gate Stage timeline.
  const baseRows = useMemo(() => sourceRows.map((row) => filters.skipHolidays ? row : ({
    ...row,
    start_by: row.start_by_no_skip ?? row.start_by,
    arrive_by: row.arrive_by_no_skip ?? row.arrive_by,
    must_out: row.must_out_no_skip ?? row.must_out,
  })), [sourceRows, filters.skipHolidays]);

  // Rows filtered by the top category switcher (ALL | FPC | SMT)
  const categoryRows = useMemo(() => {
    if (filters.category === "ALL") return baseRows;
    return baseRows.filter((r) => r.prd_category === filters.category);
  }, [baseRows, filters.category]);

  // Distinct sorted product names for the dropdown filter
  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < categoryRows.length; i++) {
      const r = categoryRows[i];
      if (r.must_out && r.must_out < todayStr) continue;
      const p = r.prd_name?.trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categoryRows, todayStr]);

  // Ensure selectedGate is valid when availableGates change
  useEffect(() => {
    if (!availableGates.includes(filters.selectedGate) && availableGates.length > 0) {
      setFilters((prev) => ({ ...prev, selectedGate: availableGates[0] }));
    }
  }, [availableGates, filters.selectedGate]);

  const todayDisplay = dayjs(todayStr).format("DD/MM");

  useEffect(() => {
    setFilters((prev) => ({ ...prev, selectedDate: null }));
  }, [todayStr]);

  // Days list for plan window (14 days for 2w, 28 days for 1m) starting after Today
  const calendarDays = useMemo(() => {
    const count = filters.planWindow === "2w" ? 14 : 28;
    const days: { dateStr: string; dayName: string; dateDisplay: string; isToday: boolean; isHoliday: boolean }[] = [];
    const base = dayjs(todayStr);

    for (let i = 1; i <= count; i++) {
      const d = base.add(i, "day");
      const dateStr = d.format("YYYY-MM-DD");
      const isHoliday = holidaySet.has(dateStr);
      days.push({
        dateStr,
        dayName: d.format("ddd").toUpperCase(),
        dateDisplay: d.format("DD/MM"),
        isToday: false,
        isHoliday,
      });
    }
    return days;
  }, [filters.planWindow, todayStr, holidaySet]);

  // Deferred search value to keep typing smooth even with 10,000+ rows
  const deferredSearch = useDeferredValue(filters.search);

  // Globally filtered rows by Product Dropdown + Search Box so ALL 4 sections update together
  const globallyFilteredRows = useMemo(() => {
    const prodFilter = filters.selectedProduct?.trim() || "";
    const q = deferredSearch.toLowerCase().trim();
    const normalizedQ = q.replace(/\s*(?:->|\u2192)\s*/g, " \u2192 ");

    if (!prodFilter && !q) return categoryRows;

    return categoryRows.filter((r) => {
      if (prodFilter && r.prd_name !== prodFilter) {
        return false;
      }
      if (q) {
        const matchesText =
          (r.prd_name && r.prd_name.toLowerCase().includes(q)) ||
          (r.lot_no && r.lot_no.toLowerCase().includes(q)) ||
          (r.item && r.item.toLowerCase().includes(q)) ||
          (r.po_no && r.po_no.toLowerCase().includes(q)) ||
          (r.status && r.status.toLowerCase().includes(q)) ||
          [
            r.current_gate,
            r.gate_name,
            r.next_gate,
            formatGateName(r.current_gate),
            formatGateTransition(r.gate_name, r.next_gate),
          ].some((value) => value?.toLowerCase().includes(normalizedQ));
        if (!matchesText) return false;
      }
      return true;
    });
  }, [categoryRows, filters.selectedProduct, deferredSearch]);

  // Exclude passed stages before indexing the active gate views in a single O(N) pass.
  const rowsByGate = useMemo(() => {
    const map = new Map<string, PlanningSummaryGateRow[]>();
    for (let i = 0; i < globallyFilteredRows.length; i++) {
      const r = globallyFilteredRows[i];
      if (r.gate_state === "passed") continue;
      if (r.must_out && r.must_out < todayStr) continue;
      let arr = map.get(r.gate_name);
      if (!arr) {
        arr = [];
        map.set(r.gate_name, arr);
      }
      arr.push(r);
    }
    return map;
  }, [globallyFilteredRows, todayStr]);

  const hasFilterActive = Boolean(filters.selectedProduct?.trim() || deferredSearch.trim());

  // Aggregated Gate Flow KPIs (Section 1) - O(N) single pass matching todayStr & active filters
  const gateFlowList = useMemo(() => {
    return availableGates.map((gName, idx) => {
      const gateRows = rowsByGate.get(gName) || [];
      if (gateRows.length > 0 || categoryRows.length > 0 || hasFilterActive) {
        let inGateCount = 0;
        let inGateQty = 0;
        let coming3dCount = 0;
        let needWipCount = 0;
        let mustOutTodayCount = 0;
        let onScheduleTodayCount = 0;
        let holdCount = 0;

        for (let i = 0; i < gateRows.length; i++) {
          const r = gateRows[i];
          if (r.gate_state === "in_gate") {
            inGateCount++;
            inGateQty += Number(r.qty) || 0;
          }
          if (r.is_coming_3d === true) coming3dCount++;
          if (r.gate_state === "need_wip" || r.status?.toLowerCase() === "need wip") needWipCount++;
          if (r.must_out === todayStr) {
            mustOutTodayCount++;
            if (r.on_time === true && !r.is_late && !r.is_hold && r.lot_status !== "HOLD") {
              onScheduleTodayCount++;
            }
          }
          if (r.is_hold || r.lot_status === "HOLD") holdCount++;
        }

        return {
          gate_name: gName,
          gate_order: idx + 1,
          in_gate_count: inGateCount,
          in_gate_qty: inGateQty,
          coming_3d_count: coming3dCount,
          need_wip_count: needWipCount,
          must_out_today_count: mustOutTodayCount,
          on_schedule_today_count: onScheduleTodayCount,
          hold_count: holdCount,
          late_count: 0,
        };
      }

      const matchingKpis = kpis.filter((k) => k.gate_name === gName);
      let inGateCount = 0;
      let inGateQty = 0;
      let coming3dCount = 0;
      let needWipCount = 0;
      let mustOutTodayCount = 0;
      let holdCount = 0;
      for (const k of matchingKpis) {
        inGateCount += Number(k.in_gate_count) || 0;
        inGateQty += Number(k.in_gate_qty) || 0;
        coming3dCount += Number(k.coming_3d_count) || 0;
        needWipCount += Number(k.need_wip_count) || 0;
        mustOutTodayCount += Number(k.must_out_today_count) || 0;
        holdCount += Number(k.hold_count) || 0;
      }

      return {
        gate_name: gName,
        gate_order: idx + 1,
        in_gate_count: inGateCount,
        in_gate_qty: inGateQty,
        coming_3d_count: coming3dCount,
        need_wip_count: needWipCount,
        must_out_today_count: mustOutTodayCount,
        hold_count: holdCount,
        late_count: 0,
      };
    });
  }, [availableGates, kpis, rowsByGate, categoryRows.length, hasFilterActive, todayStr]);

  // Section 2: Gate Matrix rows (Heatmap by Gate and Arrival Date) - Single O(N) pass per gate
  const matrixRows = useMemo<MatrixGateRow[]>(() => {
    return availableGates.map((gName, idx) => {
      const gateRows = rowsByGate.get(gName) || [];

      // Bucket counts by date in 1 pass instead of 30*4 filter passes
      const dateBuckets = new Map<
        string,
        { lotsCount: number; needCount: number; inGateCount: number; comingCount: number }
      >();

      let todayLotsCount = 0;
      let todayNeedCount = 0;
      let todayInGateCount = 0;
      let todayComingCount = 0;

      for (let i = 0; i < gateRows.length; i++) {
        const r = gateRows[i];
        const isNeed = r.gate_state === "need_wip";
        const isInGate = r.gate_state === "in_gate";
        const isComing = r.gate_state === "coming";

        if (r.arrive_by === todayStr) {
          todayLotsCount++;
          if (isNeed) todayNeedCount++;
          if (isInGate) todayInGateCount++;
          if (isComing) todayComingCount++;
        }

        if (r.arrive_by) {
          let b = dateBuckets.get(r.arrive_by);
          if (!b) {
            b = { lotsCount: 0, needCount: 0, inGateCount: 0, comingCount: 0 };
            dateBuckets.set(r.arrive_by, b);
          }
          b.lotsCount++;
          if (isNeed) b.needCount++;
          if (isInGate) b.inGateCount++;
          if (isComing) b.comingCount++;
        }
      }

      const lateCell: MatrixDayCell = {
        dateStr: "late",
        dayName: "LATE",
        dateDisplay: "Overdue",
        isToday: false,
        isHoliday: false,
        isLate: true,
        lotsCount: 0,
        needCount: 0,
        inGateCount: 0,
        comingCount: 0,
      };

      const todayCell: MatrixDayCell = {
        dateStr: todayStr,
        dayName: "TODAY",
        dateDisplay: todayDisplay,
        isToday: true,
        isHoliday: holidaySet.has(todayStr),
        isLate: false,
        lotsCount: todayLotsCount,
        needCount: todayNeedCount,
        inGateCount: todayInGateCount,
        comingCount: todayComingCount,
      };

      const days: MatrixDayCell[] = calendarDays.map((cd) => {
        const b = dateBuckets.get(cd.dateStr);
        return {
          dateStr: cd.dateStr,
          dayName: cd.dayName,
          dateDisplay: cd.dateDisplay,
          isToday: false,
          isHoliday: cd.isHoliday,
          isLate: false,
          lotsCount: b ? b.lotsCount : 0,
          needCount: b ? b.needCount : 0,
          inGateCount: b ? b.inGateCount : 0,
          comingCount: b ? b.comingCount : 0,
        };
      });

      return {
        gate_name: gName,
        gate_order: idx + 1,
        lateCell,
        todayCell,
        days,
      };
    });
  }, [availableGates, rowsByGate, calendarDays, todayStr, todayDisplay, holidaySet]);

  // Section 2: Stacked Chart Data for Selected Gate (Starts from Today, NO Late)
  const chartData = useMemo<GateDailyChartData[]>(() => {
    const selectedMatrix = matrixRows.find((m) => m.gate_name === filters.selectedGate);
    if (!selectedMatrix) return [];

    const list: GateDailyChartData[] = [];

    // Today (First bar)
    list.push({
      dateLabel: "Today",
      fullDate: todayStr,
      in_gate: selectedMatrix.todayCell.inGateCount,
      coming: selectedMatrix.todayCell.comingCount,
      need_wip: selectedMatrix.todayCell.needCount,
      total: selectedMatrix.todayCell.lotsCount,
      isHoliday: selectedMatrix.todayCell.isHoliday,
      isToday: true,
    });

    // Each day in calendar
    selectedMatrix.days.forEach((d) => {
      list.push({
        dateLabel: d.dateDisplay,
        fullDate: d.dateStr,
        in_gate: d.inGateCount,
        coming: d.comingCount,
        need_wip: d.needCount,
        total: d.lotsCount,
        isHoliday: d.isHoliday,
      });
    });

    return list;
  }, [matrixRows, filters.selectedGate, todayStr]);

  const availableCurrentProcesses = useMemo(() => {
    const processes = new Set<string>();
    for (const row of rowsByGate.get(filters.selectedGate) || []) {
      const process = getCurrentProcess(row);
      if (process) processes.add(process);
    }
    return [...processes].sort((a, b) => a.localeCompare(b));
  }, [rowsByGate, filters.selectedGate]);

  // Section 3: Filtered Action Table Rows (Arrivals from Today onwards)
  const filteredTableRows = useMemo(() => {
    let list = (rowsByGate.get(filters.selectedGate) || []).filter(
      (r) => !r.arrive_by || r.arrive_by >= todayStr
    );

    // If a specific date is selected from matrix/chart
    if (filters.selectedDate) {
      list = list.filter((r) => r.arrive_by === filters.selectedDate);
    } else if (filters.actionTab === "today") {
      list = list.filter((r) => r.arrive_by === todayStr);
    } else if (filters.actionTab === "in_gate") {
      list = list.filter((r) => r.gate_state === "in_gate");
    } else if (filters.actionTab === "need_wip") {
      list = list.filter((r) => r.gate_state === "need_wip");
    }

    if (statusFilter !== "all") {
      list = list.filter((r) => r.gate_state === statusFilter);
    }
    if (currentProcessFilter) {
      list = list.filter((r) => getCurrentProcess(r) === currentProcessFilter);
    }

    return [...list].sort((a, b) => (a.pri || 9999) - (b.pri || 9999));
  }, [rowsByGate, filters.selectedGate, filters.selectedDate, filters.actionTab, todayStr, statusFilter, currentProcessFilter]);

  // Summarize displayed detail rows, including the selected date and action tab.
  const tableStats = useMemo(() => {
    const gateRows = filteredTableRows;
    let inGateLots = 0;
    let comingLots = 0;
    let needWipLots = 0;
    let totalPcs = 0;

    for (let i = 0; i < gateRows.length; i++) {
      const r = gateRows[i];
      if (r.gate_state === "in_gate") inGateLots++;
      if (r.gate_state === "coming") comingLots++;
      if (r.gate_state === "need_wip" || r.status?.toLowerCase() === "need wip") needWipLots++;
      totalPcs += Number(r.qty) || 0;
    }

    return {
      inGateLots,
      comingLots,
      needWipLots,
      totalLots: gateRows.length,
      totalPcs,
    };
  }, [filteredTableRows]);

  // Handlers
  const setCategory = useCallback((cat: PrdCategory) => {
    setCurrentProcessFilter("");
    setFilters((prev) => ({
      ...prev,
      category: cat,
      selectedProduct: "",
      selectedGate: cat === "SMT" ? "SMT" : "FFPC",
      selectedDate: null,
    }));
  }, []);

  const setPlanWindow = useCallback((pw: PlanWindow) => {
    setFilters((prev) => ({ ...prev, planWindow: pw }));
  }, []);

  const setSelectedProduct = useCallback((prd: string) => {
    setFilters((prev) => ({ ...prev, selectedProduct: prd }));
  }, []);

  const setSearch = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, search: val }));
  }, []);

  const selectGate = useCallback((gName: string) => {
    if (gName !== filters.selectedGate) setCurrentProcessFilter("");
    setFilters((prev) => ({ ...prev, selectedGate: gName, selectedDate: null }));
  }, [filters.selectedGate]);

  const selectDate = useCallback((dateStr: string | null) => {
    setFilters((prev) => ({ ...prev, selectedDate: dateStr }));
  }, []);

  const setActionTab = useCallback((tab: "all" | "today" | "in_gate" | "need_wip") => {
    setFilters((prev) => ({ ...prev, actionTab: tab, selectedDate: null }));
  }, []);

  return {
    loading,
    error,
    rows: baseRows,
    kpis,
    lastUpdated,
    filters,
    todayStr,
    availableGates,
    availableProducts,
    calendarDays,
    gateFlowList,
    matrixRows,
    chartData,
    filteredTableRows,
    tableStats,
    statusFilter,
    setStatusFilter,
    currentProcessFilter,
    setCurrentProcessFilter,
    availableCurrentProcesses,
    setCategory,
    setPlanWindow,
    setSelectedProduct,
    setSearch,
    selectGate,
    selectDate,
    setActionTab,
    refreshData: fetchData,
  };
};

export default usePlanningSummaryGate;
