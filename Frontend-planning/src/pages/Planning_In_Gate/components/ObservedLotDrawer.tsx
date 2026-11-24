import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import dayjs from "dayjs";
import {
  AlertCircle,
  ArrowRight,
  Calendar as CalendarIcon,
  ChevronDown,
  Clock,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { getApiBaseUrl } from "@/utils/apiConfig";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { validateOutputLots, type OutputLot, type OutputSelection } from "../monthlyOutput";

type ShiftFilter = "all" | "D/S" | "N/S";

interface ObservedLotDrawerProps {
  selection: OutputSelection;
  planVersion?: number;
  onClose: () => void;
}

function sumNullable(rows: OutputLot[], field: "pcs" | "sheets"): number | null | undefined {
  if (!rows.length) return undefined;
  return rows.reduce<number | null>((total, row) => {
    const val = row[field];
    if (total === null || val === null || !Number.isFinite(val)) return null;
    const next = total + val;
    return Number.isFinite(next) && next <= Number.MAX_SAFE_INTEGER ? next : null;
  }, 0);
}

const formatEvidenceTime = (row: OutputLot) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: row.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(row.outAt));

export function ObservedLotDrawer({ selection, planVersion, onClose }: ObservedLotDrawerProps) {
  const [state, setState] = useState<{ rows: OutputLot[]; nextCursor: string | null; loading: boolean; error?: string }>({
    rows: [],
    nextCursor: null,
    loading: true,
  });
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [query, setQuery] = useState("");
  const [entered, setEntered] = useState(false);
  const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const load = useCallback(async (cursor?: string) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ ...previous, loading: true, error: undefined }));
    try {
      const response = await axios.get(`${getApiBaseUrl()}/capacity_leveling/routing/output/lots`, {
        params: { ...selection, cursor },
        signal: controller.signal,
        timeout: 20000,
      });
      const page = validateOutputLots(response.data?.data, selection, cursor);
      if (!controller.signal.aborted) {
        setState(previous => ({
          rows: cursor ? [...previous.rows, ...page.rows] : page.rows,
          nextCursor: page.nextCursor,
          loading: false,
        }));
      }
    } catch {
      if (!controller.signal.aborted) {
        setState(previous => ({
          ...previous,
          loading: false,
          error: "Unable to load output lots. Please retry.",
        }));
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [selection]);

  useEffect(() => {
    void load();
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [load]);

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

  const summary = useMemo(() => {
    let ds = 0;
    let ns = 0;
    for (const row of state.rows) {
      if (row.shift === "D/S") ds++;
      else if (row.shift === "N/S") ns++;
    }
    return {
      total: state.rows.length,
      ds,
      ns,
      pcs: sumNullable(state.rows, "pcs"),
      sheets: sumNullable(state.rows, "sheets"),
    };
  }, [state.rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.rows.filter(row => {
      if (shiftFilter !== "all" && row.shift !== shiftFilter) return false;
      if (!q) return true;
      return (
        row.product.toLowerCase().includes(q) ||
        row.lot.toLowerCase().includes(q) ||
        row.nextGate.toLowerCase().includes(q)
      );
    });
  }, [state.rows, shiftFilter, query]);

  const isFiltered = shiftFilter !== "all" || query.trim().length > 0;
  const hasMore = Boolean(state.nextCursor);
  const dsPct = summary.total > 0 ? Math.round((summary.ds / summary.total) * 100) : 0;
  const nsPct = summary.total > 0 ? Math.round((summary.ns / summary.total) * 100) : 0;
  const dateDisplay = dayjs(selection.date).format("DD/MM/YYYY");
  const dateWeekday = dayjs(selection.date).format("ddd, DD MMM");

  const filterChip = (value: ShiftFilter, label: string, count: number) => {
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
        aria-label="Close output details backdrop"
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
        aria-labelledby="observed-output-title"
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
                  {selection.gate}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-700 text-white">
                  Observed output
                </span>
                {selection.planId && (
                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white">
                    {planVersion ? `In Plan v${planVersion} only` : "Saved plan only"}
                  </span>
                )}
              </div>
              <h3 id="observed-output-title" className="text-[16px] font-bold text-base-content leading-snug break-all">
                {selection.product ?? "All matching products"}
              </h3>
              <div className="flex items-center flex-wrap gap-1.5 text-xs text-base-content/70 mt-0.5 tabular-nums">
                <CalendarIcon size={13} className="text-primary shrink-0" />
                <span className="font-bold text-base-content" title={selection.date}>{dateDisplay}</span>
                <span className="text-base-content/50">({dateWeekday})</span>
                <span className="text-base-content/30">•</span>
                <span className="text-base-content/60">Evidence time = next gate&apos;s SCAN IN</span>
              </div>
            </div>

            <button
              ref={close}
              type="button"
              onClick={onClose}
              className="btn btn-xs btn-ghost btn-square h-7 w-7 shrink-0 text-base-content/50 hover:text-base-content hover:bg-base-200 cursor-pointer"
              aria-label="Close output details"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex items-center flex-wrap gap-2.5 text-xs text-base-content/65 mt-2.5 pt-2 border-t border-base-200 tabular-nums">
            <span>
              <strong className="text-base-content">
                {state.loading && !state.rows.length ? "—" : `${summary.total.toLocaleString()}${hasMore ? "+" : ""}`}
              </strong>{" "}
              {hasMore ? "loaded lots" : "lots"}
            </span>
            <span className="text-base-content/30">•</span>
            <span>
              <strong className="text-base-content">
                {summary.pcs === undefined ? "—" : formatGateQuantity(summary.pcs, "piece")}
                {hasMore && summary.pcs !== undefined && summary.pcs !== null ? "+" : ""}
              </strong>{" "}
              pcs
            </span>
            <span className="text-base-content/30">•</span>
            <span>
              <strong className="text-base-content">
                {summary.sheets === undefined ? "—" : formatGateQuantity(summary.sheets, "sheet")}
                {hasMore && summary.sheets !== undefined && summary.sheets !== null ? "+" : ""}
              </strong>{" "}
              sheets
            </span>
          </div>
        </div>

        {/* 2. Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3.5 text-xs">
          {/* Shift Breakdown Card */}
          <div className="rounded-xl border border-base-200 bg-base-100 p-3 flex flex-col gap-2 tabular-nums">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                Shift Breakdown
              </span>
              <span className="text-[11px] text-base-content/60">
                {hasMore ? "Showing loaded records" : "Complete for selection"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-base-200 border border-base-300">
                <span className="inline-flex items-center gap-1.5 font-medium text-base-content/75">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fdecb3] text-[#8a5a00]">D/S</span>
                  <span>Day Shift</span>
                </span>
                <span className="font-bold text-base-content">
                  {summary.ds.toLocaleString()}
                  {summary.total > 0 && <span className="ml-1 font-normal text-base-content/50">({dsPct}%)</span>}
                </span>
              </div>
              <div className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-base-200 border border-base-300">
                <span className="inline-flex items-center gap-1.5 font-medium text-base-content/75">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#e9e3fb] text-[#5a3fc0]">N/S</span>
                  <span>Night Shift</span>
                </span>
                <span className="font-bold text-base-content">
                  {summary.ns.toLocaleString()}
                  {summary.total > 0 && <span className="ml-1 font-normal text-base-content/50">({nsPct}%)</span>}
                </span>
              </div>
            </div>

            {summary.total > 0 && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-200 flex">
                {summary.ds > 0 && (
                  <div
                    style={{ width: `${(summary.ds / summary.total) * 100}%` }}
                    className="h-full bg-[#f5c542] transition-all duration-300"
                    title={`D/S: ${summary.ds} (${dsPct}%)`}
                  />
                )}
                {summary.ns > 0 && (
                  <div
                    style={{ width: `${(summary.ns / summary.total) * 100}%` }}
                    className="h-full bg-[#6d4fd8] transition-all duration-300"
                    title={`N/S: ${summary.ns} (${nsPct}%)`}
                  />
                )}
              </div>
            )}
          </div>

          {/* Lots List Card */}
          <div className="rounded-xl border border-base-200 bg-base-100 flex flex-col overflow-hidden">
            {/* Filter & Search Bar */}
            <div className="px-3 py-2.5 border-b border-base-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-base-content/50">
                  Output Lots
                </span>
                <div
                  role="group"
                  aria-label="Filter by shift"
                  className="inline-flex items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/80 p-0.5"
                >
                  {filterChip("all", "All", summary.total)}
                  {filterChip("D/S", "D/S", summary.ds)}
                  {filterChip("N/S", "N/S", summary.ns)}
                </div>
              </div>

              <div className="relative w-full sm:w-56">
                <Search size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={selection.product ? "Filter lot, next gate..." : "Filter product, lot, next gate..."}
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

            {state.error && (
              <div
                role="alert"
                className="m-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-300 bg-rose-500/10 px-3 py-2 text-xs text-error"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{state.error}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-xs h-6 px-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white border-none text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  onClick={() => void load(state.nextCursor ?? undefined)}
                >
                  <RefreshCw size={11} />
                  Retry
                </button>
              </div>
            )}

            {state.loading && state.rows.length === 0 ? (
              <div role="status" className="p-4 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-medium text-base-content/60">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span>Loading output lots…</span>
                </div>
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={index}
                      className="h-8 w-full animate-pulse rounded-lg bg-base-200/80"
                      style={{ opacity: 1 - index * 0.13 }}
                    />
                  ))}
                </div>
              </div>
            ) : !state.loading && !state.error && state.rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-base-200 text-base-content/40">
                  <Inbox size={20} />
                </div>
                <p className="mt-2.5 font-bold text-base-content/80">No observed output for this selection</p>
                <p className="mt-0.5 max-w-sm text-[11px] text-base-content/55">
                  No SCAN IN records were found at the next gate for this selection. This does not confirm zero output.
                </p>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <p className="font-semibold text-base-content/75">No loaded lots match your current filter</p>
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
                      <th className="py-2 px-2.5 text-right">Pcs</th>
                      <th className="py-2 px-2.5 text-right">Sheets</th>
                      <th className="py-2 px-2.5">Evidence time (local)</th>
                      <th className="py-2 pl-2.5 pr-3">Next gate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-base-200/70">
                    {filteredRows.map((row, index) => {
                      const isDs = row.shift === "D/S";
                      return (
                        <tr key={row.id} className="hover:bg-base-200/45 transition-colors">
                          <td className="py-2 pl-3 pr-2 text-right text-[11px] text-base-content/40">
                            {index + 1}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-base-content whitespace-nowrap">
                            {row.product}
                          </td>
                          <td className="py-2 px-2.5 font-mono font-bold text-base-content/85 whitespace-nowrap">
                            {row.lot}
                          </td>
                          <td className="py-2 px-2.5 text-center whitespace-nowrap">
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-bold ${
                                isDs ? "bg-[#fdecb3] text-[#8a5a00]" : "bg-[#e9e3fb] text-[#5a3fc0]"
                              }`}
                            >
                              {row.shift}
                            </span>
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right whitespace-nowrap ${
                              row.pcs === null ? "text-base-content/40" : "font-semibold text-base-content"
                            }`}
                          >
                            {formatGateQuantity(row.pcs, "piece")}
                          </td>
                          <td
                            className={`py-2 px-2.5 text-right whitespace-nowrap ${
                              row.sheets === null ? "text-base-content/40" : "font-semibold text-base-content"
                            }`}
                          >
                            {formatGateQuantity(row.sheets, "sheet")}
                          </td>
                          <td className="py-2 px-2.5 text-base-content/75 whitespace-nowrap" title={row.timeZone}>
                            <span className="inline-flex items-center gap-1">
                              <Clock size={11} className="text-base-content/40 shrink-0" />
                              {formatEvidenceTime(row)}
                            </span>
                          </td>
                          <td className="py-2 pl-2.5 pr-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-base-200 border border-base-300 text-[11px] font-semibold text-base-content/80">
                              <ArrowRight size={10} className="text-primary shrink-0" />
                              {row.nextGate}
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
            <strong className="text-base-content tabular-nums">
              {isFiltered
                ? `${filteredRows.length.toLocaleString()} / ${state.rows.length.toLocaleString()}`
                : state.rows.length.toLocaleString()}
            </strong>{" "}
            {hasMore ? "loaded records shown" : "records shown"}
            <span className="mx-1.5 text-base-content/30">•</span>
            <span>
              {selection.planId
                ? "Filtered to lots planned in this saved plan for the month."
                : "Showing all recorded output for this month."}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {state.nextCursor && !state.error && (
              <button
                type="button"
                disabled={state.loading}
                onClick={() => void load(state.nextCursor ?? undefined)}
                className="btn btn-xs h-7 px-2.5 rounded-lg bg-[#4f46e5] hover:bg-[#4338ca] disabled:bg-base-200 disabled:text-base-content/35 text-white border-none text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                {state.loading ? <Loader2 size={11} className="animate-spin" /> : <ChevronDown size={12} />}
                <span>{state.loading ? "Loading…" : "Load more lots"}</span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
