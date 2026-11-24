import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { Calendar as CalendarIcon, Inbox, Search, X } from "lucide-react";
import type { BoardShiftAllocation, LotItem } from "../../Capacity_Leveling/types";
import type { CountUnit } from "../types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planQuantity, planShiftBadge, planStatus, type PlanShiftSummary } from "../savedPlan";

type ShiftBucket = "all" | "ds" | "ns" | "over" | "other";

interface PlannedArrivalDrawerProps {
  gate: string;
  date: string;
  product?: string;
  version?: number;
  unit: CountUnit;
  rows: LotItem[];
  summary: PlanShiftSummary | null;
  allocations?: ReadonlyMap<string, BoardShiftAllocation>;
  onClose: () => void;
}

const MAX_RENDERED_ROWS = 200;

const fmtQuantity = (value: number | null, unit: CountUnit) =>
  formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet");

const SHIFT_BADGE_CLASS = {
  ds: "bg-[#fdecb3] text-[#8a5a00]",
  ns: "bg-[#e9e3fb] text-[#5a3fc0]",
  over: "bg-rose-600 text-white",
  muted: "bg-base-200 border border-base-300 text-base-content/70",
} as const;

const statusBadgeClass = (status: string) => {
  switch (status) {
    case "In gate":
      return "bg-emerald-600 text-white";
    case "Coming":
      return "bg-slate-700 text-white";
    case "HOLD":
      return "bg-rose-600 text-white";
    case "Need WIP":
      return "bg-amber-600 text-white";
    default:
      return "bg-base-200 border border-base-300 text-base-content/70";
  }
};

export function PlannedArrivalDrawer({
  gate,
  date,
  product,
  version,
  unit,
  rows,
  summary,
  allocations,
  onClose,
}: PlannedArrivalDrawerProps) {
  const [shiftFilter, setShiftFilter] = useState<ShiftBucket>("all");
  const [query, setQuery] = useState("");
  const [entered, setEntered] = useState(false);
  const dialog = useRef<HTMLElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  const enriched = useMemo(
    () =>
      rows.map(lot => {
        const badge = planShiftBadge(lot, allocations?.get(lot.id));
        const status = planStatus(lot);
        const bucket: Exclude<ShiftBucket, "all"> =
          badge.tone === "ds"
            ? "ds"
            : badge.tone === "ns"
              ? "ns"
              : badge.tone === "over"
                ? "over"
                : "other";
        return { lot, badge, status, bucket };
      }),
    [rows, allocations],
  );

  const metrics = useMemo(() => {
    let ds = 0;
    let ns = 0;
    let over = 0;
    let other = 0;
    let lotCount = 0;
    let needCount = 0;
    let totalLoadMin: number | null = 0;
    let hasPhysicalLots = false;

    for (const item of enriched) {
      if (item.bucket === "ds") ds++;
      else if (item.bucket === "ns") ns++;
      else if (item.bucket === "over") over++;
      else other++;

      if (item.lot.kind === "lot") {
        lotCount++;
        hasPhysicalLots = true;
        if (totalLoadMin !== null) {
          totalLoadMin = item.lot.loadMin === null ? null : totalLoadMin + item.lot.loadMin;
        }
      } else {
        needCount++;
      }
    }

    return {
      ds,
      ns,
      over,
      other,
      lotCount,
      needCount,
      pcs: rows.length > 0 ? planQuantity(rows, "pcs") : undefined,
      sheets: rows.length > 0 ? planQuantity(rows, "sheets") : undefined,
      totalLoadMin: hasPhysicalLots ? totalLoadMin : null,
    };
  }, [enriched, rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter(({ lot, badge, status, bucket }) => {
      if (shiftFilter !== "all" && bucket !== shiftFilter) return false;
      if (!q) return true;
      return (
        lot.product.toLowerCase().includes(q) ||
        lot.label.toLowerCase().includes(q) ||
        status.toLowerCase().includes(q) ||
        badge.label.toLowerCase().includes(q)
      );
    });
  }, [enriched, shiftFilter, query]);

  const visibleRows = filtered.slice(0, MAX_RENDERED_ROWS);
  const isFiltered = shiftFilter !== "all" || query.trim().length > 0;
  const dateDisplay = dayjs(date).format("DD/MM/YYYY");
  const dateWeekday = dayjs(date).format("ddd, DD MMM");

  // Compute shift proportion bar from unit totals when finite, else fallback to lot counts.
  const barWeights = useMemo(() => {
    const dsVal = summary?.hasDs && typeof summary.ds === "number" ? summary.ds : null;
    const nsVal = summary?.hasNs && typeof summary.ns === "number" ? summary.ns : null;
    const overVal = summary?.hasOver && typeof summary.over === "number" ? summary.over : null;
    const canUseUnit =
      (!summary?.hasDs || dsVal !== null) &&
      (!summary?.hasNs || nsVal !== null) &&
      (!summary?.hasOver || overVal !== null);
    const dsW = canUseUnit ? (dsVal ?? 0) : metrics.ds;
    const nsW = canUseUnit ? (nsVal ?? 0) : metrics.ns;
    const overW = canUseUnit ? (overVal ?? 0) : metrics.over;
    const total = dsW + nsW + overW;
    return { dsW, nsW, overW, total };
  }, [summary, metrics.ds, metrics.ns, metrics.over]);

  const hasExceptions = Boolean(
    summary && (summary.hasOver || summary.hasNoLoad || summary.hasNeed || summary.hasUnassigned),
  );

  const filterChip = (value: ShiftBucket, label: string, count: number) => {
    const active = shiftFilter === value;
    return (
      <button
        key={value}
        type="button"
        aria-pressed={active}
        onClick={() => setShiftFilter(value)}
        className={`h-6 rounded-md px-2 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
          active
            ? "bg-[#4f46e5] text-white shadow-xs"
            : "text-base-content/70 hover:text-base-content hover:bg-base-100/70"
        }`}
      >
        <span>{label}</span>
        <span className={`tabular-nums ${active ? "text-white/80" : "text-base-content/45"}`}>{count}</span>
      </button>
    );
  };

  return createPortal(
    <div
      className="planning-summary-gate fixed inset-0 z-[120] flex justify-end"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
        if (event.key === "Tab") {
          const controls = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex="0"]',
          );
          if (!controls?.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }}
    >
      {/* Subtle backdrop matching Capacity Leveling detail drawer */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close lot details backdrop"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-900/25 transition-opacity duration-300 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Full-height right drawer aligned with LotDetailSidePanel */}
      <aside
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="planned-arrivals-title"
        className={`relative flex h-dvh w-full max-w-[820px] flex-col border-l border-base-300 bg-base-100 text-base-content shadow-2xl transition-transform duration-300 ease-out ${
          entered ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* 1. Header */}
        <div className="px-5 py-4 border-b border-base-200 bg-base-100 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-600 text-white">
                  {gate}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700 text-white">
                  Planned arrivals
                </span>
                {version !== undefined && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-600 text-white">
                    Plan v{version}
                  </span>
                )}
                {summary?.hasOver && (
                  <span className="px-1.5 py-0.5 rounded text-[10.5px] font-bold bg-rose-600 text-white">
                    Over capacity
                  </span>
                )}
              </div>
              <h3 id="planned-arrivals-title" className="text-[16px] font-bold text-base-content leading-snug break-all">
                {product ?? "All matching products"}
              </h3>
              <div className="flex items-center flex-wrap gap-1.5 text-xs text-base-content/70 mt-0.5 tabular-nums">
                <CalendarIcon size={13} className="text-primary shrink-0" />
                <span className="font-bold text-base-content" title={date}>{dateDisplay}</span>
                <span className="text-base-content/50">({dateWeekday})</span>
                <span className="text-base-content/30">•</span>
                <span className="text-base-content/60">Status at save</span>
              </div>
            </div>

            <button
              ref={close}
              type="button"
              onClick={onClose}
              className="btn btn-xs btn-ghost btn-square h-7 w-7 shrink-0 text-base-content/50 hover:text-base-content hover:bg-base-200 cursor-pointer"
              aria-label="Close lot details"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 text-xs text-base-content/65 mt-2.5 pt-2 border-t border-base-200 tabular-nums">
            <span>
              <strong className="text-base-content">{metrics.lotCount.toLocaleString()}</strong> lots
              {metrics.needCount > 0 && (
                <span className="text-base-content/55"> (+{metrics.needCount} need)</span>
              )}
            </span>
            <span className="text-base-content/30">•</span>
            <span>
              <strong className="text-base-content">
                {metrics.pcs === undefined ? "—" : formatGateQuantity(metrics.pcs, "piece")}
              </strong>{" "}
              pcs
            </span>
            <span className="text-base-content/30">•</span>
            <span>
              <strong className="text-base-content">
                {metrics.sheets === undefined ? "—" : formatGateQuantity(metrics.sheets, "sheet")}
              </strong>{" "}
              sheets
            </span>
            {metrics.totalLoadMin !== null && (
              <>
                <span className="text-base-content/30">•</span>
                <span>
                  <strong className="text-base-content">
                    {Math.round(metrics.totalLoadMin).toLocaleString()}
                  </strong>{" "}
                  min load
                </span>
              </>
            )}
          </div>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5 text-xs">
          {/* Shift Breakdown Card */}
          {summary && (
            <div className="rounded-xl border border-base-200 bg-base-100 p-3 flex flex-col gap-2 tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                  Shift Breakdown
                </span>
                <span className="text-[11px] text-base-content/65">
                  Total:{" "}
                  <strong className="text-base-content">
                    {fmtQuantity(summary.total, unit)}
                  </strong>{" "}
                  {unit}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-base-200 border border-base-300">
                  <span className="inline-flex items-center gap-1.5 font-medium text-base-content/75">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fdecb3] text-[#8a5a00]">D/S</span>
                    <span>Day Shift</span>
                  </span>
                  <span className="font-bold text-base-content">
                    {summary.hasDs ? fmtQuantity(summary.ds, unit) : "—"}
                    {unit !== "lots" && metrics.ds > 0 && (
                      <span className="ml-1 font-normal text-base-content/50">({metrics.ds} lots)</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-base-200 border border-base-300">
                  <span className="inline-flex items-center gap-1.5 font-medium text-base-content/75">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e9e3fb] text-[#5a3fc0]">N/S</span>
                    <span>Night Shift</span>
                  </span>
                  <span className="font-bold text-base-content">
                    {summary.hasNs ? fmtQuantity(summary.ns, unit) : "—"}
                    {unit !== "lots" && metrics.ns > 0 && (
                      <span className="ml-1 font-normal text-base-content/50">({metrics.ns} lots)</span>
                    )}
                  </span>
                </div>
              </div>

              {barWeights.total > 0 && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-200 flex">
                  {barWeights.dsW > 0 && (
                    <div
                      style={{ width: `${(barWeights.dsW / barWeights.total) * 100}%` }}
                      className="h-full bg-[#f5c542] transition-all duration-300"
                      title={`D/S: ${summary.hasDs ? fmtQuantity(summary.ds, unit) : "—"}`}
                    />
                  )}
                  {barWeights.nsW > 0 && (
                    <div
                      style={{ width: `${(barWeights.nsW / barWeights.total) * 100}%` }}
                      className="h-full bg-[#6d4fd8] transition-all duration-300"
                      title={`N/S: ${summary.hasNs ? fmtQuantity(summary.ns, unit) : "—"}`}
                    />
                  )}
                  {barWeights.overW > 0 && (
                    <div
                      style={{ width: `${(barWeights.overW / barWeights.total) * 100}%` }}
                      className="h-full bg-rose-600 transition-all duration-300"
                      title={`Over: ${summary.hasOver ? fmtQuantity(summary.over, unit) : "—"}`}
                    />
                  )}
                </div>
              )}

              {hasExceptions && (
                <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-base-200 text-[11px]">
                  {summary.hasOver && (
                    <span className="px-2 py-0.5 rounded font-bold bg-rose-600 text-white">
                      Over: {fmtQuantity(summary.over, unit)}
                    </span>
                  )}
                  {summary.hasNoLoad && (
                    <span className="px-2 py-0.5 rounded font-semibold bg-base-200 border border-base-300 text-base-content/75">
                      No load: {fmtQuantity(summary.noLoad, unit)}
                    </span>
                  )}
                  {summary.hasNeed && (
                    <span className="px-2 py-0.5 rounded font-bold bg-amber-600 text-white">
                      Need WIP: {fmtQuantity(summary.need, unit)}
                    </span>
                  )}
                  {summary.hasUnassigned && (
                    <span className="px-2 py-0.5 rounded font-semibold bg-base-200 border border-base-300 text-base-content/75">
                      Unassigned: {fmtQuantity(summary.unassigned, unit)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Planned Lots List Card */}
          <div className="rounded-xl border border-base-200 bg-base-100 flex flex-col overflow-hidden">
            {/* Filter & Search Bar */}
            <div className="px-3 py-2.5 border-b border-base-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                  Planned Lots
                </span>
                <div
                  role="group"
                  aria-label="Filter by shift"
                  className="inline-flex items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/80 p-0.5"
                >
                  {filterChip("all", "All", rows.length)}
                  {filterChip("ds", "D/S", metrics.ds)}
                  {filterChip("ns", "N/S", metrics.ns)}
                  {metrics.over > 0 && filterChip("over", "Over", metrics.over)}
                  {metrics.other > 0 && filterChip("other", "Other", metrics.other)}
                </div>
              </div>

              <div className="relative w-full sm:w-56">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={product ? "Filter lot, status..." : "Filter product, lot, status..."}
                  className="w-full h-7 rounded-lg border border-base-300 bg-base-100 pl-7 pr-6 text-xs text-base-content focus:outline-none focus:border-primary"
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/45 hover:text-base-content cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-base-200 text-base-content/40">
                  <Inbox size={20} />
                </div>
                <p className="mt-2.5 font-bold text-base-content/80">No saved arrivals for this selection</p>
                <p className="mt-0.5 text-[11px] text-base-content/55">
                  There are no planned cards scheduled for this gate and date in the saved plan.
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <p className="font-semibold text-base-content/75">No planned lots match your current filter</p>
                <button
                  type="button"
                  onClick={() => {
                    setShiftFilter("all");
                    setQuery("");
                  }}
                  className="mt-2 btn btn-xs h-7 px-2.5 rounded-lg bg-base-200 hover:bg-base-300 border border-base-300 text-base-content text-[11px] font-semibold cursor-pointer"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums border-collapse">
                  <thead className="bg-base-200/70 border-b border-base-200 text-[11px] font-bold uppercase tracking-wider text-base-content/55">
                    <tr>
                      <th className="py-2 pl-3 pr-2 text-right w-9">#</th>
                      <th className="py-2 px-2.5">Product</th>
                      <th className="py-2 px-2.5">Lot</th>
                      <th className="py-2 px-2.5 text-center">Shift</th>
                      <th className="py-2 px-2.5 text-right">Load</th>
                      <th className="py-2 px-2.5 text-right">Pcs</th>
                      <th className="py-2 px-2.5 text-right">Sheets</th>
                      <th className="py-2 pl-2.5 pr-3">Status at save</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200/70">
                    {visibleRows.map(({ lot, badge, status }, index) => {
                      const isLot = lot.kind === "lot";
                      const loadText = !isLot
                        ? "—"
                        : lot.loadMin === null
                          ? "N/A"
                          : `${Math.round(lot.loadMin).toLocaleString()} min`;
                      return (
                        <tr key={lot.id} className="hover:bg-base-200/45 transition-colors">
                          <td className="py-2 pl-3 pr-2 text-right text-[11px] text-base-content/40">
                            {index + 1}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-base-content whitespace-nowrap">
                            {lot.product}
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <span
                              className={
                                isLot
                                  ? "font-mono font-bold text-base-content/85"
                                  : "italic text-base-content/55"
                              }
                            >
                              {lot.label}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <span
                              title={badge.reason}
                              className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-bold ${SHIFT_BADGE_CLASS[badge.tone]}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right whitespace-nowrap ${
                              !isLot || lot.loadMin === null
                                ? "text-base-content/40"
                                : "text-base-content/75 font-medium"
                            }`}
                          >
                            {loadText}
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right whitespace-nowrap ${
                              lot.qty === null ? "text-base-content/40" : "font-semibold text-base-content"
                            }`}
                          >
                            {formatGateQuantity(lot.qty, "piece")}
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right whitespace-nowrap ${
                              lot.sheets === null ? "text-base-content/40" : "font-semibold text-base-content"
                            }`}
                          >
                            {formatGateQuantity(lot.sheets, "sheet")}
                          </td>
                          <td className="py-2 pl-2.5 pr-3 whitespace-nowrap">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10.5px] font-bold ${statusBadgeClass(status)}`}
                            >
                              {status}
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
        </div>

        {/* 3. Footer */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-base-200 bg-base-100 px-5 py-3 text-[11px] text-base-content/60">
          <div>
            {filtered.length > MAX_RENDERED_ROWS ? (
              <>
                Showing first <strong className="text-base-content tabular-nums">{MAX_RENDERED_ROWS}</strong> of{" "}
                <strong className="text-base-content tabular-nums">{filtered.length.toLocaleString()}</strong> records
                <span className="mx-1.5 text-base-content/30">•</span>
                <span>Use the daily view or Excel for the full list.</span>
              </>
            ) : (
              <>
                <strong className="text-base-content tabular-nums">
                  {isFiltered
                    ? `${filtered.length.toLocaleString()} / ${rows.length.toLocaleString()}`
                    : rows.length.toLocaleString()}
                </strong>{" "}
                {rows.length === 1 ? "record shown" : "records shown"}
                <span className="mx-1.5 text-base-content/30">•</span>
                <span>{version !== undefined ? `Saved snapshot baseline (Plan v${version}).` : "Saved snapshot baseline."}</span>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
