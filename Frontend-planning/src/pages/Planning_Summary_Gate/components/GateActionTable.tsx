import React, { useState, useEffect, useMemo, memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PlanningSummaryGateRow } from "../types";

interface GateActionTableProps {
  todayStr: string;
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

const formatScanTime = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  const datePart = `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}/${dtStr.slice(2, 4)}`;
  const time = dtStr.length >= 16 ? dtStr.slice(11, 16) : "";
  return time ? `${datePart} ${time}` : datePart;
};

const PAGE_SIZE = 50;

export const GateActionTable: React.FC<GateActionTableProps> = memo(({
  todayStr,
  gateName,
  rows,
  actionTab,
  onTabChange,
  stats,
}) => {
  const [page, setPage] = useState(1);

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
              Arriving today
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
        <table className="table table-sm table-fixed w-full min-w-[1400px] text-center border-collapse [&_th]:text-center [&_td]:text-center [&_td:first-child:not([colspan])]:text-left [&_th]:px-3 [&_th]:py-3 [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td]:break-words [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-base-300 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-base-300/60">
          <colgroup>
            <col style={{ width: "14%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead>
            <tr className="bg-base-200/70 border-b border-base-300 text-[12.5px] font-bold tracking-[0.04em] text-base-content">
              <th className="px-2 py-2">PRODUCT NAME</th>
              <th className="px-2 py-2">PO DUE DATE</th>
              <th className="px-2 py-2">LOT NO</th>
              <th className="px-2 py-2">NET REQUIRED</th>
              <th className="px-2 py-2">NET WIP</th>
              <th className="px-2 py-2 whitespace-nowrap">CURRENT PROCESS</th>
              <th className="px-2 py-2">SCAN-IN TIME</th>
              <th className="px-2 py-2">FIRST GATE IN</th>
              <th className="px-2 py-2">TO NEXT GATE</th>
              <th className="px-2 py-2">NEXT GATE</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-10 text-base-content/50 text-sm">
                  No lots found for the selected gate and criteria.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rIdx) => {
                const isNeedWip =
                  row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip";
                const currentProcess = row.proc_disp?.trim() ?? "";
                const currentGate = row.current_gate?.trim() ?? "";
                const nextGate = row.next_gate?.trim() ?? "";
                const netRequired = row.cal_net_required == null
                  ? null
                  : Number(row.cal_net_required);
                const netWip = row.net_wip_qty == null ? null : Number(row.net_wip_qty);
                const isLateStart = row.start_by && row.start_by < todayStr;

                return (
                  <tr
                    key={`${row.pri}-${row.lot_no}-${row.gate_name}-${rIdx}`}
                    className="border-b border-base-300/50 hover:bg-base-200/40 text-[14px] leading-5 transition-colors"
                  >
                    {/* PRODUCT NAME */}
                    <td className="px-2 py-2">
                      <span className="font-semibold text-[15px] text-base-content">{row.prd_name}</span>
                    </td>

                    {/* PO DUE DATE */}
                    <td className="font-medium text-base-content tabular-nums px-2 py-2">
                      {formatDateShort(row.due_date)}
                    </td>

                    {/* LOT NO */}
                    <td className="px-2 py-2">
                      {isNeedWip ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                          NEED WIP
                        </span>
                      ) : (
                        <span className="font-mono font-bold text-[15px] tracking-wide tabular-nums text-base-content select-all">
                          {row.lot_no}
                        </span>
                      )}
                    </td>

                    {/* Use the same Net Required field as Planning Summary. */}
                    <td className="tabular-nums px-2 py-2">
                      <span className={`text-[14px] ${netRequired !== null && Number.isFinite(netRequired) ? "font-bold text-error" : "text-base-content/25"}`}>
                        {netRequired !== null && Number.isFinite(netRequired)
                          ? netRequired.toLocaleString("en-US", { maximumFractionDigits: 0 })
                          : "-"}
                      </span>
                    </td>

                    {/* Net WIP from the gate API, including zero quantities. */}
                    <td className="tabular-nums px-2 py-2">
                      <span className={`text-[14px] ${netWip !== null && Number.isFinite(netWip) ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-base-content/25"}`}>
                        {netWip !== null && Number.isFinite(netWip)
                          ? netWip.toLocaleString("en-US", { maximumFractionDigits: 0 })
                          : "-"}
                      </span>
                    </td>

                    {/* Current lot location is independent of this row's planned transition. */}
                    <td className="px-2 py-2">
                      {isNeedWip ? (
                        <span className="text-base-content/25">-</span>
                      ) : currentProcess || currentGate ? (
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {currentProcess && (
                            <span className="font-semibold text-[13.5px] text-base-content">
                              {currentProcess}
                            </span>
                          )}
                          {currentGate && (
                            <span className="inline-flex items-center shrink-0 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-600 text-[10.5px] font-semibold tracking-wide uppercase leading-none">
                              {currentGate}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-base-content/25">-</span>
                      )}
                    </td>

                    {/* SCAN-IN TIME */}
                    <td className="font-medium text-[13.5px] text-base-content/85 tabular-nums px-2 py-2">
                      {formatScanTime(row.scan_in)}
                    </td>

                    {/* TARGET IN */}
                    <td
                      className={`tabular-nums font-medium px-2 py-2 ${
                        isLateStart ? "text-rose-600 font-bold" : "text-base-content/80"
                      }`}
                    >
                      {formatDateShort(row.start_by)}
                    </td>

                    {/* TARGET OUT */}
                    <td className="font-medium text-base-content tabular-nums px-2 py-2">
                      {formatDateShort(row.must_out)}
                    </td>

                    {/* Next gate in this row's planned route. */}
                    <td className="px-2 py-2">
                      {nextGate ? (
                        <span className="font-semibold text-base-content">
                          {nextGate}
                        </span>
                      ) : (
                        <span className="text-base-content/30">-</span>
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
