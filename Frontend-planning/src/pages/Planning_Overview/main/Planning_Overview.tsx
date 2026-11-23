import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";

import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import usePlanningOverview from "../hooks/usePlanningOverview";
import OverviewFilterBar, { type OverviewSort } from "../components/OverviewFilterBar";
import OverviewKpiCards from "../components/OverviewKpiCards";
import BalanceTable from "../components/BalanceTable";
import {
  addDays,
  computeKpi,
  dayLabel,
  filterByUnit,
  filterProducts,
  localToday,
  rangeLabel,
  shortDate,
  updatedLabel,
} from "../overviewView";
import { DEFAULT_HORIZON, type Horizon, type UnitFilter } from "../types";
import "../planningOverview.css";

const Planning_Overview: React.FC = () => {
  const horizon: Horizon = DEFAULT_HORIZON;
  const [unit, setUnit] = useState<UnitFilter>("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<OverviewSort>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  const { data, loading, error, reload } = usePlanningOverview(horizon);

  const unitRows = useMemo(() => filterByUnit(data?.products ?? [], unit), [data, unit]);
  const productOptions = useMemo(
    () => unitRows.map((r) => r.prd_name).sort((a, b) => a.localeCompare(b)),
    [unitRows]
  );
  const rows = useMemo(() => {
    const filtered = filterProducts(unitRows, { show: "all", search: deferredSearch });
    if (!sort) return filtered;
    const mult = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      sort.field === "prd_name"
        ? a.prd_name.localeCompare(b.prd_name) * mult
        : (a.fg_stock - b.fg_stock) * mult || a.prd_name.localeCompare(b.prd_name)
    );
  }, [unitRows, deferredSearch, sort]);
  const kpi = useMemo(() => computeKpi(unitRows), [unitRows]);

  const start = data?.start ?? localToday();
  const end = data?.end ?? addDays(start, horizon - 1);

  const handleRefresh = useCallback(() => {
    reload();
  }, [reload]);

  const handleExport = useCallback(() => {
    if (!data || rows.length === 0) {
      toast("No data to export");
      return;
    }
    const dayCols = data.days.map((d, i) => ({ i, header: dayLabel(d.date) }));
    exportToExcel<Record<string, string | number>>({
      fileName: `planning_overview_${data.start}_${data.end}`,
      columns: [
        { header: "PRODUCT", key: "prd_name", align: "left" },
        { header: "TYPE", key: "type", align: "center" },
        { header: "INVENTORY", key: "fg_stock", align: "right", numFmt: "#,##0" },
        ...dayCols.map((c) => ({
          header: c.header, key: `bl_${c.i}`, group: "SO BALANCE OVERVIEW", align: "right" as const, numFmt: "#,##0",
        })),
      ],
      data: rows.map((r) => {
        const out: Record<string, string | number> = {
          prd_name: r.prd_name,
          type: r.type,
          fg_stock: Math.round(r.fg_stock),
        };
        dayCols.forEach(({ i }) => {
          out[`bl_${i}`] = Math.round(r.bl[i]) || 0;
        });
        return out;
      }),
    });
  }, [data, rows]);

  const filterBarProps = {
    unit,
    onUnitChange: setUnit,
    horizon,
    startDate: start,
    products: productOptions,
    search,
    onSearchChange: setSearch,
    sort,
    onSortChange: setSort,
    updatedLabel: updatedLabel(data?.updated_at, data?.today),
    loading,
    onRefresh: handleRefresh,
    onExport: handleExport,
    canExport: rows.length > 0,
  };

  const content = (
    <div
      className={
        isFullscreen
          ? "planning-overview fixed inset-0 z-[100] flex flex-col gap-3 p-3 bg-base-200 overflow-hidden"
          : "planning-overview flex flex-col gap-3 w-full"
      }
    >
      {!isFullscreen && (
        <div className="shrink-0">
          <OverviewFilterBar {...filterBarProps} />
        </div>
      )}

      {error && (
        <div role="alert" className="alert alert-error alert-soft rounded-2xl py-2 text-sm shrink-0">
          <span>{data ? `Could not refresh: ${error} Showing the last loaded data.` : error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      {!isFullscreen && (
        <div className="shrink-0">
          <OverviewKpiCards kpi={kpi} horizon={horizon} rangeText={rangeLabel(start, end)} endText={shortDate(end)} />
        </div>
      )}

      <BalanceTable
        rows={rows}
        days={data?.days ?? []}
        totalProducts={unitRows.length}
        loading={loading}
        calendarFallback={data?.calendar === "fallback"}
        hasData={Boolean(data)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
        headerControls={isFullscreen ? <OverviewFilterBar {...filterBarProps} inline /> : undefined}
      />
    </div>
  );

  return isFullscreen && typeof document !== "undefined"
    ? createPortal(content, document.body)
    : content;
};

export default Planning_Overview;
