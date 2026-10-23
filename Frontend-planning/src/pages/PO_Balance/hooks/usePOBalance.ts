import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import {
  PO_BALANCE_DISTINCT_PRODUCT_API,
  PO_BALANCE_SUMMARY_API,
  PO_BALANCE_TABLE_API,
} from "./api";
import type { ApiResponse, PlanningFilter, PlanningRow, PlanningStatus, PlanningSummaryRow } from "../types";

export const EMPTY_FILTER: PlanningFilter = { status: "", prd_name: "", startdate: "", stopdate: "" };

// ความถี่ในการซิงค์ข้อมูลจาก Database ผ่าน AJAX แบบ Real-time (3 วินาที)
const AUTO_REFRESH_MS = 3_000;
// กำหนด Timeout ของแต่ละ Request เพื่อป้องกัน Request ค้างเมื่อเปิดรันงานทิ้งไว้ยาวๆ
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

// ดึงข้อมูลตาราง + summary ของหน้า PO Balance ด้วย AJAX เต็มรูปแบบ (อัปเดต Real-time โดยไม่รีเฟรชหน้า)
const usePOBalance = () => {
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [summary, setSummary] = useState<PlanningSummaryRow[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const activeFilterRef = useRef<PlanningFilter>(EMPTY_FILTER);
  const lastRowsJsonRef = useRef<string>("");
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchProducts = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await axios.get<ApiResponse<{ prd_name: string }[]>>(PO_BALANCE_DISTINCT_PRODUCT_API, {
        params: { _t: Date.now() },
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
          // เรียก summary เฉพาะตอนโหลดหลักหรือกดค้นหา
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

        const tableData = table.data.data ?? [];
        const nextJson = JSON.stringify(tableData);

        // อัปเดต State เฉพาะเมื่อข้อมูลในตารางมีการเปลี่ยนแปลงจริง หรือเป็นการกดค้นหาใหม่
        if (!silent || nextJson !== lastRowsJsonRef.current) {
          lastRowsJsonRef.current = nextJson;
          setRows(tableData);
          setSummary(computeSummaryFromRows(tableData));
          if (silent) {
            fetchProducts();
          }
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

  // ระบบ AJAX Polling แบบ Real-time ดึงและเช็คข้อมูลตารางโดยตรงทุก 3 วินาที
  useEffect(() => {
    const syncTableSilently = () => {
      if (document.visibilityState !== "visible" || isFetchingRef.current) {
        return;
      }
      fetchData(activeFilterRef.current, { silent: true });
    };

    const intervalId = window.setInterval(syncTableSilently, AUTO_REFRESH_MS);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncTableSilently();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleVisibilityOrFocus);
    };
  }, [fetchData]);

  return { rows, summary, products, loading, fetchData };
};

export default usePOBalance;
