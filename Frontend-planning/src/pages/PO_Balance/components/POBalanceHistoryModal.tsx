import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  History,
  X,
  Calendar,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
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

/** "YYYY-MM-DD HH:mm:ss" → { date: "DD/MM/YYYY", time: "HH:mm" } */
const splitDateTime = (value?: string | null) => {
  if (!value) return { date: "-", time: "" };
  return { date: toDMY(value.slice(0, 10)), time: value.slice(11, 16) };
};

const TH = "px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-base-content/60 whitespace-nowrap";

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

  // Close with Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (typeof document === "undefined") return null;

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
            role="dialog"
            aria-modal="true"
            aria-label="PO Balance History"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 6 }}
            transition={{ type: "spring", duration: 0.25, bounce: 0.1 }}
            className="relative z-10 flex w-full max-w-5xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-base-300">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <History size={18} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-base-content">PO Balance History</h2>
                    <span className="inline-flex h-5 items-center rounded-md bg-base-200 border border-base-300 px-2 text-[11px] font-bold text-base-content/70 tabular-nums">
                      {history.length} {history.length === 1 ? "revision" : "revisions"}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-base-content/60">
                    <span className="inline-flex items-center gap-1 font-semibold text-base-content">
                      <Package size={12} className="text-primary" />
                      {row.prd_name}
                    </span>
                    {row.item && (
                      <>
                        <span className="text-base-content/30">•</span>
                        <span className="font-mono text-[11px]">{row.item}</span>
                      </>
                    )}
                    <span className="text-base-content/30">•</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} />
                      Due <strong className="font-semibold text-base-content">{toDMY(row.due_date)}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn btn-circle btn-sm btn-ghost shrink-0 text-base-content/60 hover:text-base-content"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-base-content/60">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <span className="text-sm">Loading PO Balance history...</span>
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error">
                  <Info size={18} />
                  <span>{error}</span>
                </div>
              ) : history.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                  <div className="mb-3 rounded-full bg-base-200 p-3 text-base-content/40">
                    <Layers size={28} />
                  </div>
                  <h3 className="mb-1 text-base font-bold text-base-content">No history available</h3>
                  <p className="mb-4 max-w-sm text-xs text-base-content/60">
                    No calculation history has been recorded for this product and due date.
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-base-300 bg-base-200/70 p-3 text-xs">
                    <span className="text-base-content/60">Current PO balance in the main table:</span>
                    <strong className="text-sm font-bold tabular-nums text-primary">{num(row.po_bal)} pcs</strong>
                  </div>
                </div>
              ) : (
                <>
                  {/* Revisions table */}
                  <div className="overflow-x-auto rounded-xl border border-base-300">
                    <table className="w-full min-w-[760px] border-collapse text-[13px]">
                      <thead className="bg-base-200">
                        <tr className="border-b border-base-300">
                          <th className={`${TH} text-left`}>Revision</th>
                          <th className={`${TH} text-left`}>Updated At</th>
                          <th className={`${TH} text-right`}>PO Bal</th>
                          <th className={`${TH} text-right`}>Change</th>
                          <th className={`${TH} text-right`}>Unmovement</th>
                          <th className={`${TH} text-right`}>F/G</th>
                          <th className={`${TH} text-right`}>Net Required</th>
                          <th className={`${TH} text-center`}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((item, idx) => {
                          const isCurrentRow = item.source_rev === highestRev;
                          const prevItem = idx > 0 ? history[idx - 1] : null;
                          const changeFromPrev = prevItem ? (item.po_bal ?? 0) - (prevItem.po_bal ?? 0) : 0;
                          const updated = splitDateTime(item.source_update_at);
                          const isReady = item.status === "ready";

                          return (
                            <tr
                              key={item.run_id || idx}
                              className={`border-b border-base-300/70 last:border-b-0 transition-colors ${
                                isCurrentRow ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-base-200/50"
                              }`}
                            >
                              {/* Revision */}
                              <td
                                className={`px-3 py-2.5 whitespace-nowrap border-l-[3px] ${
                                  isCurrentRow ? "border-l-primary" : "border-l-transparent"
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-flex h-6 min-w-12 items-center justify-center rounded-md border border-base-300 bg-base-100 px-2 font-mono text-[11.5px] font-bold text-base-content">
                                    Rev {item.source_rev}
                                  </span>
                                  {isCurrentRow && (
                                    <span className="inline-flex h-5 items-center rounded-md bg-primary px-1.5 text-[10px] font-bold text-primary-content">
                                      Current
                                    </span>
                                  )}
                                </span>
                              </td>

                              {/* Updated At */}
                              <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                                <span className="font-medium text-base-content">{updated.date}</span>
                                {updated.time && <span className="ml-1.5 text-base-content/50">{updated.time}</span>}
                              </td>

                              {/* PO Bal */}
                              <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                <span className={`text-[14px] font-bold tabular-nums ${isCurrentRow ? "text-primary" : "text-base-content"}`}>
                                  {num(item.po_bal)}
                                </span>
                              </td>

                              {/* Change */}
                              <td className="px-3 py-2.5 text-right whitespace-nowrap text-[12.5px]">
                                {idx === 0 ? (
                                  <span className="text-base-content/40">Initial</span>
                                ) : changeFromPrev < 0 ? (
                                  <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-emerald-600">
                                    <ArrowDownRight size={13} />
                                    {num(changeFromPrev)}
                                  </span>
                                ) : changeFromPrev > 0 ? (
                                  <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-rose-500">
                                    <ArrowUpRight size={13} />+{num(changeFromPrev)}
                                  </span>
                                ) : (
                                  <span className="text-base-content/40">—</span>
                                )}
                              </td>

                              {/* Unmovement */}
                              <td className="px-3 py-2.5 text-right tabular-nums text-base-content/75">{num(item.unmovement)}</td>

                              {/* F/G */}
                              <td className="px-3 py-2.5 text-right tabular-nums text-base-content/75">{num(item.f_g)}</td>

                              {/* Net Required */}
                              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${item.net_required_pcs ? "text-rose-500" : "text-base-content/40"}`}>
                                {num(item.net_required_pcs)}
                              </td>

                              {/* Status — same pills as the main table */}
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <span
                                  className={`status-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    isReady ? "status-pill-ready" : "status-pill-plan"
                                  }`}
                                >
                                  <span className="status-dot size-1.5 shrink-0 rounded-full" />
                                  {isReady ? "Ready" : "Production Plan"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-base-300 bg-base-200/40 px-5 py-3 text-xs text-base-content/60">
              <span className="flex items-center gap-1.5">
                <Info size={13} className="shrink-0 text-primary" />
                Oldest revision first. The highest revision is marked Current.
              </span>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-sm btn-primary rounded-lg px-5 font-semibold"
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
