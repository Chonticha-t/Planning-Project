import React, { useState, useEffect, useMemo, memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PlanningSummaryGateRow } from "../types";

interface GateActionTableProps {
  gateName: string;
  rows: PlanningSummaryGateRow[];
  actionTab: "all" | "today" | "in_gate" | "need_wip";
  onTabChange: (tab: "all" | "today" | "in_gate" | "need_wip") => void;
  stats: {
    inGateLots: number;
    comingLots: number;
    needWipLots: number;
    lateLots?: number;
    totalLots: number;
    totalPcs: number;
  };
}

// Ultra-fast string slice date formatters (avoids thousands of dayjs allocations per render)
const formatDateShort = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  return `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}/${dtStr.slice(2, 4)}`;
};

const formatDayMonth = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  return `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}`;
};

const formatScanTime = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  const time = dtStr.length >= 16 ? dtStr.slice(11, 16) : "";
  return time ? `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)} ${time}` : `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}`;
};

const PAGE_SIZE = 50;

export const GateActionTable: React.FC<GateActionTableProps> = memo(({
  gateName,
  rows,
  actionTab,
  onTabChange,
  stats,
}) => {
  const [page, setPage] = useState(1);

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const todayMs = useMemo(() => new Date(`${todayStr}T00:00:00`).getTime(), [todayStr]);

  // Reset to page 1 when gate, tab, or row count changes
  useEffect(() => {
    setPage(1);
  }, [gateName, actionTab, rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  const totalFilteredPcs = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < rows.length; i++) {
      sum += Number(rows[i].qty) || 0;
    }
    return sum;
  }, [rows]);

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Table Header: Section title, action tabs, total lots badge, and pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">
              Lot Action Plan • <span className="text-primary">{gateName}</span>
            </h3>
          </div>

          {/* Sub-filter tabs */}
          <div className="join bg-base-200/80 p-0.5 rounded-xl border border-base-300 text-xs">
            <button
              type="button"
              onClick={() => onTabChange("today")}
              className={`btn btn-xs rounded-lg px-2.5 font-semibold transition-all ${
                actionTab === "today"
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              This day
            </button>
            <button
              type="button"
              onClick={() => onTabChange("all")}
              className={`btn btn-xs rounded-lg px-2.5 font-semibold transition-all ${
                actionTab === "all"
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              All lots at gate
            </button>
          </div>

          {/* Total Counter Badge */}
          <div className="badge badge-sm badge-ghost font-bold text-xs tabular-nums text-base-content/80">
            {rows.length.toLocaleString()} lots • {totalFilteredPcs.toLocaleString()} pcs
          </div>
        </div>

        {/* Fast Page Switcher */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base-content/60 font-medium tabular-nums">
              Page {page} of {totalPages}
            </span>
            <div className="join border border-base-300 rounded-lg">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table table-sm w-full text-left border-collapse">
          <thead>
            <tr className="bg-base-200/70 border-b border-base-300 text-xs font-bold text-base-content">
              <th className="w-10 text-center px-2 py-2">PRI</th>
              <th className="px-2 py-2">LOT NO</th>
              <th className="px-2 py-2">PRODUCT</th>
              <th className="px-2 py-2">PO</th>
              <th className="px-2 py-2">SHIP (PO DUE)</th>
              <th className="px-2 py-2">NOW AT</th>
              <th className="text-right px-2 py-2">QTY</th>
              <th className="px-2 py-2">SCAN-IN {gateName}</th>
              <th className="px-2 py-2">START BY</th>
              <th className="px-2 py-2">MUST OUT</th>
              <th className="px-2 py-2">TODAY</th>
              <th className="text-center px-2 py-2">ON TIME?</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-10 text-base-content/50 text-sm">
                  No lots found for the selected gate and criteria.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rIdx) => {
                const isNeedWip =
                  row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip";
                const isLateStart = row.start_by && row.start_by < todayStr;
                const diffDays = row.must_out
                  ? Math.round((new Date(`${row.must_out.slice(0, 10)}T00:00:00`).getTime() - todayMs) / 86400000)
                  : 0;

                return (
                  <tr
                    key={`${row.pri}-${row.lot_no}-${row.gate_name}-${rIdx}`}
                    className="border-b border-base-300/50 hover:bg-base-200/40 text-[13px] transition-colors"
                  >
                    {/* PRI */}
                    <td className="text-center font-bold text-base-content/60 tabular-nums px-2 py-2 text-xs">
                      {row.pri}
                    </td>

                    {/* LOT NO */}
                    <td className="px-2 py-2">
                      {isNeedWip ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                          NEED WIP
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-base-content select-all">
                          {row.lot_no}
                        </span>
                      )}
                    </td>

                    {/* PRODUCT (without routing case) */}
                    <td className="px-2 py-2">
                      <span className="font-bold text-base-content text-[13px]">{row.prd_name}</span>
                    </td>

                    {/* PO */}
                    <td className="font-mono text-base-content/85 px-2 py-2 text-xs">
                      {row.item || `PO-${String(row.pri).padStart(4, "0")}`}
                    </td>

                    {/* SHIP (PO DUE) */}
                    <td className="font-semibold text-base-content tabular-nums px-2 py-2 text-xs">
                      {formatDateShort(row.due_date)}
                    </td>

                    {/* NOW AT */}
                    <td className="px-2 py-2">
                      {row.proc_disp && !isNeedWip ? (
                        <span className="badge badge-ghost badge-sm font-semibold text-xs text-base-content/80 px-2 py-0.5">
                          {row.proc_disp}
                        </span>
                      ) : (
                        <span className="text-base-content/30">-</span>
                      )}
                    </td>

                    {/* QTY */}
                    <td className="text-right font-black tabular-nums text-base-content px-2 py-2 text-[13px]">
                      {row.qty ? Number(row.qty).toLocaleString() : "-"}
                    </td>

                    {/* SCAN-IN */}
                    <td className="text-base-content/80 tabular-nums text-xs px-2 py-2">
                      {formatScanTime(row.scan_in)}
                    </td>

                    {/* START BY */}
                    <td
                      className={`tabular-nums font-semibold px-2 py-2 text-xs ${
                        isLateStart ? "text-rose-600 font-bold" : "text-base-content/80"
                      }`}
                    >
                      {formatDayMonth(row.start_by)}
                    </td>

                    {/* MUST OUT */}
                    <td className="font-bold text-base-content tabular-nums px-2 py-2 text-xs">
                      {formatDayMonth(row.must_out)}
                    </td>

                    {/* TODAY ACTION */}
                    <td className="px-2 py-2">
                      {row.today_action ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold text-white shadow-2xs ${
                            row.today_action.toLowerCase().includes("finish")
                              ? "bg-sky-600"
                              : "bg-amber-600"
                          }`}
                        >
                          {row.today_action}
                        </span>
                      ) : (
                        <span className="text-base-content/30">-</span>
                      )}
                    </td>

                    {/* ON TIME? */}
                    <td className="text-center px-2 py-2">
                      {row.on_time ? (
                        <span className="inline-flex items-center justify-center min-w-[55px] px-2 py-0.5 rounded text-xs font-bold bg-emerald-600 text-white shadow-2xs">
                          {row.must_out === todayStr || diffDays <= 0 ? "Today" : `OK +${diffDays}d`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-center min-w-[55px] px-2 py-0.5 rounded text-xs font-bold bg-rose-600 text-white shadow-2xs">
                          Late
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* In Gate Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
            <span className="font-semibold text-base-content/70">IN GATE (Ready):</span>
            <strong className="text-sm font-black text-blue-600 tabular-nums">
              {stats.inGateLots} lots
            </strong>
          </div>

          {/* Coming Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 shrink-0" />
            <span className="font-semibold text-base-content/70">COMING (Upstream Gate):</span>
            <strong className="text-sm font-black text-cyan-600 tabular-nums">
              {stats.comingLots} lots
            </strong>
          </div>

          {/* Need WIP Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" />
            <span className="font-semibold text-base-content/70">NEED WIP (Unreleased):</span>
            <strong className="text-sm font-black text-amber-600 tabular-nums">
              {stats.needWipLots} lots
            </strong>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base-content/60 font-medium tabular-nums">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <div className="join border border-base-300 rounded-lg">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

