import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import axios from "axios";
import dayjs from "dayjs";
import { useGateToday } from "./useGateToday";
import { formatGateName, formatGateTransition } from "../gatePresentation";
import { summarizeGateQuantities } from "../gateUnits";
import {
  PLANNING_SUMMARY_GATE_TABLE_API,
  PLANNING_SUMMARY_GATE_CALENDAR_API,
  PLANNING_SUMMARY_GATE_STREAM_API,
} from "./api";
import type {
  PlanningSummaryGateRow,
  GateFlowSummary,
  GateFilterState,
  MatrixGateRow,
  MatrixDayCell,
  GateDailyChartData,
  ProcessGroupFilter,
  PlanWindow,
  GateStatusFilter,
  GateUnit,
  GateUnitMode,
} from "../types";

const DEFAULT_GATES_FPC = ["FFPC", "FVAC", "FADL", "FIN", "W/H"];
const DEFAULT_GATES_SMT = ["MFPC", "MMOT", "MBLK", "MFIN", "MW/H"];

const CALENDAR_TTL_MS = 60000;

// Calendar validity and retries are independent of gate-row refreshes.
const useGateCalendar = (today: string) => {
  const [holidaySet, setHolidaySet] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const cacheRef = useRef<{ start: string; expiresAt: number } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async function load(force = false) {
    if (!force && controllerRef.current) return;
    if (!force && cacheRef.current?.start === today && cacheRef.current.expiresAt > Date.now()) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (cacheRef.current?.start !== today) {
      setLoading(true);
      setHolidaySet(new Set());
      setError(null);
      setWarning(null);
    }
    let nextDelay = CALENDAR_TTL_MS;
    try {
      const response = await axios.get<{ status: string; data: { date: string; is_working: boolean }[]; cache_ttl_ms?: number }>(
        PLANNING_SUMMARY_GATE_CALENDAR_API,
        {
          params: { startdate: today, stopdate: dayjs(today).add(28, "day").format("YYYY-MM-DD"), refresh: force },
          signal: controller.signal,
          timeout: 15000,
        }
      );
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (response.data?.status !== "OK" || !Array.isArray(response.data.data)) {
        throw new Error("Invalid working-day calendar response");
      }
      const calendar = new Map(response.data.data.map(day => [day.date, day.is_working]));
      if (response.data.data.length !== 29 || calendar.size !== 29 || Array.from({ length: 29 }, (_, i) =>
        dayjs(today).add(i, "day").format("YYYY-MM-DD")
      ).some(date => typeof calendar.get(date) !== "boolean")) {
        throw new Error("Incomplete working-day calendar response");
      }
      // Honor the server's remaining lifetime instead of extending an older cache.
      const remaining = response.data.cache_ttl_ms;
      nextDelay = typeof remaining === "number" && Number.isFinite(remaining)
        ? Math.max(1000, Math.min(CALENDAR_TTL_MS, remaining)) : CALENDAR_TTL_MS;
      cacheRef.current = { start: today, expiresAt: Date.now() + nextDelay };
      setHolidaySet(new Set([...calendar].filter(([, working]) => !working).map(([date]) => date)));
      setError(null);
      setWarning(null);
    } catch {
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      if (cacheRef.current?.start === today) {
        // Never replace a known calendar with invented working days on failure.
        cacheRef.current.expiresAt = 0;
        setWarning("Working-day calendar refresh failed. Calendar markings may be out of date. Retrying automatically.");
      } else {
        setError("Unable to load the working-day calendar. Retrying automatically, or select Refresh to try again.");
      }
      nextDelay = 5000;
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          if (document.visibilityState === "visible" && navigator.onLine) void load();
        }, nextDelay);
      }
    }
  }, [today]);

  useEffect(() => {
    void refresh();
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [refresh]);

  return { holidaySet, loading, error, warning, refresh };
};

const isPendingArrival = (row: PlanningSummaryGateRow): boolean =>
  row.gate_state === "coming" || row.gate_state === "need_wip";

// Keep pending arrivals and lots still in gate regardless of plan dates.
const isDetailTableRow = (row: PlanningSummaryGateRow, today: string): boolean =>
  row.gate_state !== "passed" && (
    isPendingArrival(row) || row.gate_state === "in_gate" || (
      (!row.must_out || row.must_out >= today) &&
      (!row.arrive_by || row.arrive_by >= today)
    )
  );

// Use the visible process label; needed WIP has no current process.
const getCurrentProcess = (row: PlanningSummaryGateRow): string => {
  if (row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip") return "";
  return row.proc_disp?.trim() || row.current_gate?.trim() || "";
};

export const usePlanningSummaryGate = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [sourceRows, setRows] = useState<PlanningSummaryGateRow[]>([]);
  const todayStr = useGateToday();
  const calendar = useGateCalendar(todayStr);
  const { holidaySet, refresh: refreshCalendar } = calendar;
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [streamDisconnected, setStreamDisconnected] = useState(false);
  const [statusFilter, setStatusFilter] = useState<GateStatusFilter>("all");
  const [currentProcessFilter, setCurrentProcessFilter] = useState("");
  const [unitMode, setUnitMode] = useState<GateUnitMode>("all");
  const summaryUnit: GateUnit = unitMode === "all" ? "piece" : unitMode;

  const [filters, setFilters] = useState<GateFilterState>({
    category: "EFPC_GEN",
    planWindow: "2w",
    skipHolidays: true,
    selectedProduct: "",
    search: "",
    selectedGate: "FFPC",
    selectedDate: null,
    actionTab: "all",
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingRefreshRef = useRef(false);
  const hasLoadedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch data (fetch all categories and all stage dates for complete lot stage timelines)
  const fetchData = useCallback(async function loadData(options: { silent?: boolean } = {}) {
    const silent = options.silent === true;
    // Coalesce notifications during a request into one trailing refresh.
    if (silent && abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      pendingRefreshRef.current = true;
      return;
    }
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
    abortControllerRef.current?.abort();
    pendingRefreshRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;
    if (!silent) {
      hasLoadedRef.current = false;
      setLoading(true);
      setError(null);
      setRefreshWarning(null);
      setRows([]);
      setLastUpdated("");
    }

    try {
      const tableRes = await axios.get<{ status: string; data: PlanningSummaryGateRow[] }>(
        PLANNING_SUMMARY_GATE_TABLE_API,
        {
          params: { skip_holidays: filters.skipHolidays },
          signal: controller.signal,
          timeout: 10000,
        }
      );

      if (controller.signal.aborted || abortControllerRef.current !== controller) return;
      if (
        tableRes.data?.status !== "OK" || !Array.isArray(tableRes.data.data)
      ) {
        throw new Error("Invalid planning gate response");
      }
      setRows(tableRes.data.data);
      hasLoadedRef.current = true;
      setError(null);
      setRefreshWarning(null);
      setLastUpdated(dayjs().format("DD/MM/YYYY HH:mm:ss"));
    } catch {
      if (controller.signal.aborted || abortControllerRef.current !== controller) return;
      controller.abort();
      if (hasLoadedRef.current) {
        setRefreshWarning("Live refresh failed. Displayed data may be out of date. Retrying automatically.");
      } else {
        setError("Unable to load planning gate data. Retrying automatically, or select Refresh to try again.");
      }
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (document.visibilityState === "visible" && navigator.onLine) void loadData({ silent: true });
      }, 5000);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setLoading(false);
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = false;
          void loadData({ silent: true });
        }
      }
    }
  }, [filters.skipHolidays]);

  useEffect(() => {
    let active = true;
    let monitorUnavailable = false;
    let initialFetchStarted = false;
    let stream: EventSource | null = null;
    // Subscribe before reading rows so the first connection needs only one read.
    // A slow or unavailable stream must never block the page indefinitely.
    const startInitialFetch = () => {
      if (!active || initialFetchStarted) return;
      initialFetchStarted = true;
      void fetchData();
    };
    const initialTimer = setTimeout(startInitialFetch, 1000);
    const refresh = () => {
      if (active && document.visibilityState === "visible" && navigator.onLine) {
        if (!initialFetchStarted) startInitialFetch();
        else void fetchData({ silent: true });
        void refreshCalendar();
      }
    };
    try {
      stream = new EventSource(PLANNING_SUMMARY_GATE_STREAM_API);
      stream.onopen = () => {
        if (!active) return;
        setStreamDisconnected(false);
        clearTimeout(initialTimer);
        if (!initialFetchStarted) startInitialFetch();
        // A reconnect or late first connection may have missed change events.
        else refresh();
      };
      stream.onmessage = (event) => {
        if (!active) return;
        try {
          const type = JSON.parse(event.data)?.type;
          if (type === "GATE_MONITOR_UNAVAILABLE") {
            monitorUnavailable = true;
            setStreamDisconnected(true);
          } else if (type === "GATE_MONITOR_OK" || type === "PLANNING_SUMMARY_GATE_UPDATED") {
            const recovered = monitorUnavailable;
            monitorUnavailable = false;
            setStreamDisconnected(false);
            if (recovered || type === "PLANNING_SUMMARY_GATE_UPDATED") refresh();
          }
        } catch {
          // Ignore malformed or unrelated events; never discard displayed data.
        }
      };
      stream.onerror = () => {
        if (active) {
          setStreamDisconnected(true);
          clearTimeout(initialTimer);
          startInitialFetch();
        }
        // EventSource reconnects automatically using the server retry interval.
      };
    } catch {
      setStreamDisconnected(true);
      clearTimeout(initialTimer);
      startInitialFetch();
    }
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      active = false;
      clearTimeout(initialTimer);
      stream?.close();
      pendingRefreshRef.current = false;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [fetchData, refreshCalendar, todayStr]);

  const refreshData = useCallback(() => {
    void fetchData();
    void refreshCalendar(true);
  }, [fetchData, refreshCalendar]);

  // Overview and schedule share the established gate sequence, including empty gates.
  const availableGates = useMemo(() => filters.category === "ALL"
    ? [...DEFAULT_GATES_FPC, ...DEFAULT_GATES_SMT]
    : filters.category === "SMT" ? DEFAULT_GATES_SMT : DEFAULT_GATES_FPC,
  [filters.category]);

  // Select the source schedule without inventing dates when one variant is missing.
  // Contains ALL categories and ALL stage dates for the Gate Stage timeline.
  const baseRows = useMemo(() => sourceRows.map((row) => filters.skipHolidays ? row : ({
    ...row,
    start_by: row.start_by_no_skip ?? row.start_by,
    arrive_by: row.arrive_by_no_skip ?? row.arrive_by,
    must_out: row.must_out_no_skip ?? row.must_out,
  })), [sourceRows, filters.skipHolidays]);

  // Use the stored process group for every section; unknown groups appear in ALL.
  const categoryRows = useMemo(() => {
    if (filters.category === "ALL") return baseRows;
    return baseRows.filter((r) => r.process_group === filters.category);
  }, [baseRows, filters.category]);

  // Distinct sorted product names for the dropdown filter
  const availableProducts = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < categoryRows.length; i++) {
      const r = categoryRows[i];
      if (r.must_out && r.must_out < todayStr && !isPendingArrival(r) && r.gate_state !== "in_gate") continue;
      const p = r.prd_name?.trim();
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categoryRows, todayStr]);

  // Empty schedule gates must remain selectable for chart and detail drilldown.
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

  // Cards, schedule and trend share exactly the visible planned-arrival dates.
  // Exit deadlines remain available for warnings, never for excluding arrivals.
  const rowsByGate = useMemo(() => {
    const visibleDates = new Set([todayStr, ...calendarDays.map((day) => day.dateStr)]);
    const map = new Map<string, PlanningSummaryGateRow[]>();
    for (let i = 0; i < globallyFilteredRows.length; i++) {
      const r = globallyFilteredRows[i];
      if (r.gate_state === "passed") continue;
      if (!r.arrive_by || !visibleDates.has(r.arrive_by)) continue;
      let arr = map.get(r.gate_name);
      if (!arr) {
        arr = [];
        map.set(r.gate_name, arr);
      }
      arr.push(r);
    }
    return map;
  }, [globallyFilteredRows, calendarDays, todayStr]);

  const detailRowsByGate = useMemo(() => {
    const map = new Map<string, PlanningSummaryGateRow[]>();
    for (const row of globallyFilteredRows) {
      if (!isDetailTableRow(row, todayStr)) continue;
      const gateRows = map.get(row.gate_name);
      if (gateRows) gateRows.push(row);
      else map.set(row.gate_name, [row]);
    }
    return map;
  }, [globallyFilteredRows, todayStr]);

  // Aggregate physical lots once within each reporting scope.
  const gateFlowList = useMemo<GateFlowSummary[]>(() => availableGates.map((gate, index) => {
    const rows = rowsByGate.get(gate) || [];
    const quantities = summarizeGateQuantities(rows);
    return {
      gate_name: gate, gate_order: index + 1, quantities,
      in_gate_count: quantities.in_gate.lot,
      in_gate_qty: quantities.in_gate.piece ?? 0,
      coming_count: quantities.coming.lot,
      need_wip_count: quantities.needCount,
      must_out_today_count: rows.filter((row) => row.must_out === todayStr).length,
      on_schedule_today_count: rows.filter((row) => row.must_out === todayStr && row.on_time === true && !row.is_late && !row.is_hold && row.lot_status !== "HOLD").length,
      hold_count: rows.filter((row) => row.is_hold || row.lot_status === "HOLD").length,
      late_count: 0,
    };
  }), [availableGates, rowsByGate, todayStr]);

  // Use the same gate rows and arrival data as the overview.
  const matrixRows = useMemo<MatrixGateRow[]>(() => availableGates.map((gate, index) => {
    const buckets = new Map<string, PlanningSummaryGateRow[]>();
    for (const row of rowsByGate.get(gate) || []) {
      if (!row.arrive_by) continue;
      const bucket = buckets.get(row.arrive_by);
      if (bucket) bucket.push(row);
      else buckets.set(row.arrive_by, [row]);
    }
    const makeCell = (date: { dateStr: string; dayName: string; dateDisplay: string; isToday: boolean; isHoliday: boolean }): MatrixDayCell => {
      const quantities = summarizeGateQuantities(buckets.get(date.dateStr) || []);
      return {
        ...date, isLate: false, quantities,
        lotsCount: quantities.total.lot, needCount: quantities.needCount,
        inGateCount: quantities.in_gate.lot, comingCount: quantities.coming.lot,
      };
    };
    return {
      gate_name: gate, gate_order: index + 1,
      lateCell: { ...makeCell({ dateStr: "late", dayName: "LATE", dateDisplay: "Overdue", isToday: false, isHoliday: false }), isLate: true },
      todayCell: makeCell({ dateStr: todayStr, dayName: "TODAY", dateDisplay: todayDisplay, isToday: true, isHoliday: holidaySet.has(todayStr) }),
      days: calendarDays.map(makeCell),
    };
  }), [availableGates, rowsByGate, calendarDays, todayStr, todayDisplay, holidaySet]);

  const chartDataByUnit = useMemo<Record<GateUnit, GateDailyChartData[]>>(() => {
    const selected = matrixRows.find((row) => row.gate_name === filters.selectedGate);
    const cells = selected ? [selected.todayCell, ...selected.days] : [];
    const forUnit = (unit: GateUnit): GateDailyChartData[] => cells.map((cell) => ({
      dateLabel: cell.isToday ? "Today" : cell.dateDisplay, fullDate: cell.dateStr,
      in_gate: cell.quantities.in_gate[unit], coming: cell.quantities.coming[unit],
      need_wip: cell.quantities.need_wip[unit], other: cell.quantities.other[unit],
      total: cell.quantities.total[unit], needCount: cell.needCount,
      isHoliday: cell.isHoliday, isToday: cell.isToday,
    }));
    return { piece: forUnit("piece"), sheet: forUnit("sheet"), lot: forUnit("lot") };
  }, [matrixRows, filters.selectedGate]);
  const chartData = chartDataByUnit[summaryUnit];

  const availableCurrentProcesses = useMemo(() => {
    const processes = new Set<string>();
    for (const row of detailRowsByGate.get(filters.selectedGate) || []) {
      const process = getCurrentProcess(row);
      if (process) processes.add(process);
    }
    return [...processes].sort((a, b) => a.localeCompare(b));
  }, [detailRowsByGate, filters.selectedGate]);

  // Section 3: Include overdue pending arrivals; explicit date filters stay exact.
  const filteredTableRows = useMemo(() => {
    let list = detailRowsByGate.get(filters.selectedGate) || [];

    // If a specific date is selected from matrix/chart
    if (filters.selectedDate) {
      list = (rowsByGate.get(filters.selectedGate) || []).filter((r) => r.arrive_by === filters.selectedDate);
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
  }, [detailRowsByGate, rowsByGate, filters.selectedGate, filters.selectedDate, filters.actionTab, todayStr, statusFilter, currentProcessFilter]);

  // Detail summaries use the exact same aggregation as cards and chart cells.
  const tableStats = useMemo(() => {
    const quantities = summarizeGateQuantities(filteredTableRows);
    return {
      quantities, inGateLots: quantities.in_gate.lot, comingLots: quantities.coming.lot,
      needWipLots: quantities.needCount, totalLots: quantities.total.lot,
      totalPcs: quantities.total.piece,
    };
  }, [filteredTableRows]);

  // Handlers
  const setCategory = useCallback((cat: ProcessGroupFilter) => {
    setCurrentProcessFilter("");
    setFilters((prev) => ({
      ...prev,
      category: cat,
      selectedProduct: "",
      selectedGate: cat === "SMT" ? "MFPC" : "FFPC",
      selectedDate: null,
    }));
  }, []);

  const setPlanWindow = useCallback((pw: PlanWindow) => {
    setFilters((prev) => ({ ...prev, planWindow: pw, selectedDate: null }));
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
    loading: loading || calendar.loading,
    error: error || calendar.error,
    refreshWarning: refreshWarning || calendar.warning || (streamDisconnected
      ? "Live connection interrupted. Displayed data may be out of date. Reconnecting automatically."
      : null),
    rows: baseRows,
    lastUpdated,
    filters,
    todayStr,
    availableGates,
    availableProducts,
    calendarDays,
    gateFlowList,
    matrixRows,
    chartData,
    chartDataByUnit,
    unitMode,
    setUnitMode,
    summaryUnit,
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
    refreshData,
  };
};

export default usePlanningSummaryGate;
