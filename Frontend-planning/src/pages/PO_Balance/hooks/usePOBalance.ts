import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import { PO_BALANCE_DISTINCT_PRODUCT_API, PO_BALANCE_SUMMARY_API, PO_BALANCE_TABLE_API } from "./api";
import type { ApiResponse, PlanningFilter, PlanningRow, PlanningStatus, PlanningSummaryRow } from "../types";

export const EMPTY_FILTER: PlanningFilter = { status: "", prd_name: "", startdate: "", stopdate: "" };

// คำนวณ summary จากแถวข้อมูลที่ถูก filter
export const computeSummaryFromRows = (rows: PlanningRow[]): PlanningSummaryRow[] => {
  const byStatus: Record<
    string,
    {
      total_rows: number;
      products: Set<string>;
      po_bal: number;
      net_required_pcs: number;
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
        updated_at: r.updated_at || "",
      };
    }
    const s = byStatus[r.status];
    s.total_rows += 1;
    s.products.add(r.prd_name);
    s.po_bal += Number(r.po_bal) || 0;
    s.net_required_pcs += Number(r.net_required_pcs) || 0;
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
    updated_at: s.updated_at,
  }));
};

// ดึงข้อมูลตาราง + summary ของหน้า PO Balance
const usePOBalance = () => {
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [summary, setSummary] = useState<PlanningSummaryRow[]>([]);
  const [products, setProducts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (f: PlanningFilter) => {
    setLoading(true);
    try {
      // ส่งเฉพาะ filter ที่มีค่า
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));

      const [table] = await Promise.all([
        axios.get<ApiResponse<PlanningRow[]>>(PO_BALANCE_TABLE_API, { params }),
        // ส่ง params ไปที่ summary API ด้วยสำหรับ backend
        axios.get<ApiResponse<PlanningSummaryRow[]>>(PO_BALANCE_SUMMARY_API, { params }).catch(() => null),
      ]);

      const tableData = table.data.data ?? [];
      setRows(tableData);
      // คำนวณสรุปยอด CardSum ตามข้อมูลที่ filter ได้ทันที ให้ตรงกับตารางเสมอ
      setSummary(computeSummaryFromRows(tableData));
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch data. Please check that the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(EMPTY_FILTER);
  }, [fetchData]);

  // รายชื่อ product สำหรับช่องค้นหา (โหลดครั้งเดียว)
  useEffect(() => {
    axios
      .get<ApiResponse<{ prd_name: string }[]>>(PO_BALANCE_DISTINCT_PRODUCT_API)
      .then((res) => setProducts((res.data.data ?? []).map((r) => r.prd_name).filter(Boolean)))
      .catch((err) => console.error(err));
  }, []);

  return { rows, summary, products, loading, fetchData };
};

export default usePOBalance;
