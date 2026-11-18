import { useState, useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import type { GridSortModel } from "@mui/x-data-grid";

import type { PlanningFilter, PlanningRow } from "../types";
import usePOBalance, { EMPTY_FILTER } from "../hooks/usePOBalance";
import SummaryCards from "../components/SummaryCards";
import FilterBar from "../components/FilterBar";
import ExchangeRateModal from "../components/ExchangeRateModal";
import POBalanceTable from "../components/POBalanceTable";
import POBalanceHistoryModal from "../components/POBalanceHistoryModal";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import "../../Planning_Summary_Gate/gateTheme.css";
import { toDMY } from "../utils";

const PO_Balance = () => {
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_FILTER);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [isExchangeRateModalOpen, setIsExchangeRateModalOpen] = useState(false);
  const [selectedHistoryRow, setSelectedHistoryRow] = useState<PlanningRow | null>(null);
  const { rows, summary, products, lastUpdatedAt, loading, fetchData, dbVersion } = usePOBalance();

  const handleReset = useCallback(() => {
    setFilter(EMPTY_FILTER);
    setSortModel([]);
    fetchData(EMPTY_FILTER);
  }, [fetchData]);

  const handleOpenExchangeRate = useCallback(() => {
    setIsExchangeRateModalOpen(true);
  }, []);

  const handleCloseExchangeRate = useCallback(() => {
    setIsExchangeRateModalOpen(false);
  }, []);

  const handleSearch = useCallback((f = filter) => {
    fetchData(f);
  }, [filter, fetchData]);

  const handleExport = useCallback(() => {
    if (rows.length === 0) {
      toast("No data to export");
      return;
    }
    exportToExcel({
      fileName: "production_plan",
      columns: [
        { header: "PRODUCT", key: "prd_name", align: "left" },
        { header: "DUE DATE", key: "due_date", align: "center" },
        { header: "SO BAL", key: "po_bal", align: "center", numFmt: "#,##0" },
        { header: "UNMOVEMENT", key: "unmovement", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "REM UNMOVE", key: "rem_unmovement", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "F/G", key: "f_g", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "REM F/G", key: "rem_fg", group: "INVENTORY", align: "center", numFmt: "#,##0" },
        { header: "NET REQUIRED", key: "net_required_pcs", align: "center", numFmt: "#,##0" },
        { header: "W/H F/G", key: "wh_fg_amount", align: "center", numFmt: "#,##0.00" },
        { header: "OUTPUT AMT", key: "output_amount", align: "center", numFmt: "#,##0.00" },
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
        wh_fg_amount: r.wh_fg_amount,
        output_amount: r.output_amount,
        status: r.status,
      })),
    });
  }, [rows]);

  const productCount = useMemo(() => new Set(rows.map((r) => r.prd_name)).size, [rows]);

  return (
    <div className="planning-summary-gate flex flex-col gap-3 w-full">
      <FilterBar
        filter={filter}
        products={products}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        onChange={setFilter}
        onSearch={handleSearch}
        onReset={handleReset}
      />
      <SummaryCards
        summary={summary}
        lastUpdatedAt={lastUpdatedAt}
        productCount={productCount}
      />
      <POBalanceTable
        rows={rows}
        loading={loading}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        onViewHistory={setSelectedHistoryRow}
        onExport={handleExport}
        onOpenExchangeRate={handleOpenExchangeRate}
      />
      <ExchangeRateModal
        isOpen={isExchangeRateModalOpen}
        onClose={handleCloseExchangeRate}
        dbVersion={dbVersion}
      />
      <POBalanceHistoryModal
        isOpen={Boolean(selectedHistoryRow)}
        row={selectedHistoryRow}
        onClose={() => setSelectedHistoryRow(null)}
      />
    </div>
  );
};

export default PO_Balance;
