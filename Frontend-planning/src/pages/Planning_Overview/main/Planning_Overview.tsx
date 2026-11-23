import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import usePlanningOverview from "../hooks/usePlanningOverview";
import OverviewFilterBar from "../components/OverviewFilterBar";
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
import { DEFAULT_HORIZON, type Horizon, type ShowFilter, type UnitFilter } from "../types";
import "../planningOverview.css";

const Planning_Overview: React.FC = () => {
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  const [unit, setUnit] = useState<UnitFilter>("ALL");
  const [show, setShow] = useState<ShowFilter>("all");
  const [search, setSearch] = useState("");
  const [windowStart, setWindowStart] = useState(0);
  const deferredSearch = useDeferredValue(search);

  const { data, loading, error, reload } = usePlanningOverview(horizon);

  const unitRows = useMemo(() => filterByUnit(data?.products ?? [], unit), [data, unit]);
  const rows = useMemo(
    () => filterProducts(unitRows, { show, search: deferredSearch }),
    [unitRows, show, deferredSearch]
  );
  const kpi = useMemo(() => computeKpi(unitRows), [unitRows]);

  const start = data?.start ?? localToday();
  const end = data?.end ?? addDays(start, horizon - 1);

  const handleHorizonChange = useCallback((next: Horizon) => {
    setHorizon(next);
    setWindowStart(0);
  }, []);

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
        { header: "FG STOCK", key: "fg_stock", align: "right", numFmt: "#,##0" },
        { header: "WIP (AFTER YIELD)", key: "wip_qty", align: "right", numFmt: "#,##0" },
        ...dayCols.map((c) => ({
          header: c.header, key: `po_${c.i}`, group: "PO BALANCE (CUMULATIVE)", align: "right" as const, numFmt: "#,##0",
        })),
        ...dayCols.map((c) => ({
          header: c.header, key: `bl_${c.i}`, group: "B/L FG (AFTER PO)", align: "right" as const, numFmt: "#,##0",
        })),
      ],
      data: rows.map((r) => {
        const out: Record<string, string | number> = {
          prd_name: r.prd_name,
          type: r.type,
          fg_stock: Math.round(r.fg_stock),
          wip_qty: Math.round(r.wip_qty),
        };
        dayCols.forEach(({ i }) => {
          out[`po_${i}`] = r.po_cum[i] ? -Math.round(r.po_cum[i]) : 0;
          out[`bl_${i}`] = Math.round(r.bl[i]) || 0;
        });
        return out;
      }),
    });
  }, [data, rows]);

  return (
    <div className="planning-overview flex flex-col gap-3 w-full">
      <OverviewFilterBar
        unit={unit}
        onUnitChange={setUnit}
        horizon={horizon}
        onHorizonChange={handleHorizonChange}
        startDate={start}
        show={show}
        onShowChange={setShow}
        counts={{ all: unitRows.length, short: kpi.short }}
        search={search}
        onSearchChange={setSearch}
        updatedLabel={updatedLabel(data?.updated_at, data?.today)}
        loading={loading}
        onRefresh={handleRefresh}
        onExport={handleExport}
        canExport={rows.length > 0}
      />

      {error && (
        <div role="alert" className="alert alert-error alert-soft rounded-2xl py-2 text-sm">
          <span>{data ? `Could not refresh: ${error} Showing the last loaded data.` : error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      <OverviewKpiCards kpi={kpi} horizon={horizon} rangeText={rangeLabel(start, end)} endText={shortDate(end)} />

      <BalanceTable
        rows={rows}
        days={data?.days ?? []}
        windowStart={windowStart}
        onWindowStartChange={setWindowStart}
        totalProducts={unitRows.length}
        loading={loading}
        calendarFallback={data?.calendar === "fallback"}
        hasData={Boolean(data)}
      />
    </div>
  );
};

export default Planning_Overview;
