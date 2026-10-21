import { useState } from "react";
import toast from "react-hot-toast";

import type { PlanningFilter } from "../types";
import usePOBalance, { EMPTY_FILTER } from "../hooks/usePOBalance";
import SummaryCards from "../components/SummaryCards";
import FilterBar from "../components/FilterBar";
import POBalanceTable from "../components/POBalanceTable";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";

const PO_Balance = () => {
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_FILTER);
  const { rows, summary, loading, fetchData } = usePOBalance();

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
      <POBalanceTable rows={rows} loading={loading} />
    </div>
  );
};

export default PO_Balance;
