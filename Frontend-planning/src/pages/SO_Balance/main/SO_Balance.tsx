import React, { useState, useCallback, useMemo, Suspense } from "react";
import { CalendarRange, ClipboardList } from "lucide-react";
import toast from "react-hot-toast";
import type { GridSortModel } from "@mui/x-data-grid";

import type { PlanningFilter, PlanningRow } from "../types";
import useSOBalance, { EMPTY_FILTER } from "../hooks/useSOBalance";
import SummaryCards from "../components/SummaryCards";
import FilterBar from "../components/FilterBar";
import ExchangeRateModal from "../components/ExchangeRateModal";
import SOBalanceTable from "../components/SOBalanceTable";
import SOBalanceHistoryModal from "../components/SOBalanceHistoryModal";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import "../../Planning_Summary_Gate/gateTheme.css";
import { toDMY } from "../utils";

const Planning_Overview = React.lazy(
  () => import("@/pages/Planning_Overview/main/Planning_Overview")
);

export type SOBalanceTab = "balance" | "overview";

interface SOBalanceProps {
  defaultTab?: SOBalanceTab;
}

const SO_Balance = ({ defaultTab = "balance" }: SOBalanceProps) => {
  const [activeTab, setActiveTab] = useState<SOBalanceTab>(defaultTab);
  const [filter, setFilter] = useState<PlanningFilter>(EMPTY_FILTER);
  const [sortModel, setSortModel] = useState<GridSortModel>([]);
  const [isExchangeRateModalOpen, setIsExchangeRateModalOpen] = useState(false);
  const [selectedHistoryRow, setSelectedHistoryRow] = useState<PlanningRow | null>(null);
  const { rows, summary, products, lastUpdatedAt, loading, fetchData, dbVersion } = useSOBalance();

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
      {/* Tab switcher: SO Balance / Overview */}
      <div className="flex items-center">
        <div
          role="tablist"
          aria-label="SO Balance views"
          className="inline-flex items-center gap-1 rounded-xl border border-base-content/12 bg-base-100 p-1 shadow-2xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "balance"}
            onClick={() => setActiveTab("balance")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === "balance"
                ? "bg-[#4f46e5] text-white shadow-xs"
                : "text-base-content/70 hover:text-base-content hover:bg-base-200/70"
            }`}
          >
            <ClipboardList size={14} />
            <span>SO Balance</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            onClick={() => setActiveTab("overview")}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === "overview"
                ? "bg-[#4f46e5] text-white shadow-xs"
                : "text-base-content/70 hover:text-base-content hover:bg-base-200/70"
            }`}
          >
            <CalendarRange size={14} />
            <span>Overview</span>
          </button>
        </div>
      </div>

      {activeTab === "overview" ? (
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-16 text-sm text-base-content/60">
              Loading Overview...
            </div>
          }
        >
          <Planning_Overview />
        </Suspense>
      ) : (
        <>
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
          <SOBalanceTable
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
          <SOBalanceHistoryModal
            isOpen={Boolean(selectedHistoryRow)}
            row={selectedHistoryRow}
            onClose={() => setSelectedHistoryRow(null)}
          />
        </>
      )}
    </div>
  );
};

export default SO_Balance;
