import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  History,
  X,
  Calendar,
  Layers,
  ArrowDownRight,
  TrendingDown,
  Info,
  Loader2,
  Package,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { PO_BALANCE_HISTORY_API } from "../hooks/api";
import type { PlanningRow, POBalanceHistoryRow, ApiResponse } from "../types";
import { toDMY } from "../utils";

interface POBalanceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  row: PlanningRow | null;
}

const num = (value: number | null | undefined, decimals = 0) =>
  value == null
    ? "-"
    : Number(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

const POBalanceHistoryModal: React.FC<POBalanceHistoryModalProps> = ({
  isOpen,
  onClose,
  row,
}) => {
  const [history, setHistory] = useState<POBalanceHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !row) {
      setHistory([]);
      setError(null);
      return;
    }

    const fetchHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<ApiResponse<POBalanceHistoryRow[]>>(
          PO_BALANCE_HISTORY_API,
          {
            params: {
              prd_name: row.prd_name,
              due_date: row.due_date,
            },
            timeout: 8000,
          }
        );

        if (res.data?.status === "OK") {
          const sortedHistory = [...(res.data.data || [])].sort(
            (a, b) => (a.source_rev ?? -1) - (b.source_rev ?? -1)
          );
          setHistory(sortedHistory);
        } else {
          setError(res.data?.message || "Unable to load history.");
        }
      } catch (err: unknown) {
        console.error("Failed to fetch PO balance history:", err);
        setError("Unable to connect to the server to load history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [isOpen, row]);

  if (typeof document === "undefined") return null;

  // Calculate summary statistics from the available history.
  const maxPoBal = history.length > 0 ? Math.max(...history.map((h) => h.po_bal ?? 0)) : row?.po_bal ?? 0;
  const currentPoBal = row?.po_bal ?? 0;
  const diff = maxPoBal - currentPoBal;
  const highestRev = history.reduce(
    (maxRev, item) => Math.max(maxRev, item.source_rev ?? -Infinity),
    -Infinity
  );

  return createPortal(
    <AnimatePresence>
      {isOpen && row && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 6 }}
            transition={{ type: "spring", duration: 0.25, bounce: 0.1 }}
            className="relative w-full max-w-4xl bg-base-100 border border-base-300 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-base-300/80 bg-base-100">
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                  <History size={22} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-base-content tracking-tight">
                      PO Balance History
                    </h2>
                    <span className="badge badge-sm badge-ghost font-semibold text-xs text-base-content/70">
                      {history.length} {history.length === 1 ? "Revision" : "Revisions"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-base-content/70">
                    <span className="font-semibold text-base-content flex items-center gap-1">
                      <Package size={13} className="text-primary" />
                      {row.prd_name}
                    </span>
                    {row.item && (
                      <span className="badge badge-xs badge-outline text-[11px] font-mono">
                        {row.item}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-base-content/60">
                      <Calendar size={12} />
                      Due Date: <strong className="text-base-content">{toDMY(row.due_date)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn btn-circle btn-sm btn-ghost text-base-content/60 hover:text-base-content"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Stat Highlights */}
            {history.length > 0 && (
              <div className="grid grid-cols-3 gap-3 p-4 bg-base-200/40 border-b border-base-300/60 text-xs">
                <div className="flex flex-col p-2.5 rounded-xl bg-base-100 border border-base-300/70">
                  <span className="text-base-content/60 font-medium">Initial PO Bal (Highest)</span>
                  <span className="text-base font-bold text-base-content tabular-nums mt-0.5">
                    {num(maxPoBal)} <span className="text-[11px] font-normal text-base-content/50">pcs</span>
                  </span>
                </div>
                <div className="flex flex-col p-2.5 rounded-xl bg-base-100 border border-base-300/70">
                  <span className="text-base-content/60 font-medium flex items-center gap-1">
                    Current PO Bal (Table)
                    <span className="badge badge-xs badge-success py-0 px-1 text-[10px]">Active</span>
                  </span>
                  <span className="text-base font-bold text-primary tabular-nums mt-0.5">
                    {num(currentPoBal)} <span className="text-[11px] font-normal text-base-content/50">pcs</span>
                  </span>
                </div>
                <div className="flex flex-col p-2.5 rounded-xl bg-base-100 border border-base-300/70">
                  <span className="text-base-content/60 font-medium flex items-center gap-1">
                    <TrendingDown size={13} className="text-emerald-500" />
                    PO Bal Reduction
                  </span>
                  <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                    {diff > 0 ? `-${num(diff)}` : "0"}{" "}
                    <span className="text-[11px] font-normal text-base-content/50">
                      {maxPoBal > 0 ? `(${((diff / maxPoBal) * 100).toFixed(0)}%)` : ""}
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* Body / Table */}
            <div className="p-4 overflow-y-auto flex-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-base-content/60">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <span className="text-sm">Loading PO Balance history...</span>
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm">
                  <Info size={18} />
                  <span>{error}</span>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center px-4">
                  <div className="p-3 rounded-full bg-base-200 text-base-content/40 mb-3">
                    <Layers size={28} />
                  </div>
                  <h3 className="font-bold text-base text-base-content mb-1">
                    No history available
                  </h3>
                  <p className="text-xs text-base-content/60 max-w-sm mb-4">
                    No calculation history has been recorded for this product and due date.
                  </p>
                  <div className="p-3 rounded-xl bg-base-200/70 border border-base-300/80 text-xs inline-flex items-center gap-2">
                    <span className="text-base-content/60">Current PO balance in the main table:</span>
                    <strong className="text-primary tabular-nums font-bold text-sm">
                      {num(row.po_bal)} pcs
                    </strong>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-base-300/80">
                  <table className="table table-sm w-full text-center">
                    <thead>
                      <tr className="bg-base-200/70 text-base-content/70 text-[12px] border-b border-base-300/80">
                        <th className="py-2.5 px-3 text-center">Source Rev</th>
                        <th className="py-2.5 px-3 text-center">Calculated At</th>
                        <th className="py-2.5 px-3 text-center">PO Bal</th>
                        <th className="py-2.5 px-3 text-center">Change</th>
                        <th className="py-2.5 px-3 text-center">Unmovement</th>
                        <th className="py-2.5 px-3 text-center">F/G</th>
                        <th className="py-2.5 px-3 text-center">Net Required</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-base-300/50 text-[13px]">
                      {history.map((item, idx) => {
                        const isCurrentRow = item.source_rev === highestRev;
                        const prevItem = idx > 0 ? history[idx - 1] : null;
                        const changeFromPrev = prevItem ? (item.po_bal ?? 0) - (prevItem.po_bal ?? 0) : 0;

                        return (
                          <tr
                            key={item.run_id || idx}
                            className={`transition-colors ${
                              isCurrentRow
                                ? "bg-primary/5 hover:bg-primary/10 font-medium"
                                : "hover:bg-base-200/50"
                            }`}
                          >
                            {/* Source Rev */}
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="inline-flex w-max flex-nowrap items-center gap-1.5 font-bold text-base-content">
                                <span className="badge badge-sm badge-outline shrink-0 whitespace-nowrap font-mono text-[11px]">
                                  Rev {item.source_rev}
                                </span>
                                {isCurrentRow && (
                                  <span className="badge badge-xs badge-primary shrink-0 whitespace-nowrap text-[10px] font-semibold">
                                    Current
                                  </span>
                                )}
                              </span>
                            </td>

                            {/* Calculated At */}
                            <td className="py-2.5 px-3 font-mono text-[12px] text-base-content/80 whitespace-nowrap">
                              {item.calculated_at || "-"}
                            </td>

                            {/* PO Bal */}
                            <td className="py-2.5 px-3">
                              <span
                                className={`tabular-nums font-bold text-[14px] ${
                                  isCurrentRow ? "text-primary" : "text-base-content/90"
                                }`}
                              >
                                {num(item.po_bal)}
                              </span>
                            </td>

                            {/* Change */}
                            <td className="py-2.5 px-3 whitespace-nowrap text-xs">
                              {idx === 0 ? (
                                <span className="text-base-content/40 italic">Initial balance</span>
                              ) : changeFromPrev < 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                                  <ArrowDownRight size={13} />
                                  {num(changeFromPrev)}
                                </span>
                              ) : changeFromPrev > 0 ? (
                                <span className="text-error font-semibold tabular-nums">
                                  +{num(changeFromPrev)}
                                </span>
                              ) : (
                                <span className="text-base-content/40">-</span>
                              )}
                            </td>

                            {/* Unmovement */}
                            <td className="py-2.5 px-3 tabular-nums text-base-content/75">
                              {num(item.unmovement)}
                            </td>

                            {/* F/G */}
                            <td className="py-2.5 px-3 tabular-nums text-base-content/75">
                              {num(item.f_g)}
                            </td>

                            {/* Net Required */}
                            <td className="py-2.5 px-3 tabular-nums font-semibold text-error">
                              {num(item.net_required_pcs)}
                            </td>

                            {/* Status */}
                            <td className="py-2.5 px-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  item.status === "ready"
                                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                }`}
                              >
                                <span
                                  className={`size-1.5 rounded-full ${
                                    item.status === "ready" ? "bg-emerald-500" : "bg-amber-500"
                                  }`}
                                />
                                {item.status === "ready" ? "Ready" : "Production Plan"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-base-300/80 bg-base-100 text-xs text-base-content/60">
              <span className="flex items-center gap-1.5">
                <Info size={14} className="text-primary" />
                Revisions are sorted from lowest to highest. The highest revision is marked Current.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-ghost px-4 rounded-lg font-medium"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default POBalanceHistoryModal;

