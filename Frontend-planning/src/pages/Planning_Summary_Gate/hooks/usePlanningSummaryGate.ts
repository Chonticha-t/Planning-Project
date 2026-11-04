import { useState, useEffect, useMemo, useCallback, useRef, useDeferredValue } from "react";
import axios from "axios";
import dayjs from "dayjs";
import {
  PLANNING_SUMMARY_GATE_TABLE_API,
  PLANNING_SUMMARY_GATE_SUMMARY_API,
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
} from "../types";

const DEFAULT_GATES_FPC = ["FFPC", "FVAC", "FADL", "FIN", "W/H"];
const DEFAULT_GATES_SMT = ["SMT", "FADL", "FIN", "W/H"];

export const usePlanningSummaryGate = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [rows, setRows] = useState<PlanningSummaryGateRow[]>([]);
  const [kpis, setKpis] = useState<GateKpiSummary[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string>(() => dayjs().format("DD/MM/YYYY HH:mm"));

  const [filters, setFilters] = useState<GateFilterState>({
    category: "FPC",
    planWindow: "2w",
    skipHolidays: true,
    search: "",
    selectedGate: "FFPC",
    selectedDate: null,
    actionTab: "all",
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch data
  const fetchData = useCallback(async () => {
    setLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const [tableRes, summaryRes] = await Promise.all([
        axios.get<{ status: string; data: PlanningSummaryGateRow[] }>(
          PLANNING_SUMMARY_GATE_TABLE_API,
          {
            params: {
              prd_category: filters.category === "ALL" ? undefined : filters.category,
            },
            signal: abortControllerRef.current.signal,
            timeout: 6000,
          }
        ),
        axios.get<{ status: string; data: GateKpiSummary[] }>(
          PLANNING_SUMMARY_GATE_SUMMARY_API,
          {
            params: {
              prd_category: filters.category === "ALL" ? undefined : filters.category,
            },
            signal: abortControllerRef.current.signal,
            timeout: 6000,
          }
        ),
      ]);

      if (tableRes.data?.data) {
        setRows(tableRes.data.data);
      }
      if (summaryRes.data?.data) {
        setKpis(summaryRes.data.data);
      }
      setLastUpdated(dayjs().format("DD/MM/YYYY HH:mm"));
    } catch (err: any) {
      if (axios.isCancel(err)) return;
      console.warn("Could not fetch planning_summary_gate:", err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.category]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Distinct gates based on category and data (deduplicated & canonical ordered)
  const availableGates = useMemo(() => {
    const defaultGates = filters.category === "SMT" ? DEFAULT_GATES_SMT : DEFAULT_GATES_FPC;
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

  // Ensure selectedGate is valid when availableGates change
  useEffect(() => {
    if (!availableGates.includes(filters.selectedGate) && availableGates.length > 0) {
      setFilters((prev) => ({ ...prev, selectedGate: availableGates[0] }));
    }
  }, [availableGates, filters.selectedGate]);

  // Base Anchor Date for calendar columns = Real Current Date
  const todayStr = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const todayDisplay = useMemo(() => dayjs().format("DD/MM"), []);

  // Collect any skipped_holidays from backend rows
  const holidaySet = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const sh = rows[i].skipped_holidays;
      if (Array.isArray(sh)) {
        for (let j = 0; j < sh.length; j++) {
          if (sh[j]) set.add(String(sh[j]).slice(0, 10));
        }
      }
    }
    return set;
  }, [rows]);

  // Days list for plan window (14 days for 2w, 28 days for 1m) starting after Today
  const calendarDays = useMemo(() => {
    const count = filters.planWindow === "2w" ? 14 : 28;
    const days: { dateStr: string; dayName: string; dateDisplay: string; isToday: boolean; isHoliday: boolean }[] = [];
    const base = dayjs(todayStr);

    for (let i = 1; i <= count; i++) {
      const d = base.add(i, "day");
      const dateStr = d.format("YYYY-MM-DD");
      const dayOfWeek = d.day(); // 0 is Sun, 6 is Sat
      const isHoliday = dayOfWeek === 0 || dayOfWeek === 6 || holidaySet.has(dateStr);
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

  // Pre-index rows by gate_name in a single O(N) pass
  const rowsByGate = useMemo(() => {
    const map = new Map<string, PlanningSummaryGateRow[]>();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      let arr = map.get(r.gate_name);
      if (!arr) {
        arr = [];
        map.set(r.gate_name, arr);
      }
      arr.push(r);
    }
    return map;
  }, [rows]);

  // Aggregated Gate Flow KPIs (Section 1) - O(N) single pass matching todayStr
  const gateFlowList = useMemo(() => {
    return availableGates.map((gName, idx) => {
      const gateRows = rowsByGate.get(gName) || [];
      if (gateRows.length > 0) {
        let inGateCount = 0;
        let inGateQty = 0;
        let coming3dCount = 0;
        let needWipCount = 0;
        let mustOutTodayCount = 0;
        let holdCount = 0;

        for (let i = 0; i < gateRows.length; i++) {
          const r = gateRows[i];
          if (r.gate_state === "in_gate") {
            inGateCount++;
            inGateQty += Number(r.qty) || 0;
          }
          if (r.is_coming_3d || r.gate_state === "coming") coming3dCount++;
          if (r.gate_state === "need_wip" || r.status?.toLowerCase() === "need wip") needWipCount++;
          if (r.must_out === todayStr) mustOutTodayCount++;
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
  }, [availableGates, kpis, rowsByGate, todayStr]);

  // Section 2: Gate Matrix rows (Heatmap by Gate and Date) - Single O(N) pass per gate
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

        if (r.must_out === todayStr) {
          todayLotsCount++;
          if (isNeed) todayNeedCount++;
          if (isInGate) todayInGateCount++;
          if (isComing) todayComingCount++;
        }

        if (r.must_out) {
          let b = dateBuckets.get(r.must_out);
          if (!b) {
            b = { lotsCount: 0, needCount: 0, inGateCount: 0, comingCount: 0 };
            dateBuckets.set(r.must_out, b);
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

      const todayDow = dayjs(todayStr).day();
      const todayCell: MatrixDayCell = {
        dateStr: todayStr,
        dayName: "TODAY",
        dateDisplay: todayDisplay,
        isToday: true,
        isHoliday: todayDow === 0 || todayDow === 6 || holidaySet.has(todayStr),
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
      });
    });

    return list;
  }, [matrixRows, filters.selectedGate, todayStr]);

  // Section 3: Filtered Action Table Rows (From Today onwards)
  const filteredTableRows = useMemo(() => {
    let list = (rowsByGate.get(filters.selectedGate) || []).filter(
      (r) => !r.must_out || r.must_out >= todayStr
    );

    // If a specific date is selected from matrix/chart
    if (filters.selectedDate) {
      list = list.filter((r) => r.must_out === filters.selectedDate);
    } else if (filters.actionTab === "today") {
      list = list.filter((r) => r.must_out === todayStr);
    } else if (filters.actionTab === "in_gate") {
      list = list.filter((r) => r.gate_state === "in_gate");
    } else if (filters.actionTab === "need_wip") {
      list = list.filter((r) => r.gate_state === "need_wip");
    }

    // Search filter using deferredSearch so typing never lags
    if (deferredSearch.trim()) {
      const q = deferredSearch.toLowerCase().trim();
      list = list.filter(
        (r) =>
          (r.prd_name && r.prd_name.toLowerCase().includes(q)) ||
          (r.lot_no && r.lot_no.toLowerCase().includes(q)) ||
          (r.item && r.item.toLowerCase().includes(q)) ||
          (r.status && r.status.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => (a.pri || 9999) - (b.pri || 9999));
  }, [rowsByGate, filters.selectedGate, filters.selectedDate, filters.actionTab, deferredSearch, todayStr]);

  // Bottom Summary stats for Section 3 (Single O(K) pass)
  const tableStats = useMemo(() => {
    const gateRows = rowsByGate.get(filters.selectedGate) || [];
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
  }, [rowsByGate, filters.selectedGate]);

  // Handlers
  const setCategory = useCallback((cat: PrdCategory) => {
    setFilters((prev) => ({
      ...prev,
      category: cat,
      selectedGate: cat === "SMT" ? "SMT" : "FFPC",
      selectedDate: null,
    }));
  }, []);

  const setPlanWindow = useCallback((pw: PlanWindow) => {
    setFilters((prev) => ({ ...prev, planWindow: pw }));
  }, []);

  const toggleSkipHolidays = useCallback(() => {
    setFilters((prev) => ({ ...prev, skipHolidays: !prev.skipHolidays }));
  }, []);

  const setSearch = useCallback((val: string) => {
    setFilters((prev) => ({ ...prev, search: val }));
  }, []);

  const selectGate = useCallback((gName: string) => {
    setFilters((prev) => ({ ...prev, selectedGate: gName, selectedDate: null }));
  }, []);

  const selectDate = useCallback((dateStr: string | null) => {
    setFilters((prev) => ({ ...prev, selectedDate: dateStr }));
  }, []);

  const setActionTab = useCallback((tab: "all" | "today" | "in_gate" | "need_wip") => {
    setFilters((prev) => ({ ...prev, actionTab: tab, selectedDate: null }));
  }, []);

  return {
    loading,
    rows,
    kpis,
    lastUpdated,
    filters,
    availableGates,
    calendarDays,
    gateFlowList,
    matrixRows,
    chartData,
    filteredTableRows,
    tableStats,
    setCategory,
    setPlanWindow,
    toggleSkipHolidays,
    setSearch,
    selectGate,
    selectDate,
    setActionTab,
    refreshData: fetchData,
  };
};

export default usePlanningSummaryGate;
