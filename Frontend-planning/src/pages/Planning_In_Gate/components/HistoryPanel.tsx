import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ArrowDown, ArrowRight, ArrowUp, History, Search, Send, X } from "lucide-react";
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
export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  isOpen,
  onClose,
  title,
  plan,
  entries,
  pending,
  snapshotLots,
}) => {
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

  const savedMoveGroups = useMemo(() => {
    const seen = new Set<string>();
    const allMoves = (snapshotLots ?? [])
      .flatMap((lot) =>
        (lot.moveHistory ?? []).map((move) => ({
          ...move,
          lot: lot.label,
          product: lot.product,
        }))
      )
      .filter((move) => {
        if (seen.has(move.id)) return false;
        seen.add(move.id);
        // Only keep queue reorder moves or moves tagged for Planning In Gate
        const isReorderInGate = move.note?.includes("Planning In Gate") || move.kind === "reorder";
        if (!isReorderInGate) return false;
        return (
          (!q || move.lot.toLowerCase().includes(q)) &&
          (filter === "all" ||
            (move.kind === "reorder" &&
              typeof move.fromPosition === "number" &&
              typeof move.toPosition === "number" &&
              (filter === "up"
                ? move.toPosition < move.fromPosition
                : move.toPosition > move.fromPosition)))
        );
      })
      .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt));

    const groups: {
      key: string;
      changedBy: string;
      changedAt: string;
      planVersion?: number;
      note?: string;
      moves: typeof allMoves;
    }[] = [];

    for (const move of allMoves) {
      const key = `${move.planVersion ?? ""}|${move.changedAt}|${move.changedBy}|${move.note ?? ""}`;
      let group = groups.find((g) => g.key === key);
      if (!group) {
        group = {
          key,
          changedBy: move.changedBy,
          changedAt: move.changedAt,
          planVersion: move.planVersion,
          note: move.note,
          moves: [],
        };
        groups.push(group);
      }
      group.moves.push(move);
    }

    return groups;
  }, [snapshotLots, q, filter]);

  if (!isOpen || typeof document === "undefined") return null;

  const totalSavedMovesCount = savedMoveGroups.reduce((sum, g) => sum + g.moves.length, 0);

  const chip = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold transition-all cursor-pointer ${
        filter === value
          ? "btn-primary shadow-xs"
          : "btn-ghost text-base-content/70 hover:bg-base-300/50"
      }`}
    >
      {label}
    </button>
  );

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[110] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/15 transition-opacity" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Order history"
        className="relative flex h-full w-full max-w-[580px] flex-col border-l border-base-300 bg-base-100 text-base-content shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-base-300 px-5 py-4 bg-base-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <History size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">Order History</h3>
              <p className="text-xs text-base-content/60">{title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-ghost btn-circle rounded-lg text-base-content/60 hover:text-base-content cursor-pointer"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-base-200 px-5 py-3 bg-base-200/30">
          <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/80 p-0.5 shrink-0">
            {chip("all", "All")}
            {chip("up", "Up ↑")}
            {chip("down", "Down ↓")}
          </div>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter lot no..."
              className="input input-xs input-bordered h-8 w-full rounded-lg bg-base-100 pl-7 text-xs focus:border-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Timeline Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
          <ol className="relative space-y-5 border-l-2 border-base-200 ml-2.5 pl-5">
            {/* Grouped Saved Moves */}
            {savedMoveGroups.map((group) => (
              <li key={group.key} className="relative">
                {/* Timeline node */}
                <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-base-100 bg-[#316be8] shadow-xs" />

                {/* Event Card */}
                <div className="rounded-xl border border-base-300/80 bg-base-100 p-3.5 shadow-2xs">
                  {/* Event summary header */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {group.planVersion ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#316be8]/10 text-[#316be8]">
                          Plan v{group.planVersion}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                          Draft
                        </span>
                      )}
                      <span className="text-xs font-bold text-base-content">{group.changedBy}</span>
                      <span className="text-xs text-base-content/50">· {dayjs(group.changedAt).format("DD/MM HH:mm")}</span>
                      {group.note && (
                        <span className="text-xs text-base-content/60 font-medium">
                          ({group.note})
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-base-content/50 tabular-nums">
                      {group.moves.length} {group.moves.length === 1 ? "lot moved" : "lots moved"}
                    </span>
                  </div>

                  {/* Move Items */}
                  <div className="divide-y divide-base-200/60 border-t border-base-200 pt-1">
                    {group.moves.map((move) => {
                      const isReorder =
                        move.kind === "reorder" &&
                        typeof move.fromPosition === "number" &&
                        typeof move.toPosition === "number";
                      const up = isReorder && (move.toPosition as number) < (move.fromPosition as number);

                      return (
                        <div
                          key={move.id}
                          className="flex items-center justify-between py-1.5 px-1 text-xs tabular-nums hover:bg-base-200/40 rounded transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`text-xs font-bold shrink-0 ${
                                up ? "text-[#316be8]" : "text-base-content/40"
                              }`}
                              title={up ? "Moved up" : "Moved down"}
                            >
                              {up ? "↑" : "↓"}
                            </span>
                            <span className="font-semibold text-base-content shrink-0 tabular-nums">
                              {move.lot}
                            </span>
                            {move.product && (
                              <span className="text-base-content/50 text-[11px] truncate">
                                · {move.product}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 text-xs">
                            {isReorder ? (
                              <>
                                <span className="text-base-content/50 font-medium">{move.fromPosition}</span>
                                <ArrowRight size={11} className="text-base-content/30" />
                                <span className={`font-bold ${up ? "text-[#316be8]" : "text-base-content"}`}>
                                  {move.toPosition}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-base-content/50">{move.fromDate}</span>
                                <ArrowRight size={11} className="text-base-content/30" />
                                <span className="font-bold text-base-content">{move.toDate}</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </li>
            ))}

            {/* Pending (Unsaved) */}
            {pending && pendingShown.length > 0 && (
              <li className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-base-100 bg-amber-500 shadow-xs" />
                <div className="rounded-xl border border-amber-300/60 bg-amber-50/20 p-3 shadow-2xs">
                  <div className="text-xs font-bold text-amber-700">Not saved yet</div>
                  <ul className="mt-2 divide-y divide-base-200/50">
                    {pendingShown.map((m) => (
                      <MoveLine key={m.lotId} move={m} />
                    ))}
                  </ul>
                  {!filtering && <CapacityEffect diff={pending} />}
                </div>
              </li>
            )}

            {/* Visible Order History Entries */}
            {visible.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-base-100 bg-[#316be8] shadow-xs" />
                <div className="rounded-xl border border-base-300/80 bg-base-100 p-3.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#316be8]/10 text-[#316be8]">
                        Plan v{e.planVersion}
                      </span>
                      <span className="text-xs font-bold text-base-content">{e.savedBy}</span>
                      <span className="text-xs text-base-content/50">· {dayjs(e.savedAt).format("DD/MM HH:mm")}</span>
                      {e.reason && (
                        <span className="text-xs text-base-content/60 font-medium">
                          ({e.reason})
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold text-base-content/50 tabular-nums">
                      {e.shown.length} {e.shown.length === 1 ? "move" : "moves"}
                    </span>
                  </div>
                  <ul className="divide-y divide-base-200/60 border-t border-base-200 pt-1">
                    {e.shown.map((m) => (
                      <MoveLine key={m.lotId} move={m} />
                    ))}
                  </ul>
                  {!filtering && <div className="mt-2 pt-2 border-t border-base-200"><CapacityEffect diff={e} /></div>}
                </div>
              </li>
            ))}

            {/* Origin plan */}
            {plan && !filtering && (
              <li className="relative">
                <span className="absolute -left-[27px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-base-100 bg-base-300" />
                <div className="flex items-center gap-1.5 text-xs font-bold text-base-content/70">
                  <Send size={12} /> Plan v{plan.version} sent from Capacity Leveling
                </div>
                <div className="text-xs text-base-content/50 mt-0.5">
                  {plan.savedBy} · {dayjs(plan.savedAt).format("DD/MM HH:mm")} · original planning order
                </div>
                {plan.reason && <div className="mt-1 text-xs italic text-base-content/60">“{plan.reason}”</div>}
              </li>
            )}
          </ol>

          {filtering && visible.length === 0 && pendingShown.length === 0 && totalSavedMovesCount === 0 && (
            <div className="py-12 text-center text-xs text-base-content/50">No moves match this filter.</div>
          )}
          {!filtering && entries.length === 0 && !pending && totalSavedMovesCount === 0 && (
            <p className="mt-4 text-center text-xs text-base-content/50">
              {snapshotLots
                ? "No reorder history recorded for this gate and date yet."
                : "No changes yet — the gate runs the planning order."}
            </p>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
};
