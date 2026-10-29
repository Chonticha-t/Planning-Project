import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import {
  PLANNING_SUMMARY_TABLE_API,
  PLANNING_SUMMARY_FILTERS_API,
  PLANNING_SUMMARY_STREAM_API,
  PLANNING_SUMMARY_SKIP_DUE_API,
  PLANNING_SUMMARY_UNSKIP_DUE_API,
} from "./api";
import type {
  ApiResponse,
  PlanningSummaryFilter,
  PlanningSummaryRow,
  PlanningSummaryKPI,
  DistinctFilters,
} from "../types";
import { toDMY } from "../../PO_Balance/utils";

export const EMPTY_FILTER: PlanningSummaryFilter = {
  prd_name: "",
  status: "",
  priority: "",
  item_prefix: "",
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

// กำหนด Timeout ของแต่ละ Request เพื่อความเสถียร (เหมือนหน้า PO Balance)
const AJAX_TIMEOUT_MS = 10_000;

// คำนวณ KPI จากแถวข้อมูลที่ถูก filter โดยตรง (ลดการยิง API ซ้ำซ้อนและทำให้ตารางกับ KPI อัปเดตพร้อมกัน 100%)
export const computeKPIFromRows = (rows: PlanningSummaryRow[]): PlanningSummaryKPI => {
  const products = new Set<string>();
  const lots = new Set<string>();
  let total_net_required = 0;
  let total_net_wip = 0;
  let urgent_count = 0;
  let high_count = 0;
  let wip_count = 0;
  let hold_count = 0;
  let pending_count = 0;
  let last_updated = "";

  for (const r of rows) {
    if (r.prd_name) products.add(r.prd_name);
    if (r.lot_no && r.lot_no.trim() !== "") lots.add(r.lot_no);

    total_net_required += Number(r.net_required_pcs) || 0;
    total_net_wip += Number(r.net_wip_qty) || 0;

    const prio = (r.priority || "").toUpperCase().trim();
    if (prio === "URGENT" || prio === "P1") urgent_count += 1;
    else if (prio === "HIGH" || prio === "P2") high_count += 1;

    const lStatus = (r.lot_status || "").toUpperCase().trim();
    if (lStatus === "WIP") wip_count += 1;
    else if (lStatus === "HOLD") hold_count += 1;
    else if (lStatus === "PENDING") pending_count += 1;

    if (r.updated_at && (!last_updated || r.updated_at > last_updated)) {
      last_updated = r.updated_at;
    }
  }

  return {
    total_rows: rows.length,
    total_products: products.size,
    total_lots: lots.size,
    total_net_required,
    total_net_wip,
    urgent_count,
    high_count,
    wip_count,
    hold_count,
    pending_count,
    ...(last_updated ? { last_updated } : {}),
  };
};

// ดึงข้อมูลตาราง + KPI ของหน้า Planning Summary ด้วย SSE (Server-Sent Events) แบบ Real-time เหมือนหน้า PO Balance
export const usePlanningSummary = () => {
  const [rows, setRows] = useState<PlanningSummaryRow[]>([]);
  const [kpi, setKpi] = useState<PlanningSummaryKPI>(INITIAL_KPI);
  const [filtersOptions, setFiltersOptions] = useState<DistinctFilters>({
    products: [],
    lot_nos: [],
    statuses: [],
    priorities: [],
    lot_statuses: [],
    factories: [],
  });
  const [loading, setLoading] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);

  const activeFilterRef = useRef<PlanningSummaryFilter>(EMPTY_FILTER);
  const lastRowsJsonRef = useRef<string>("");
  const lastFiltersJsonRef = useRef<string>("");
  const lastItemPrefixRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const filtersAbortRef = useRef<AbortController | null>(null);

  // ดึงค่า Distinct สำหรับ Dropdowns (รองรับการกรองตาม item_prefix เหมือนหน้า PO Balance)
  const fetchFilterOptions = useCallback(async (item_prefix = "") => {
    filtersAbortRef.current?.abort();
    const controller = new AbortController();
    filtersAbortRef.current = controller;

    try {
      const res = await axios.get<ApiResponse<DistinctFilters>>(
        PLANNING_SUMMARY_FILTERS_API,
        {
          params: { ...(item_prefix ? { item_prefix } : {}), _t: Date.now() },
          timeout: AJAX_TIMEOUT_MS,
          signal: controller.signal,
        }
      );
      lastItemPrefixRef.current = item_prefix;
      if (res.data?.status === "OK" && res.data.data) {
        const nextFilters: DistinctFilters = {
          ...res.data.data,
          statuses: (res.data.data.statuses || []).filter(
            (s) => s.toLowerCase() !== "ready"
          ),
        };
        const nextFiltersJson = JSON.stringify(nextFilters);
        if (nextFiltersJson !== lastFiltersJsonRef.current) {
          lastFiltersJsonRef.current = nextFiltersJson;
          setFiltersOptions(nextFilters);
        }
      }
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error("Failed to fetch filter options:", err);
      }
    }
  }, []);

  // ดึงข้อมูลหลัก (ตาราง + คำนวณ KPI อัตโนมัติ) รองรับโหมด silent สำหรับ Background Refresh
  const fetchData = useCallback(
    async (f: PlanningSummaryFilter = EMPTY_FILTER, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      activeFilterRef.current = f;

      // ถ้ายิงค้นหาใหม่ด้วยตัวเอง ให้ยกเลิก Request เก่าที่อาจค้างอยู่ทันที
      if (!silent && abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isFetchingRef.current = true;

      if (!silent) {
        setLoading(true);
      }

      const currentPrefix = f.item_prefix || "";
      if (lastItemPrefixRef.current !== currentPrefix) {
        fetchFilterOptions(currentPrefix);
      }

      try {
        // ส่งเฉพาะ filter ที่มีค่า พร้อม _t ป้องกัน Browser/Proxy จำค่าเก่า (Cache)
        const filterParams = Object.fromEntries(
          Object.entries(f).filter(([, v]) => v !== undefined && v !== "")
        );
        const params = { ...filterParams, _t: Date.now() };

        const tableRes = await axios.get<ApiResponse<PlanningSummaryRow[]>>(
          PLANNING_SUMMARY_TABLE_API,
          {
            params,
            signal: controller.signal,
            timeout: AJAX_TIMEOUT_MS,
          }
        );

        if (tableRes.data?.status === "OK") {
          const rawData = (tableRes.data.data ?? []).filter(
            (r) => r.status?.toLowerCase() !== "ready"
          );
          const filteredByPrefix = currentPrefix
            ? rawData.filter((r) => !r.item || r.item.trim().startsWith(currentPrefix))
            : rawData;

          const tableData = filteredByPrefix.map((row, idx) => ({
            ...row,
            id: `${row.prd_name}|${row.due_date}|${row.lot_no || ""}|${row.seq ?? ""}|${idx}`,
          }));

          const nextJson = JSON.stringify(tableData);

          // อัปเดต State เฉพาะเมื่อข้อมูลในตารางมีการเปลี่ยนแปลงจริง หรือเป็นการกดค้นหาใหม่
          if (!silent || nextJson !== lastRowsJsonRef.current) {
            lastRowsJsonRef.current = nextJson;
            setRows(tableData);
            setKpi(computeKPIFromRows(tableData));
            if (silent) {
              fetchFilterOptions(currentPrefix);
            }
          }
        } else if (!silent) {
          toast.error(tableRes.data?.message || "Failed to load table data");
        }
      } catch (err: unknown) {
        if (axios.isCancel(err)) return;
        console.error("Error fetching planning summary:", err);
        if (!silent) {
          const msg = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
          toast.error(msg || "Failed to fetch data. Please check that the backend is running.");
        }
      } finally {
        if (abortControllerRef.current === controller) {
          isFetchingRef.current = false;
        }
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [fetchFilterOptions]
  );

  // กดปุ่ม Skip Due เพื่อย้าย Lot ที่ติด PENDING ข้ามไป Due Date ถัดไปที่ใกล้ที่สุด
  const skipLotDueDate = useCallback(
    async (row: PlanningSummaryRow) => {
      const toastId = toast.loading(`Skipping Due Date for Lot ${row.lot_no}...`);
      try {
        const res = await axios.post<
          ApiResponse<{
            prd_name: string;
            lot_no: string;
            skipped_due_date: string;
            new_due_date: string | null;
          }>
        >(
          PLANNING_SUMMARY_SKIP_DUE_API,
          {
            prd_name: row.prd_name,
            lot_no: row.lot_no,
            due_date: row.due_date,
            seq: row.seq,
            process: row.proc_disp,
          },
          { timeout: AJAX_TIMEOUT_MS }
        );

        if (res.data?.status === "OK") {
          const newDue = res.data.data?.new_due_date;
          toast.success(
            newDue
              ? `Skipped Lot ${row.lot_no} from ${toDMY(row.due_date)} to Due Date ${toDMY(newDue)}`
              : `Skipped Lot ${row.lot_no} (${toDMY(row.due_date)}) — waiting for next Due Date`,
            { id: toastId, duration: 4000 }
          );
          await fetchData(activeFilterRef.current, { silent: true });
        } else {
          toast.error(res.data?.message || "Failed to skip Due Date", {
            id: toastId,
          });
        }
      } catch (err) {
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.message
          : undefined;
        toast.error(msg || "Error skipping Due Date", { id: toastId });
      }
    },
    [fetchData]
  );

  // กดปุ่ม Undo Skip เพื่อคืนค่า Lot กลับไป Due Date เดิมตามลำดับ FIFO
  const unskipLotDueDate = useCallback(
    async (row: PlanningSummaryRow) => {
      const toastId = toast.loading(`Restoring Due Date for Lot ${row.lot_no}...`);
      try {
        const res = await axios.post<
          ApiResponse<{
            prd_name: string;
            lot_no: string;
            restored_due_date: string | null;
          }>
        >(
          PLANNING_SUMMARY_UNSKIP_DUE_API,
          {
            prd_name: row.prd_name,
            lot_no: row.lot_no,
          },
          { timeout: AJAX_TIMEOUT_MS }
        );

        if (res.data?.status === "OK") {
          const restoredDue = res.data.data?.restored_due_date;
          toast.success(
            restoredDue
              ? `Restored Lot ${row.lot_no} back to Due Date ${toDMY(restoredDue)}`
              : `Restored Lot ${row.lot_no}`,
            { id: toastId, duration: 4000 }
          );
          await fetchData(activeFilterRef.current, { silent: true });
        } else {
          toast.error(res.data?.message || "Failed to undo Skip Due", {
            id: toastId,
          });
        }
      } catch (err) {
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.message
          : undefined;
        toast.error(msg || "Error restoring Due Date", { id: toastId });
      }
    },
    [fetchData]
  );

  // โหลดข้อมูลครั้งแรก
  useEffect(() => {
    fetchData(EMPTY_FILTER);

    return () => {
      abortControllerRef.current?.abort();
      filtersAbortRef.current?.abort();
    };
  }, [fetchData]);

  // เชื่อมต่อ SSE Stream: รับการแจ้งเตือนจาก Backend เมื่อ Database เปลี่ยนจริง (เหมือนหน้า PO Balance)
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isSubscribed = true;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(PLANNING_SUMMARY_STREAM_API);

        eventSource.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "PLANNING_SUMMARY_UPDATED") {
              // ดึงข้อมูลใหม่แบบเงียบๆ ทันทีที่ Backend ส่งสัญญาณ
              setDbVersion((v) => v + 1);
              fetchData(activeFilterRef.current, { silent: true });
            }
          } catch {
            // ignore non-json messages (heartbeats)
          }
        };

        eventSource.onerror = () => {
          // Browser จะพยายามต่อ SSE ใหม่อัตโนมัติเมื่อเกิดข้อผิดพลาด
        };
      } catch (err) {
        console.error("SSE Connection Error:", err);
      }
    };

    connectSSE();

    // ดึงข้อมูลใหม่เฉพาะเมื่อสลับแท็บกลับมาที่หน้าเว็บ (Visibility Change) หรือกลับมา Online — ไม่ใช้ window focus เพื่อป้องกัน Card กระพริบ
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setDbVersion((v) => v + 1);
        fetchData(activeFilterRef.current, { silent: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);

    return () => {
      isSubscribed = false;
      eventSource?.close();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
    };
  }, [fetchData]);

  return {
    rows,
    kpi,
    filtersOptions,
    loading,
    fetchData,
    fetchFilterOptions,
    skipLotDueDate,
    unskipLotDueDate,
    dbVersion,
  };
};

export default usePlanningSummary;
