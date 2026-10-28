import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import {
  PO_BALANCE_DISTINCT_PRODUCT_API,
  PO_BALANCE_STREAM_API,
  PO_BALANCE_SUMMARY_API,
  PO_BALANCE_TABLE_API,
} from "./api";
import type { ApiResponse, PlanningFilter, PlanningRow, PlanningStatus, PlanningSummaryRow } from "../types";

export const EMPTY_FILTER: PlanningFilter = {
  status: "",
  prd_name: "",
  startdate: "",
  stopdate: "",
  item_prefix: "",
};

// กำหนด Timeout ของแต่ละ Request เพื่อความเสถียร
const AJAX_TIMEOUT_MS = 10_000;

// คำนวณ summary จากแถวข้อมูลที่ถูก filter
export const computeSummaryFromRows = (rows: PlanningRow[]): PlanningSummaryRow[] => {
  const byStatus: Record<
    string,
    {
      total_rows: number;
      products: Set<string>;
      po_bal: number;
      net_required_pcs: number;
      wh_fg_amount: number;
      output_amount: number;
      updated_at: string;
    }
  > = {};

  for (const r of rows) {
    if (!byStatus[r.status]) {
      byStatus[r.status] = {
        total_rows: 0,
        products: new Set(),
        po_bal: 0,
        net_required_pcs: 0,
        wh_fg_amount: 0,
        output_amount: 0,
        updated_at: r.updated_at || "",
      };
    }
    const s = byStatus[r.status];
    s.total_rows += 1;
    s.products.add(r.prd_name);
    s.po_bal += Number(r.po_bal) || 0;
    s.net_required_pcs += Number(r.net_required_pcs) || 0;
    s.wh_fg_amount += Number(r.wh_fg_amount) || 0;
    s.output_amount += Number(r.output_amount) || 0;
    if (r.updated_at && (!s.updated_at || r.updated_at > s.updated_at)) {
      s.updated_at = r.updated_at;
    }
  }

  return Object.entries(byStatus).map(([status, s]) => ({
    status: status as PlanningStatus,
    total_rows: s.total_rows,
    total_products: s.products.size,
    po_bal: s.po_bal,
    net_required_pcs: s.net_required_pcs,
    wh_fg_amount: s.wh_fg_amount,
    output_amount: s.output_amount,
    updated_at: s.updated_at,
  }));
};

// ดึงข้อมูลตาราง + summary ของหน้า PO Balance ด้วย SSE (Server-Sent Events) แบบ Real-time โดยไม่ยิง API รัวๆ
const usePOBalance = () => {
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [summary, setSummary] = useState<PlanningSummaryRow[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [dbVersion, setDbVersion] = useState(0);

  const activeFilterRef = useRef<PlanningFilter>(EMPTY_FILTER);
  const lastRowsJsonRef = useRef<string>("");
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProducts = useCallback(async (item_prefix?: string, signal?: AbortSignal) => {
    try {
      const res = await axios.get<ApiResponse<{ prd_name: string }[]>>(PO_BALANCE_DISTINCT_PRODUCT_API, {
        params: { ...(item_prefix ? { item_prefix } : {}), _t: Date.now() },
        timeout: AJAX_TIMEOUT_MS,
        signal,
      });
      const nextProducts = (res.data.data ?? []).map((r) => r.prd_name).filter(Boolean);
      setProducts((prev) =>
        prev.length === nextProducts.length && prev.every((p, i) => p === nextProducts[i])
          ? prev
          : nextProducts,
      );
    } catch (err) {
      if (!axios.isCancel(err)) {
        console.error(err);
      }
    }
  }, []);

  const fetchData = useCallback(
    async (f: PlanningFilter, options?: { silent?: boolean }) => {
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

      try {
        // ส่งเฉพาะ filter ที่มีค่า พร้อม _t ป้องกัน Browser/Proxy จำค่าเก่า (Cache)
        const filterParams = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));
        const params = { ...filterParams, _t: Date.now() };

        const [table] = await Promise.all([
          axios.get<ApiResponse<PlanningRow[]>>(PO_BALANCE_TABLE_API, {
            params,
            timeout: AJAX_TIMEOUT_MS,
            signal: controller.signal,
          }),
          // เรียก summary เฉพาะตอนโหลดครั้งแรกหรือกดค้นหา
          !silent
            ? axios
                .get<ApiResponse<PlanningSummaryRow[]>>(PO_BALANCE_SUMMARY_API, {
                  params,
                  timeout: AJAX_TIMEOUT_MS,
                  signal: controller.signal,
                })
                .catch(() => null)
            : Promise.resolve(null),
        ]);

        const rawData = table.data.data ?? [];
        const tableData = f.item_prefix
          ? rawData.filter((r) => !r.item || r.item.trim().startsWith(f.item_prefix))
          : rawData;
        const nextJson = JSON.stringify(tableData);

        // อัปเดต State เฉพาะเมื่อข้อมูลในตารางมีการเปลี่ยนแปลงจริง หรือเป็นการกดค้นหาใหม่
        if (!silent || nextJson !== lastRowsJsonRef.current) {
          lastRowsJsonRef.current = nextJson;
          setRows(tableData);
          setSummary(computeSummaryFromRows(tableData));
          fetchProducts(f.item_prefix);
        }
      } catch (err) {
        if (axios.isCancel(err)) return;
        console.error(err);
        if (!silent) {
          toast.error("Failed to fetch data. Please check that the backend is running.");
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
    [fetchProducts],
  );

  // โหลดข้อมูลครั้งแรก
  useEffect(() => {
    fetchData(EMPTY_FILTER);
    fetchProducts();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [fetchData, fetchProducts]);

  // เชื่อมต่อ SSE Stream: รับการแจ้งเตือนจาก Backend เมื่อ Database เปลี่ยนจริง
  useEffect(() => {
    let eventSource: EventSource | null = null;
    let isSubscribed = true;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(PO_BALANCE_STREAM_API);

        eventSource.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === "PO_BALANCE_UPDATED") {
              // ดึงข้อมูลใหม่แบบเงียบๆ ทันทีที่ Backend ส่งสัญญาณ พร้อมอัปเดตเวอร์ชันให้เคลียร์แคช
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

    // ดึงข้อมูลใหม่เฉพาะเมื่อสลับแท็บกลับมาที่หน้าเว็บ (Visibility Change) — ไม่ใช้ window focus เพื่อป้องกัน Card กระพริบเวลาเปิด/ปิด Modal
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

  return { rows, summary, products, loading, fetchData, dbVersion };
};

export default usePOBalance;
