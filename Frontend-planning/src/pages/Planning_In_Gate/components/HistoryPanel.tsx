import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { History, Search, Send, X } from "lucide-react";
import type { OrderDiff, OrderHistoryEntry, SavedPlanInfo } from "../types";
import { CapacityEffect, MoveLine } from "./HistoryParts";
import type { LotItem } from "../../Capacity_Leveling/types";

type Filter = "all" | "up" | "down";

interface HistoryPanelProps {
  snapshotLots?: LotItem[];
  isOpen: boolean;
  onClose: () => void;
  title: string; // "FFPC · Mon 09/11"
  plan: SavedPlanInfo | undefined;
  entries: OrderHistoryEntry[]; // newest first
  pending: OrderDiff | null; // unsaved moves
}

/** Right-side drawer: who moved which lot, when, from → to, and why */
export const HistoryPanel: React.FC<HistoryPanelProps> = ({ isOpen, onClose, title, plan, entries, pending, snapshotLots }) => {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const q = query.trim().toLowerCase();
  const keepMove = useMemo(
    () => (m: { lotId: string; from: number; to: number }) =>
      (filter === "all" || (filter === "up" ? m.to < m.from : m.to > m.from)) &&
      (!q || m.lotId.toLowerCase().includes(q)),
    [filter, q]
  );
  const filtering = filter !== "all" || Boolean(q);

  const visible = useMemo(
    () =>
      entries
        .map((e) => ({ ...e, shown: e.moves.filter(keepMove) }))
        .filter((e) => !filtering || e.shown.length > 0),
    [entries, keepMove, filtering]
  );
  const pendingShown = pending ? pending.moves.filter(keepMove) : [];
  const savedMoves = useMemo(() => {
    const seen = new Set<string>();
    return (snapshotLots ?? []).flatMap(lot => (lot.moveHistory ?? []).map(move => ({ ...move, lot: lot.label })))
      .filter(move => {
        if (seen.has(move.id)) return false;
        seen.add(move.id);
        return (!q || move.lot.toLowerCase().includes(q)) && (filter === "all" ||
          (move.kind === "reorder" && typeof move.fromPosition === "number" && typeof move.toPosition === "number"
            && (filter === "up" ? move.toPosition < move.fromPosition : move.toPosition > move.fromPosition)));
      }).sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));
  }, [snapshotLots, q, filter]);

  if (!isOpen || typeof document === "undefined") return null;

  const chip = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold ${
        filter === value ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[110] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Order history"
        className="relative flex h-full w-full max-w-[440px] flex-col border-l border-base-300 bg-base-100 text-base-content shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <History size={18} className="text-[#4f46e5]" />
            <div>
              <h3 className="text-base font-bold leading-tight">History</h3>
              <p className="text-xs text-base-content/60">{title}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost btn-square rounded-lg" aria-label="Close">
            <X size={17} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 border-b border-base-200 px-5 py-3">
          <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/80 p-0.5">
            {chip("all", "All")}
            {chip("up", "Up ↑")}
            {chip("down", "Down ↓")}
          </div>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Lot no"
              className="input input-xs input-bordered h-8 w-full rounded-lg bg-base-200/40 pl-7 text-xs focus:bg-base-100"
            />
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          <ol className="relative space-y-4 border-l-2 border-base-200 pl-5">
            {savedMoves.map(move => <li key={move.id} className="relative">
              <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-base-100 bg-[#4f46e5]" />
              <div className="text-xs font-bold">{move.changedBy} · {dayjs(move.changedAt).format("DD/MM HH:mm")}{move.planVersion ? ` · Plan v${move.planVersion}` : ""}</div>
              <div className="mt-1 text-xs">{move.lot} · {move.kind === "reorder" ? `#${move.fromPosition} → #${move.toPosition}` : `${move.fromDate} → ${move.toDate}`}</div>
              {move.note && <div className="mt-1 text-xs italic text-base-content/60">{move.note}</div>}
            </li>)}
            {pending && pendingShown.length > 0 && (
              <li className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-base-100 bg-amber-500" />
                <div className="text-xs font-bold text-amber-700">Not saved yet</div>
                <ul className="mt-1">
                  {pendingShown.map((m) => (
                    <MoveLine key={m.lotId} move={m} />
                  ))}
                </ul>
                {!filtering && <CapacityEffect diff={pending} />}
              </li>
            )}

            {visible.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-base-100 bg-[#4f46e5]" />
                <div className="text-xs font-bold">
                  {e.savedBy} <span className="font-normal text-base-content/60">· {dayjs(e.savedAt).format("DD/MM HH:mm")} · Plan v{e.planVersion}</span>
                </div>
                {e.reason && (
                  <div className="mt-1 rounded-lg bg-base-200/60 px-2.5 py-1 text-xs italic text-base-content/80">
                    “{e.reason}”
                  </div>
                )}
                <ul className="mt-1">
                  {e.shown.map((m) => (
                    <MoveLine key={m.lotId} move={m} />
                  ))}
                </ul>
                {!filtering && <CapacityEffect diff={e} />}
              </li>
            ))}

            {/* Origin: plan sent from Capacity Leveling */}
            {plan && !filtering && (
              <li className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-base-100 bg-base-300" />
                <div className="flex items-center gap-1.5 text-xs font-bold text-base-content/70">
                  <Send size={12} /> Plan v{plan.version} sent from Capacity Leveling
                </div>
                <div className="text-xs text-base-content/50">
                  {plan.savedBy} · {dayjs(plan.savedAt).format("DD/MM HH:mm")} · original planning order
                </div>
                {plan.reason && <div className="mt-1 text-xs italic text-base-content/60">“{plan.reason}”</div>}
              </li>
            )}
          </ol>

          {filtering && visible.length === 0 && pendingShown.length === 0 && savedMoves.length === 0 && (
            <p className="py-8 text-center text-base-content/50">No moves match this filter.</p>
          )}
          {!filtering && entries.length === 0 && !pending && (
            <p className="mt-4 text-center text-xs text-base-content/50">{snapshotLots ? "Showing saved Capacity Leveling history. Gate order editing is not connected yet." : "No changes yet — the gate runs the planning order."}</p>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
};
