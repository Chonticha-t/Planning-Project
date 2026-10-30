import React, { useState, useCallback } from "react";
import type { GridSortModel } from "@mui/x-data-grid";
import toast from "react-hot-toast";

import type { PlanningSummaryFilter } from "../types";
import usePlanningSummary, { EMPTY_FILTER } from "../hooks/usePlanningSummary";
import SummaryCards from "../components/SummaryCards";
import FilterBar from "../components/FilterBar";
import PlanningSummaryTable, {
  formatScanWip,
} from "../components/PlanningSummaryTable";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import { toDMY } from "../../PO_Balance/utils";

const Planning_Summary: React.FC = () => {
  const [filter, setFilter] = useState<PlanningSummaryFilter>(EMPTY_FILTER);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const {
    rows,
    kpi,
    filtersOptions,
    loading,
    fetchData,
    skipLotDueDate,
    unskipLotDueDate,
  } = usePlanningSummary();

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
        { header: "PRODUCT", key: "prd_name", align: "left" },
        { header: "DUE DATE", key: "due_date", align: "center" },
        { header: "TARGET SHIP P1", key: "ship_to_p1", align: "center" },
        { header: "PRIORITY", key: "priority", align: "center" },
        {
          header: "DAY LEFT",
          key: "day_left",
          align: "center",
          numFmt: "#,##0",
        },
        { header: "STATUS", key: "status", align: "center" },
        {
          header: "NET REQUIRED",
          key: "cal_net_required",
          align: "center",
          numFmt: "#,##0",
        },
        {
          header: "LOT NO",
          key: "lot_no",
          align: "center",
        },
        {
          header: "NET WIP",
          key: "net_wip_qty",
          align: "center",
          numFmt: "#,##0",
        },
        {
          header: "PROCESS",
          key: "proc_disp",
          align: "left",
        },
        {
          header: "SCAN WIP FFPC",
          key: "scan_in",
          align: "center",
        },
        {
          header: "LOT STATUS",
          key: "lot_status",
          align: "center",
        },
      ],
      data: rows.map((r) => ({
        prd_name: r.prd_name,
        due_date: toDMY(r.due_date),
        ship_to_p1: r.ship_to_p1 ? toDMY(r.ship_to_p1) : "",
        priority: r.priority || "",
        day_left: r.day_left ?? "",
        status: r.status,
        cal_net_required: r.cal_net_required,
        lot_no: r.lot_no,
        net_wip_qty: r.net_wip_qty,
        proc_disp: r.proc_disp
          ? r.gate_name
            ? `${r.proc_disp} (${r.gate_name})`
            : r.proc_disp
          : r.gate_name
          ? `(${r.gate_name})`
          : "",
        scan_in: r.scan_in ? formatScanWip(r.scan_in) : "",
        lot_status: r.lot_status,
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
        onExport={handleExport}
        onSkipDue={skipLotDueDate}
        onUnskipDue={unskipLotDueDate}
      />
    </div>
  );
};

export default Planning_Summary;
