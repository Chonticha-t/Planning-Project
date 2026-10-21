import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import { PO_BALANCE_DISTINCT_PRODUCT_API, PO_BALANCE_SUMMARY_API, PO_BALANCE_TABLE_API } from "./api";
import type { ApiResponse, PlanningFilter, PlanningRow, PlanningSummaryRow } from "../types";

export const EMPTY_FILTER: PlanningFilter = { status: "", prd_name: "", startdate: "", stopdate: "" };

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

      const [table, sum] = await Promise.all([
        axios.get<ApiResponse<PlanningRow[]>>(PO_BALANCE_TABLE_API, { params }),
        axios.get<ApiResponse<PlanningSummaryRow[]>>(PO_BALANCE_SUMMARY_API),
      ]);

      setRows(table.data.data ?? []);
      setSummary(sum.data.data ?? []);
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
