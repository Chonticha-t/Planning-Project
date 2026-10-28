import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import {
  PLANNING_SUMMARY_TABLE_API,
  PLANNING_SUMMARY_KPI_API,
  PLANNING_SUMMARY_FILTERS_API,
} from "./api";
import type {
  ApiResponse,
  PlanningSummaryFilter,
  PlanningSummaryRow,
  PlanningSummaryKPI,
  DistinctFilters,
} from "../types";

export const EMPTY_FILTER: PlanningSummaryFilter = {
  prd_name: "",
  status: "",
  lot_status: "",
  factory_desc: "",
  startdate: "",
  stopdate: "",
};

export const INITIAL_KPI: PlanningSummaryKPI = {
  total_rows: 0,
  total_products: 0,
  total_lots: 0,
  total_net_required: 0,
  total_net_wip: 0,
  urgent_count: 0,
  high_count: 0,
  wip_count: 0,
  hold_count: 0,
  pending_count: 0,
};

const AJAX_TIMEOUT_MS = 15_000;

export const usePlanningSummary = () => {
  const [rows, setRows] = useState<PlanningSummaryRow[]>([]);
  const [kpi, setKpi] = useState<PlanningSummaryKPI>(INITIAL_KPI);
  const [filtersOptions, setFiltersOptions] = useState<DistinctFilters>({
    products: [],
    statuses: [],
    lot_statuses: [],
    factories: [],
  });
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ดึงค่า Distinct สำหรับ Dropdowns
  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await axios.get<ApiResponse<DistinctFilters>>(
        PLANNING_SUMMARY_FILTERS_API,
        { timeout: AJAX_TIMEOUT_MS }
      );
      if (res.data?.status === "OK" && res.data.data) {
        setFiltersOptions({
          ...res.data.data,
          statuses: (res.data.data.statuses || []).filter(
            (s) => s.toLowerCase() !== "ready"
          ),
        });
      }
    } catch (err) {
      console.error("Failed to fetch filter options:", err);
    }
  }, []);

  // ดึงข้อมูลหลัก (ตาราง + KPI)
  const fetchData = useCallback(async (f: PlanningSummaryFilter = EMPTY_FILTER) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    const params: Record<string, string> = {};
    if (f.prd_name) params.prd_name = f.prd_name;
    if (f.status) params.status = f.status;
    if (f.priority) params.priority = f.priority;
    if (f.item_prefix) params.item_prefix = f.item_prefix;
    if (f.lot_status) params.lot_status = f.lot_status;
    if (f.factory_desc) params.factory_desc = f.factory_desc;
    if (f.startdate) params.startdate = f.startdate;
    if (f.stopdate) params.stopdate = f.stopdate;

    try {
      const [tableRes, kpiRes] = await Promise.all([
        axios.get<ApiResponse<PlanningSummaryRow[]>>(PLANNING_SUMMARY_TABLE_API, {
          params,
          signal: controller.signal,
          timeout: AJAX_TIMEOUT_MS,
        }),
        axios.get<ApiResponse<PlanningSummaryKPI>>(PLANNING_SUMMARY_KPI_API, {
          params,
          signal: controller.signal,
          timeout: AJAX_TIMEOUT_MS,
        }),
      ]);

      if (tableRes.data?.status === "OK") {
        const nonReadyRows = (tableRes.data.data || []).filter(
          (r) => r.status?.toLowerCase() !== "ready"
        );
        setRows(
          nonReadyRows.map((row, idx) => ({
            ...row,
            id: row.id ?? `${row.prd_name}_${row.due_date}_${row.lot_no}_${idx}`,
          }))
        );
      } else {
        toast.error(tableRes.data?.message || "Failed to load table data");
      }

      if (kpiRes.data?.status === "OK") {
        setKpi(kpiRes.data.data || INITIAL_KPI);
      }
    } catch (err: any) {
      if (axios.isCancel(err)) return;
      console.error("Error fetching planning summary:", err);
      toast.error(err?.response?.data?.message || "Error fetching Planning Summary data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
    fetchData(EMPTY_FILTER);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchFilterOptions, fetchData]);

  return {
    rows,
    kpi,
    filtersOptions,
    loading,
    fetchData,
    fetchFilterOptions,
  };
};

export default usePlanningSummary;

