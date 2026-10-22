import { useState } from "react";
import toast from "react-hot-toast";
import type { GridSortModel } from "@mui/x-data-grid";

import type { PlanningFilter } from "../types";
import usePOBalance, { EMPTY_FILTER } from "../hooks/usePOBalance";
import SummaryCards from "../components/SummaryCards";
import FilterBar from "../components/FilterBar";
import POBalanceTable from "../components/POBalanceTable";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import { toDMY } from "../utils";

const PO_Balance = () => {
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_FILTER);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const { rows, summary, products, loading, fetchData } = usePOBalance();

  const handleReset = () => {
    setFilter(EMPTY_FILTER);
    setSortModel([]);
    fetchData(EMPTY_FILTER);
  };

  const handleExport = () => {
    if (rows.length === 0) {
      toast("No data to export");
      return;
    }
    exportToExcel({
      fileName: "production_plan",
      columns: [
        { header: "PRODUCT", key: "prd_name", align: "left" },
        { header: "DUE DATE", key: "due_date", align: "center" },
        { header: "PO BAL", key: "po_bal", align: "center", numFmt: "#,##0" },
        { header: "UNMOVEMENT", key: "unmovement", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "REM UNMOVE", key: "rem_unmovement", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "F/G", key: "f_g", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "REM F/G", key: "rem_fg", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "NET REQUIRED", key: "net_required_pcs", align: "center", numFmt: "#,##0" },
        { header: "STATUS", key: "status", align: "center" },
      ],
      data: rows.map((r) => ({
        prd_name: r.prd_name,
        due_date: toDMY(r.due_date),
        po_bal: r.po_bal,
        unmovement: r.unmovement,
        rem_unmovement: r.rem_unmovement,
        f_g: r.f_g,
        rem_fg: r.rem_fg,
        net_required_pcs: r.net_required_pcs,
        status: r.status,
      })),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <SummaryCards summary={summary} />
      <FilterBar
        filter={filter}
        products={products}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        onChange={setFilter}
        onSearch={(f = filter) => fetchData(f)}
        onReset={handleReset}
        onExport={handleExport}
        loading={loading}
      />
      <POBalanceTable rows={rows} loading={loading} sortModel={sortModel} onSortModelChange={setSortModel} />
    </div>
  );
};

export default PO_Balance;
