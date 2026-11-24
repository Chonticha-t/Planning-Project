import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { BoardShiftAllocation, LevelingData, LotItem } from "../../Capacity_Leveling/types";
import type { CountUnit, InGateCategory } from "../types";
import type { useMonthlyOutput } from "../hooks/useMonthlyOutput";
import { observedMonth } from "../monthlyOutput";
import { ObservedLotDrawer } from "./ObservedLotDrawer";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planShiftBadge, planShiftTotals, planStatus, savedMonth, type PlanShiftSummary } from "../savedPlan";
import { MonthlyChart, type ChartDay } from "./MonthlyChart";

interface Props {
  rows: LotItem[];
  snapshot?: LevelingData;
  month: string;
  today: string;
  unit: CountUnit;
  search: string;
  version?: number;
  gate: string;
  category: InGateCategory;
  output: ReturnType<typeof useMonthlyOutput>;
  allocations?: ReadonlyMap<string, BoardShiftAllocation>;
  tvMode?: boolean;
}

const fmtQuantity = (value: number | null, unit: CountUnit) =>
  formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet");

const showQuantity = (value: number | null | undefined, unit: CountUnit, present = value !== undefined) =>
  present ? fmtQuantity(value ?? null, unit) : "—";

const formatPlanBreakdown = (shifts: PlanShiftSummary, unit: CountUnit) => {
  const parts = [
    `D/S ${shifts.hasDs ? fmtQuantity(shifts.ds, unit) : "—"}`,
    `N/S ${shifts.hasNs ? fmtQuantity(shifts.ns, unit) : "—"}`,
  ];
  if (shifts.hasOver) parts.push(`Over ${fmtQuantity(shifts.over, unit)}`);
  if (shifts.hasNoLoad) parts.push(`No load ${fmtQuantity(shifts.noLoad, unit)}`);
  if (shifts.hasNeed) parts.push(`Need WIP ${fmtQuantity(shifts.need, unit)}`);
  if (shifts.hasUnassigned) parts.push(`Unassigned ${fmtQuantity(shifts.unassigned, unit)}`);
  parts.push(`Total ${fmtQuantity(shifts.total, unit)}`);
  return parts.join(" · ");
};

const formatPlanTooltip = (shifts: PlanShiftSummary, unit: CountUnit) => `Plan · ${formatPlanBreakdown(shifts, unit)}`;

const SHIFT_BADGE_CLASS = {
  ds: "bg-[#fdecb3] text-[#8a5a00]",
  ns: "bg-[#e9e3fb] text-[#5a3fc0]",
  over: "bg-rose-100 text-rose-700 border border-rose-300",
  muted: "bg-base-200 text-base-content/70",
} as const;

/** Keep saved arrivals separate from observed output and unknown historical coverage. */
export function ApiMonthlySummary({ rows, snapshot, month, today, unit, search, version, gate, category, output, allocations, tvMode = false }: Props) {
  const [selected, setSelected] = useState<{ date: string; product?: string; mode: "actual" | "plan"; asOf?: string } | null>(null);
  // A new search closes the open day details.
  const [searchedFor, setSearchedFor] = useState(search);
  if (searchedFor !== search) {
    setSearchedFor(search);
    setSelected(null);
  }
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const dockedScrollbarRef = useRef<HTMLDivElement>(null);
  const dockedScrollContentRef = useRef<HTMLDivElement>(null);

  const handleDockedScroll = useCallback(() => {
    const docked = dockedScrollbarRef.current;
    const el = tableScrollRef.current;
    if (docked && docked.clientWidth > 0 && el && Math.abs(el.scrollLeft - docked.scrollLeft) > 0.5) {
      el.scrollLeft = docked.scrollLeft;
    }
  }, []);

  // Docked horizontal scrollbar (same behavior as Planning Summary): when the table's own
  // x-scrollbar is below the viewport, show a fixed copy docked at the bottom of the screen.
  useLayoutEffect(() => {
    const el = tableScrollRef.current;
    const head = theadRef.current;
    const table = tableRef.current;
    const docked = dockedScrollbarRef.current;
    const content = dockedScrollContentRef.current;
    if (!el || !head || !table || !docked || !content) return;
    let frame = 0;

    const updateScrollbar = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportBottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 1;
      const hasOverflow = el.scrollWidth > el.clientWidth;
      const shouldDock = hasOverflow && rect.bottom > viewportBottom &&
        head.getBoundingClientRect().bottom < viewportBottom - 24;
      docked.style.display = shouldDock ? "block" : "none";
      if (!shouldDock) return;

      // Match the native scrollbar's range so scrollLeft maps 1:1.
      const barHeight = Math.max(el.offsetHeight - el.clientHeight - el.clientTop, 17);
      docked.style.left = `${rect.left + el.clientLeft}px`;
      docked.style.top = `${viewportBottom - barHeight}px`;
      docked.style.width = `${el.clientWidth}px`;
      docked.style.height = `${barHeight}px`;
      content.style.width = `${el.scrollWidth}px`;
      if (Math.abs(docked.scrollLeft - el.scrollLeft) > 0.5) {
        docked.scrollLeft = el.scrollLeft;
      }
    };

    const scheduleUpdate = (event?: Event) => {
      if (event?.target === docked) return;
      if (!frame) frame = window.requestAnimationFrame(updateScrollbar);
    };
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    resizeObserver.observe(el);
    resizeObserver.observe(table);
    const pageRoot = el.closest(".planning-summary-gate") ?? el.parentElement;
    if (pageRoot) resizeObserver.observe(pageRoot);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    updateScrollbar();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [tvMode]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => !query || row.product.toLowerCase().includes(query) || row.label.toLowerCase().includes(query));
  }, [rows, search]);
  const data = useMemo(() => savedMonth(filtered, snapshot ?? { calendarDays: [] }, month, unit, allocations), [filtered, snapshot, month, unit, allocations]);
  const records = useMemo(() => output.data?.rows.filter(row => row.gate === gate) ?? [], [output.data, gate]);
  const actual = useMemo(() => observedMonth(records, unit), [records, unit]);
  const products = useMemo(() => [...new Set([...data.products.map(row => row.product), ...actual.products.keys()])].sort(), [data, actual]);
  const plans = useMemo(() => new Map(data.products.map(row => [row.product, row])), [data]);
  const fmt = (value: number | null) => fmtQuantity(value, unit);
  const show = (value: number | null | undefined, present = value !== undefined) => showQuantity(value, unit, present);
  const workToday = output.data?.workToday ?? today;
  const chart = useMemo<ChartDay[]>(() => data.days.map(day => {
    const cell = actual.dates.get(day.date);
    const known = cell && cell.total !== null;
    return {
      date: day.date, label: String(day.day), off: day.off,
      phase: day.date === workToday ? "today" : day.date < workToday ? "past" : "future",
      ds: known ? cell.ds : null, ns: known ? cell.ns : null,
      planFuture: snapshot && !cell && day.date >= workToday ? day.plan : null,
      plan: snapshot ? day.plan : null,
      dateText: day.date,
      actualText: cell ? `D/S ${showQuantity(cell.ds, unit, cell.hasDs)} · N/S ${showQuantity(cell.ns, unit, cell.hasNs)} · Total ${showQuantity(cell.total, unit, true)}` : undefined,
      planText: snapshot ? formatPlanBreakdown(day.shifts, unit) : undefined,
    };
  }), [data, actual, workToday, snapshot, unit]);
  const selection = useMemo(() => selected?.mode === "actual" && selected.asOf ? {
    month, category, search, gate, date: selected.date, product: selected.product, asOf: selected.asOf,
  } : null, [selected, month, category, search, gate]);
  const selectedRows = selected ? filtered.filter(row => row.plannedDate === selected.date && (!selected.product || row.product === selected.product)) : [];
  const selectedSummary = selected?.mode === "plan" ? planShiftTotals(selectedRows, unit, allocations) : null;
  const planTooltip = snapshot ? formatPlanTooltip(data.shifts, unit) : undefined;
  const kpis = [
    { title: "Observed output (month)", value: show(actual.total, records.length > 0), sub: `${unit} · Next-gate scan evidence` },
    {
      title: "Plan this month",
      value: snapshot ? fmt(data.total) : "—",
      sub: snapshot
        ? `${version ? `Plan v${version}` : "Saved arrivals"} · D/S ${show(data.shifts.ds, data.shifts.hasDs)} · N/S ${show(data.shifts.ns, data.shifts.hasNs)}`
        : "No saved plan available",
      titleAttr: planTooltip,
    },
    { title: "Daily average", value: "—", sub: "Full-period coverage not confirmed" },
    {
      title: "By shift (month)",
      value: "",
      sub: snapshot
        ? `Observed · Plan: ${show(data.shifts.ds, data.shifts.hasDs)} D/S · ${show(data.shifts.ns, data.shifts.hasNs)} N/S`
        : "Observed output · All matching work dates",
      titleAttr: planTooltip,
    },
    { title: "Days below plan", value: "—", sub: "Arrival plan is not an output target" },
  ];
  return <div className="p-6 flex flex-col gap-4">
    <h2 className="text-sm font-extrabold uppercase tracking-wider">Monthly summary</h2>
    {output.loading && <p role="status" className="text-sm text-base-content/60">Loading observed output…</p>}
    {output.error && <div role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm">{output.error}{output.data && " Showing the last checked results."}<button type="button" className="btn btn-xs ml-2" onClick={output.reload}>Retry output</button></div>}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map(kpi => <div key={kpi.title} title={kpi.titleAttr} className="rounded-xl border border-base-300 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">{kpi.title}</div>
        <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-tight">{kpi.title.startsWith('By shift') ? <><span className="text-[#c98a00]">{show(actual.ds, actual.hasDs)}</span><small className="text-sm text-base-content/60"> D/S · </small><span className="text-[#6d4fd8]">{show(actual.ns, actual.hasNs)}</span><small className="text-sm text-base-content/60"> N/S</small></> : kpi.value}</div>
        <div className="text-xs text-base-content/60">{kpi.sub}</div>
      </div>)}
    </div>
    <MonthlyChart compareOutputToPlan={false} data={chart} onPick={date => setSelected({ date, mode: actual.dates.has(date) ? "actual" : "plan", asOf: output.data?.checkedAt })} />
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/70">
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#f5c542]" />D/S observed</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#6d4fd8]" />N/S observed</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm border border-dashed border-base-content/40" />Planned arrivals (D/S · N/S · Total)</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[#f97316]" />{version ? `Saved arrivals (Plan v${version})` : "Saved arrivals unavailable"}</span>
      <span className="ml-auto">Click output or plan to see its lots · — No evidence · N/A Unknown quantity</span>
    </div>
    {typeof document !== "undefined" && createPortal(
      <div
        ref={dockedScrollbarRef}
        role="region"
        aria-label="Monthly summary horizontal scroll"
        tabIndex={0}
        onScroll={handleDockedScroll}
        style={{
          display: "none",
          position: "fixed",
          overflowX: "scroll",
          overflowY: "hidden",
          boxSizing: "content-box",
          zIndex: tvMode ? 105 : 40,
          borderTop: "1px solid var(--color-base-300)",
          backgroundColor: "var(--color-base-100)",
        }}
      >
        <div ref={dockedScrollContentRef} style={{ height: 1 }} />
      </div>,
      document.body
    )}
    <div ref={tableScrollRef} className="overflow-x-auto">
      <table ref={tableRef} className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead ref={theadRef}><tr className="text-xs text-base-content/60">
          <th scope="col" className="sticky left-0 z-10 bg-base-100 py-2 pr-4 text-left font-semibold uppercase tracking-wide border-b border-base-300 min-w-[170px]">Product</th>
          {data.days.map(day => <th key={day.date} scope="col" className={`px-1 py-2 text-center font-normal border-b border-l border-base-300 min-w-[88px] ${day.date === workToday ? "bg-[#316be8] text-white rounded-t-lg" : ""}`}>
            <div>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(`${day.date}T00:00:00Z`).getUTCDay()]}</div>
            <div className="text-sm font-bold">{day.day}</div>{day.off && <small>OFF</small>}
          </th>)}
          <th scope="col" className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right font-semibold uppercase border-b border-base-300 min-w-[90px]">Total</th>
        </tr></thead>
        <tbody>{products.map(product => {
          const plan = plans.get(product);
          const total = actual.products.get(product);
          return <tr key={product}>
            <th scope="row" className="sticky left-0 z-10 bg-base-100 py-2 pr-4 text-left border-b border-base-200"><div className="font-bold">{product}</div><div className="text-xs font-normal text-base-content/50">{plan ? "Saved arrivals" : "No saved arrivals"}{total ? " · Observed output" : ""}</div></th>
            {data.days.map(day => {
              const cell = actual.cells.get(JSON.stringify([product, day.date]));
              const planCell = snapshot ? plan?.shiftCells[day.date] : undefined;
              const hasPlan = Boolean(planCell && planCell.total !== 0);
              if (!cell && !hasPlan) {
                return <td key={day.date} className="px-1 py-1.5 border-b border-l border-base-200 text-center text-base-content/25">–</td>;
              }
              return <td key={day.date} className="px-1 py-1 border-b border-l border-base-200 text-center align-middle">
                {cell && (
                  <button
                    type="button"
                    disabled={!output.data}
                    aria-label={`Observed output ${product} ${day.date}`}
                    title={`D/S ${show(cell.ds, cell.hasDs)} · N/S ${show(cell.ns, cell.hasNs)} · Total ${show(cell.total, true)}`}
                    onClick={() => setSelected({ date: day.date, product, mode: "actual", asOf: output.data?.checkedAt })}
                    className="w-full rounded-md px-1 py-1 flex items-center justify-center gap-1 whitespace-nowrap hover:bg-base-200/70 disabled:opacity-50"
                  >
                    <span className={`min-w-5 rounded px-1 text-center text-[11px] font-semibold leading-5 ${cell.hasDs ? "bg-[#fdecb3] text-[#8a5a00]" : "bg-base-200/60 text-base-content/30"}`}>
                      {cell.hasDs ? show(cell.ds, true) : "–"}
                    </span>
                    <span className={`min-w-5 rounded px-1 text-center text-[11px] font-semibold leading-5 ${cell.hasNs ? "bg-[#e9e3fb] text-[#5a3fc0]" : "bg-base-200/60 text-base-content/30"}`}>
                      {cell.hasNs ? show(cell.ns, true) : "–"}
                    </span>
                    <span className="min-w-5 text-right text-[13px] font-semibold text-base-content/85">
                      {show(cell.total, true)}
                    </span>
                  </button>
                )}
                {hasPlan && planCell && (
                  <button
                    type="button"
                    disabled={!snapshot}
                    aria-label={`Planned arrivals ${product} ${day.date}`}
                    title={formatPlanTooltip(planCell, unit)}
                    onClick={() => setSelected({ date: day.date, product, mode: "plan" })}
                    className={`w-full rounded-md px-1 py-0.5 flex items-center justify-center gap-1 whitespace-nowrap border border-dashed border-base-content/25 bg-base-200/25 hover:bg-base-200/70 ${cell ? "mt-0.5" : ""}`}
                  >
                    <span className={`min-w-5 rounded px-1 text-center text-[10px] font-semibold leading-4 ${planCell.hasDs ? "border border-[#e5b325]/60 bg-[#fdecb3]/45 text-[#8a5a00]" : "bg-base-200/50 text-base-content/30"}`}>
                      {planCell.hasDs ? show(planCell.ds, true) : "–"}
                    </span>
                    <span className={`min-w-5 rounded px-1 text-center text-[10px] font-semibold leading-4 ${planCell.hasNs ? "border border-[#7c62dc]/50 bg-[#e9e3fb]/45 text-[#5a3fc0]" : "bg-base-200/50 text-base-content/30"}`}>
                      {planCell.hasNs ? show(planCell.ns, true) : "–"}
                    </span>
                    <span className="min-w-5 text-right text-[11px] font-semibold text-base-content/65">
                      {show(planCell.total, true)}
                    </span>
                  </button>
                )}
              </td>;
            })}
            <td className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right border-b border-base-200">
              <div className="font-semibold">{show(total?.total, Boolean(total))}</div>
              {snapshot && plan && plan.total !== 0 && (
                <div title={formatPlanTooltip(plan.shifts, unit)} className="text-xs text-base-content/50">Plan {fmt(plan.total)}</div>
              )}
            </td>
          </tr>;
        })}
          {!products.length && <tr><td colSpan={data.days.length + 2} className="py-10 text-center text-base-content/50">{output.loading ? "Loading monthly output…" : "No saved arrivals or observed output match this month and filter."}</td></tr>}
        </tbody>
        <tfoot><tr><th scope="row" className="sticky left-0 z-10 bg-base-100 py-3 pr-4 text-left font-bold border-t-2 border-base-300">Observed / Arrivals</th>
          {data.days.map(day => <td key={day.date} title={snapshot ? formatPlanTooltip(day.shifts, unit) : undefined} className="py-3 text-center border-t-2 border-base-300">{show(actual.dates.get(day.date)?.total, actual.dates.has(day.date))}<span className="text-base-content/50"> / {snapshot ? fmt(day.plan) : "—"}</span></td>)}
          <td title={planTooltip} className="sticky right-0 z-10 bg-base-100 py-3 pl-3 text-right border-t-2 border-base-300">{show(actual.total, records.length > 0)} / {snapshot ? fmt(data.total) : "—"}</td>
        </tr></tfoot>
      </table>
    </div>
    {selection && <ObservedLotDrawer key={JSON.stringify(selection)} selection={selection} onClose={() => setSelected(null)} />}
    {selected?.mode === "plan" && createPortal(<div className="planning-summary-gate fixed inset-0 z-[120] flex justify-end" onKeyDown={event => event.key === 'Escape' && setSelected(null)}>
      <button type="button" aria-label="Close lot details backdrop" className="absolute inset-0 bg-slate-900/30" onClick={() => setSelected(null)} />
      <aside role="dialog" aria-modal="true" aria-label="Saved plan lots" className="relative h-full w-full max-w-3xl bg-base-100 border-l border-base-300 shadow-2xl overflow-y-auto p-5">
        <div className="flex justify-between items-start gap-2">
          <div>
            <h3 className="font-bold">Planned arrivals · {selected.date}{selected.product ? ` · ${selected.product}` : ""}</h3>
            <p className="text-xs text-base-content/60">Plan v{version} · Status at save</p>
            {selectedSummary && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded px-2 py-0.5 font-semibold bg-[#fdecb3] text-[#8a5a00]">D/S: {show(selectedSummary.ds, selectedSummary.hasDs)}</span>
                <span className="rounded px-2 py-0.5 font-semibold bg-[#e9e3fb] text-[#5a3fc0]">N/S: {show(selectedSummary.ns, selectedSummary.hasNs)}</span>
                {selectedSummary.hasOver && (
                  <span className="rounded px-2 py-0.5 font-semibold bg-rose-100 text-rose-700 border border-rose-300">Over: {show(selectedSummary.over, true)}</span>
                )}
                {selectedSummary.hasNoLoad && (
                  <span className="rounded px-2 py-0.5 font-semibold bg-base-200 text-base-content/75">No load: {show(selectedSummary.noLoad, true)}</span>
                )}
                {selectedSummary.hasNeed && (
                  <span className="rounded px-2 py-0.5 font-semibold bg-base-200 text-base-content/75">Need WIP: {show(selectedSummary.need, true)}</span>
                )}
                {selectedSummary.hasUnassigned && (
                  <span className="rounded px-2 py-0.5 font-semibold bg-base-200 text-base-content/75">Unassigned: {show(selectedSummary.unassigned, true)}</span>
                )}
                <span className="rounded px-2 py-0.5 font-semibold bg-base-200/70 text-base-content">Total: {fmt(selectedSummary.total)}</span>
              </div>
            )}
          </div>
          <button autoFocus type="button" className="btn btn-sm btn-ghost" aria-label="Close lot details" onClick={() => setSelected(null)}><X size={18} /></button>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="table table-sm"><thead><tr><th>Product</th><th>Lot</th><th>Shift</th><th>Pcs</th><th>Sheets</th><th>Status at save</th></tr></thead>
          <tbody>{selectedRows.slice(0, 200).map(lot => {
            const badge = planShiftBadge(lot, allocations?.get(lot.id));
            return <tr key={lot.id}><td>{lot.product}</td><td>{lot.label}</td><td><span title={badge.reason} className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${SHIFT_BADGE_CLASS[badge.tone]}`}>{badge.label}</span></td><td>{formatGateQuantity(lot.qty, 'piece')}</td><td>{formatGateQuantity(lot.sheets, 'sheet')}</td><td>{planStatus(lot)}</td></tr>;
          })}</tbody>
        </table></div>{!selectedRows.length && <p className="p-8 text-center text-sm text-base-content/50">No saved arrivals for this selection.</p>}
        {selectedRows.length > 200 && <p className="mt-3 text-xs text-base-content/60">Showing the first 200 records. Use the daily view or Excel for the full list.</p>}
      </aside>
    </div>, document.body)}
  </div>;
}
