import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  History,
  X,
  Calendar,
  Layers,
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Info,
  Loader2,
  Package,
  FileText,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SO_BALANCE_HISTORY_API } from "../hooks/api";
import {
  computeLatestLinesTotal,
  groupHistoryByLine,
  type SOBalanceHistoryLineGroup,
} from "../historyGrouping";
import type { PlanningRow, SOBalanceHistoryRow, ApiResponse } from "../types";
import { toDMY } from "../utils";

interface SOBalanceHistoryModalProps {
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

const formatDateList = (dates: string[]) => dates.map((d) => toDMY(d)).join(", ");

const TH = "px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-base-content/60 whitespace-nowrap";

const LineHistoryCard: React.FC<{ group: SOBalanceHistoryLineGroup }> = ({ group }) => {
  const isMoved = !group.isActive && group.movedToDates.length > 0;
  const isRemoved = !group.isActive && group.movedToDates.length === 0;

  return (
    <div
      className={`shrink-0 overflow-hidden rounded-xl border bg-base-100 ${
        group.isActive
          ? "border-base-300"
          : isMoved
            ? "border-amber-200 bg-amber-50/30"
            : "border-base-300/80 opacity-85"
      }`}
    >
      {/* SO/PO line header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2 ${
          group.isActive
            ? "border-base-300 bg-base-200/70"
            : isMoved
              ? "border-amber-200 bg-amber-50"
              : "border-base-300/80 bg-base-200/50"
        }`}
      >
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <FileText
            size={13}
            className={`shrink-0 ${group.isActive ? "text-primary" : "text-base-content/45"}`}
          />
          <span className="font-semibold text-base-content/60">SO</span>
          <span className="font-mono font-bold text-base-content">{group.so_no || "-"}</span>
          <span className="text-base-content/30">/</span>
          <span className="font-semibold text-base-content/60">PO</span>
          <span className="font-mono font-bold text-base-content">{group.po_no || "-"}</span>
          <span className="inline-flex h-5 items-center rounded-md bg-base-100 border border-base-300 px-1.5 text-[10.5px] font-semibold text-base-content/65 tabular-nums">
            {group.revisions.length} {group.revisions.length === 1 ? "rev" : "revs"}
          </span>

          {/* Active line that moved in from another due date */}
          {group.isActive && group.movedFromDates.length > 0 && (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-1.5 text-[10.5px] font-semibold text-sky-700"
              title={`Previously scheduled on ${formatDateList(group.movedFromDates)}`}
            >
              Moved from {formatDateList(group.movedFromDates)}
            </span>
          )}

          {/* Inactive line that moved to another due date */}
          {isMoved && (
            <span
              className="inline-flex h-5 items-center gap-1 rounded-md border border-amber-300 bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-800"
              title={`Moved to ${formatDateList(group.movedToDates)}`}
            >
              <span>Moved</span>
              <ArrowRight size={11} className="shrink-0" />
              <span>{formatDateList(group.movedToDates)}</span>
            </span>
          )}

          {/* Inactive line removed completely */}
          {isRemoved && (
            <span className="inline-flex h-5 items-center rounded-md border border-base-300 bg-base-200 px-1.5 text-[10.5px] font-semibold text-base-content/60">
              Removed
            </span>
          )}
        </div>

        <div className="text-xs text-base-content/65 tabular-nums">
          {group.isActive ? "Current:" : "Last saved:"}{" "}
          <strong className={`font-bold ${group.isActive ? "text-primary" : "text-base-content/70"}`}>
            {num(group.latestPoBal)}
          </strong>{" "}
          pcs
        </div>
      </div>

      {/* Line revisions table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-[13px]">
          <thead className="bg-base-200/35">
            <tr className="border-b border-base-300/80">
              <th className={`${TH} text-left`}>Revision</th>
              <th className={`${TH} text-left`}>Updated At</th>
              <th className={`${TH} text-right`}>SO Bal</th>
              <th className={`${TH} text-right`}>Change</th>
            </tr>
          </thead>
          <tbody>
            {group.revisions.map((item) => {
              const updated = splitDateTime(item.source_update_at);

              return (
                <tr
                  key={JSON.stringify([
                    item.prd_name,
                    item.due_date,
                    item.so_no,
                    item.po_no,
                    item.source_rev,
                  ])}
                  className={`border-b border-base-300/70 last:border-b-0 transition-colors ${
                    item.isCurrent && group.isActive
                      ? "bg-primary/5 hover:bg-primary/10"
                      : "hover:bg-base-200/50"
                  }`}
                >
                  {/* Revision */}
                  <td
                    className={`px-3 py-2.5 whitespace-nowrap border-l-[3px] ${
                      item.isCurrent && group.isActive ? "border-l-primary" : "border-l-transparent"
                    }`}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-6 min-w-12 items-center justify-center rounded-md border border-base-300 bg-base-100 px-2 font-mono text-[11.5px] font-bold text-base-content">
                        Rev {item.source_rev}
                      </span>
                      {item.isCurrent && group.isActive && (
                        <span className="inline-flex h-5 items-center rounded-md bg-primary px-1.5 text-[10px] font-bold text-primary-content">
                          Current
                        </span>
                      )}
                      {item.isCurrent && !group.isActive && (
                        <span className="inline-flex h-5 items-center rounded-md bg-base-200 border border-base-300 px-1.5 text-[10px] font-semibold text-base-content/60">
                          Last Saved
                        </span>
                      )}
                    </span>
                  </td>

                  {/* Updated At */}
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                    <span className="font-medium text-base-content">{updated.date}</span>
                    {updated.time && (
                      <span className="ml-1.5 text-base-content/50">{updated.time}</span>
                    )}
                  </td>

                  {/* SO Bal */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span
                      className={`text-[14px] font-bold tabular-nums ${
                        item.isCurrent && group.isActive
                          ? "text-primary"
                          : group.isActive
                            ? "text-base-content"
                            : "text-base-content/65"
                      }`}
                    >
                      {num(item.po_bal)}
                    </span>
                  </td>

                  {/* Change */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-[12.5px]">
                    {item.isInitial ? (
                      <span className="text-base-content/40">Initial</span>
                    ) : item.changeFromPrev == null ? (
                      <span className="text-base-content/40" title="A balance is missing">
                        -
                      </span>
                    ) : item.changeFromPrev < 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-emerald-600">
                        <ArrowDownRight size={13} />
                        {num(item.changeFromPrev)}
                      </span>
                    ) : item.changeFromPrev > 0 ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-rose-500">
                        <ArrowUpRight size={13} />+{num(item.changeFromPrev)}
                      </span>
                    ) : (
                      <span className="text-base-content/40">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SOBalanceHistoryModal: React.FC<SOBalanceHistoryModalProps> = ({
  isOpen,
  onClose,
  row,
}) => {
  const [history, setHistory] = useState<SOBalanceHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !row) {
      setHistory([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const fetchHistory = async () => {
      setHistory([]);
      setLoading(true);
      setError(null);
      try {
        const res = await axios.get<ApiResponse<SOBalanceHistoryRow[]>>(
          SO_BALANCE_HISTORY_API,
          {
            params: {
              prd_name: row.prd_name,
              due_date: row.due_date,
            },
            timeout: 8000,
            signal: controller.signal,
          }
        );

        if (controller.signal.aborted) return;
        if (res.data?.status === "OK" && Array.isArray(res.data.data)) {
          setHistory(res.data.data);
        } else {
          setError(res.data?.message || "Unable to load history.");
        }
      } catch {
        if (controller.signal.aborted) return;
        console.error("Failed to fetch SO balance history.");
        setError("Unable to connect to the server to load history.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchHistory();
    return () => controller.abort();
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

  const lineGroups = useMemo(() => groupHistoryByLine(history), [history]);
  const activeGroups = useMemo(() => lineGroups.filter((g) => g.isActive), [lineGroups]);
  const inactiveGroups = useMemo(() => lineGroups.filter((g) => !g.isActive), [lineGroups]);
  const activeTotal = useMemo(() => computeLatestLinesTotal(lineGroups), [lineGroups]);

  if (typeof document === "undefined") return null;

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
            aria-label="SO Balance History"
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 6 }}
            transition={{ type: "spring", duration: 0.25, bounce: 0.1 }}
            className="relative z-10 flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 border-b border-base-300">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <History size={18} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold text-base-content">SO Balance History</h2>
                    {activeGroups.length > 0 && (
                      <span className="inline-flex h-5 items-center rounded-md bg-primary/10 border border-primary/20 px-2 text-[11px] font-bold text-primary tabular-nums">
                        {activeGroups.length} {activeGroups.length === 1 ? "active line" : "active lines"}
                      </span>
                    )}
                    {inactiveGroups.length > 0 && (
                      <span className="inline-flex h-5 items-center rounded-md bg-amber-100 border border-amber-300 px-2 text-[11px] font-bold text-amber-800 tabular-nums">
                        {inactiveGroups.length} moved / removed
                      </span>
                    )}
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
            <div className="flex flex-1 min-h-0 flex-col gap-3.5 overflow-y-auto p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-base-content/60">
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <span className="text-sm">Loading SO Balance history...</span>
                </div>
              ) : error ? (
                <div className="flex items-center gap-3 rounded-xl border border-error/20 bg-error/10 p-4 text-sm text-error">
                  <Info size={18} />
                  <span>{error}</span>
                </div>
              ) : lineGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
                  <div className="mb-3 rounded-full bg-base-200 p-3 text-base-content/40">
                    <Layers size={28} />
                  </div>
                  <h3 className="mb-1 text-base font-bold text-base-content">No history available</h3>
                  <p className="mb-4 max-w-sm text-xs text-base-content/60">
                    No SO/PO revision history has been recorded for this product and due date.
                  </p>
                  <div className="inline-flex items-center gap-2 rounded-xl border border-base-300 bg-base-200/70 p-3 text-xs">
                    <span className="text-base-content/60">Current SO balance in the main table:</span>
                    <strong className="text-sm font-bold tabular-nums text-primary">{num(row.po_bal)} pcs</strong>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary strip */}
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/50 px-4 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-base-content/65">
                        Main Table SO Bal:{" "}
                        <strong className="font-bold text-base-content tabular-nums">{num(row.po_bal)} pcs</strong>
                      </span>
                      <span className="text-base-content/30">|</span>
                      <span className="text-base-content/65">
                        Sum of Active Lines:{" "}
                        <strong className="font-bold text-primary tabular-nums">{num(activeTotal)} pcs</strong>
                      </span>
                    </div>
                  </div>

                  {/* Active SO/PO line cards */}
                  {activeGroups.map((group) => (
                    <LineHistoryCard key={group.key} group={group} />
                  ))}

                  {/* Moved / Removed SO/PO line cards */}
                  {inactiveGroups.length > 0 && (
                    <div className="mt-1 flex shrink-0 flex-col gap-3">
                      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-base-content/55">
                        <span>Moved / Removed from this Due Date</span>
                        <span className="font-normal normal-case tracking-normal text-base-content/45">
                          (not included in current total)
                        </span>
                      </div>
                      {inactiveGroups.map((group) => (
                        <LineHistoryCard key={group.key} group={group} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-base-300 bg-base-200/40 px-5 py-3 text-xs text-base-content/60">
              <span className="flex items-center gap-1.5">
                <Info size={13} className="shrink-0 text-primary" />
                Grouped by SO / PO line. Active lines match the main table total; moved or removed lines are kept for reference.
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

export default SOBalanceHistoryModal;
