import React, { useState, useCallback } from "react";
import type { GridSortModel } from "@mui/x-data-grid";
import toast from "react-hot-toast";

import type { PlanningSummaryFilter } from "../types";
import usePlanningSummary, { EMPTY_FILTER } from "../hooks/usePlanningSummary";
import SummaryCards from "../components/SummaryCards";
import FilterBar from "../components/FilterBar";
import PlanningSummaryTable from "../components/PlanningSummaryTable";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import { toDMY } from "../../PO_Balance/utils";

const Planning_Summary: React.FC = () => {
  const [filter, setFilter] = useState<PlanningSummaryFilter>(EMPTY_FILTER);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const { rows, kpi, filtersOptions, loading, fetchData } = usePlanningSummary();

  const handleReset = useCallback(() => {
    setFilter(EMPTY_FILTER);
    setSortModel([]);
    fetchData(EMPTY_FILTER);
  }, [fetchData]);

  const handleSearch = useCallback(
    (f = filter) => {
      fetchData(f);
    },
    [filter, fetchData]
  );

  const handleExport = useCallback(() => {
    if (rows.length === 0) {
      toast("No data to export");
      return;
    }

    exportToExcel({
      fileName: "planning_summary",
      columns: [
        { header: "PRODUCT", key: "prd_name", group: "PLAN OVERVIEW", align: "left" },
        { header: "DUE DATE", key: "due_date", group: "PLAN OVERVIEW", align: "center" },
        { header: "STATUS", key: "status", group: "PLAN OVERVIEW", align: "center" },
        {
          header: "PO BAL",
          key: "po_bal",
          group: "DEMAND & BALANCE",
          align: "center",
          numFmt: "#,##0",
        },
        {
          header: "INVENTORY",
          key: "inventory",
          group: "DEMAND & BALANCE",
          align: "center",
          numFmt: "#,##0",
        },
        {
          header: "NET REQUIRED",
          key: "net_required_pcs",
          group: "DEMAND & BALANCE",
          align: "center",
          numFmt: "#,##0",
        },
        {
          header: "LOT NO",
          key: "lot_no",
          group: "WIP & LOT TRACKING",
          align: "center",
        },
        {
          header: "PROCESS",
          key: "proc_disp",
          group: "WIP & LOT TRACKING",
          align: "left",
        },
        {
          header: "SEQ",
          key: "seq",
          group: "WIP & LOT TRACKING",
          align: "center",
        },
        {
          header: "NET WIP",
          key: "net_wip_qty",
          group: "WIP & LOT TRACKING",
          align: "center",
          numFmt: "#,##0",
        },
        {
          header: "YIELD %",
          key: "yield",
          group: "WIP & LOT TRACKING",
          align: "center",
        },
        {
          header: "FACTORY",
          key: "factory_desc",
          group: "ATTRIBUTES",
          align: "center",
        },
        {
          header: "PRD TYPE",
          key: "prd_type",
          group: "ATTRIBUTES",
          align: "center",
        },
        {
          header: "GATE",
          key: "gate_name",
          group: "ATTRIBUTES",
          align: "center",
        },
        {
          header: "LOT STATUS",
          key: "lot_status",
          group: "ISSUES & REMARKS",
          align: "center",
        },
        {
          header: "LOT PROBLEM",
          key: "lot_problem",
          group: "ISSUES & REMARKS",
          align: "left",
        },
        {
          header: "PENDING REASON",
          key: "pending_reason",
          group: "ISSUES & REMARKS",
          align: "left",
        },
      ],
      data: rows.map((r) => ({
        prd_name: r.prd_name,
        due_date: toDMY(r.due_date),
        status: r.status,
        po_bal: r.po_bal,
        inventory: r.inventory,
        net_required_pcs: r.net_required_pcs,
        lot_no: r.lot_no,
        proc_disp: r.proc_disp,
        seq: r.seq,
        net_wip_qty: r.net_wip_qty,
        yield: r.yield != null ? `${Number(r.yield).toFixed(1)}%` : "",
        factory_desc: r.factory_desc,
        prd_type: r.prd_type,
        gate_name: r.gate_name,
        lot_status: r.lot_status,
        lot_problem: r.lot_problem,
        pending_reason: r.pending_reason,
      })),
    });
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      {/* 1. สรุปภาพรวม KPI Cards */}
      <SummaryCards kpi={kpi} />

      {/* 2. เมนูกรองข้อมูล Filter Bar */}
      <FilterBar
        filter={filter}
        filterOptions={filtersOptions}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        onChange={setFilter}
        onSearch={handleSearch}
        onReset={handleReset}
        onExport={handleExport}
        loading={loading}
      />

      {/* 3. ตารางข้อมูล Planning Summary Table พร้อม Column Grouping */}
      <PlanningSummaryTable
        rows={rows}
        loading={loading}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
      />
    </div>
  );
};

export default Planning_Summary;
