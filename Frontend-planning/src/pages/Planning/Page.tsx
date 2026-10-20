import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

import { PLANNING_SUMMARY_API, PLANNING_TABLE_API } from "./api/config";
import type { ApiResponse, PlanningFilter, PlanningRow, PlanningSummaryRow } from "./types";
import SummaryCards from "./components/SummaryCards";
import FilterBar from "./components/FilterBar";
import PlanningTable from "./components/PlanningTable";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";

const EMPTY_FILTER: PlanningFilter = { status: "", prd_name: "", startdate: "", stopdate: "" };

const Planning = () => {
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_FILTER);
  const [rows, setRows] = useState<PlanningRow[]>([]);
  const [summary, setSummary] = useState<PlanningSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (f: PlanningFilter) => {
    setLoading(true);
    try {
      // ส่งเฉพาะ filter ที่มีค่า
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ""));

      const [table, sum] = await Promise.all([
        axios.get<ApiResponse<PlanningRow[]>>(PLANNING_TABLE_API, { params }),
        axios.get<ApiResponse<PlanningSummaryRow[]>>(PLANNING_SUMMARY_API),
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

  const handleReset = () => {
    setFilter(EMPTY_FILTER);
    fetchData(EMPTY_FILTER);
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast("No data to export");
      return;
    }
    exportToExcel({
      fileName: "production_plan",
      data: rows.map((r) => ({
        Product: r.prd_name,
        "Due Date": r.due_date,
        "PO Bal": r.po_bal,
        Unmovement: r.unmovement,
        "F/G": r.f_g,
        "Ship (pcs)": r.ship_pcs,
        "Net Required": r.net_required_pcs,
        "Rem Unmove": r.rem_unmovement,
        "Rem F/G": r.rem_fg,
        Status: r.status,
      })),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <SummaryCards summary={summary} />
      <FilterBar
        filter={filter}
        onChange={setFilter}
        onSearch={() => fetchData(filter)}
        onReset={handleReset}
        onExport={handleExport}
        loading={loading}
      />
      <PlanningTable rows={rows} loading={loading} />
    </div>
  );
};

export default Planning;
