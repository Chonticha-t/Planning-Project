import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import type { BoardShiftAllocation, LevelingData, LotItem } from "../../Capacity_Leveling/types";
import type { CountUnit, InGateCategory, MonthOutputScope } from "../types";
import type { useMonthlyOutput } from "../hooks/useMonthlyOutput";
import { computeMonthlyKpis, observedMonth } from "../monthlyOutput";
import { ObservedLotDrawer } from "./ObservedLotDrawer";
import { PlannedArrivalDrawer } from "./PlannedArrivalDrawer";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planShiftTotals, savedMonth, type PlanShiftSummary } from "../savedPlan";
import { MonthlyChart, type ChartDay } from "./MonthlyChart";

interface Props {
  rows: LotItem[];
  snapshot?: LevelingData;
  month: string;
  today: string;
  unit: CountUnit;
  search: string;
  version?: number;
  planId?: string;
  gate: string;
  category: InGateCategory;
  output: ReturnType<typeof useMonthlyOutput>;
  outputScope?: MonthOutputScope;
  onOutputScopeChange?: (scope: MonthOutputScope) => void;
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

function TotalProgress({
  observed,
  hasObserved,
  planned,
  hasPlan,
  unit,
  showPlanSlot = true,
  showNoPlanLabel = true,
}: {
  observed: number | null | undefined;
  hasObserved: boolean;
  planned: number | null | undefined;
  hasPlan: boolean;
  unit: CountUnit;
  showPlanSlot?: boolean;
  showNoPlanLabel?: boolean;
}) {
  const obsNum = hasObserved && typeof observed === "number" ? observed : null;
  const planNum = hasPlan && typeof planned === "number" ? planned : null;
  const canCompare = obsNum !== null && planNum !== null && planNum > 0;
  const rawPct = canCompare ? Math.round((obsNum / planNum) * 100) : null;
  const fillPct = canCompare ? Math.min(100, Math.max(0, (obsNum / planNum) * 100)) : 0;
  const metPlan = canCompare && obsNum >= planNum;

  const obsText = showQuantity(observed, unit, hasObserved);
  const planText = hasPlan ? fmtQuantity(planned ?? null, unit) : "—";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="whitespace-nowrap leading-tight tabular-nums">
        <span
          className={
            !hasObserved
              ? "font-semibold text-base-content/35"
              : metPlan
                ? "font-bold text-emerald-600"
                : "font-bold text-base-content"
          }
        >
          {obsText}
        </span>
        {hasPlan ? (
          <span className="text-xs font-medium text-base-content/45"> / {planText}</span>
        ) : showPlanSlot ? (
          <span className="text-xs font-normal text-base-content/30"> / —</span>
        ) : null}
      </div>

      {hasPlan ? (
        <div className="flex w-full items-center gap-1.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-200">
            {fillPct > 0 && (
              <div
                style={{ width: `${fillPct}%` }}
                className={`h-full rounded-full transition-all duration-300 ${
                  metPlan ? "bg-emerald-500" : "bg-[#316be8]"
                }`}
              />
            )}
          </div>
          <span
            className={`inline-flex items-center justify-end gap-0.5 text-[10px] font-bold tabular-nums leading-none shrink-0 min-w-[34px] ${
              metPlan
                ? "text-emerald-600"
                : rawPct !== null
                  ? "text-base-content/60"
                  : "text-base-content/35 font-medium"
            }`}
          >
            {metPlan && <Check size={10} strokeWidth={3} className="shrink-0" />}
            {rawPct !== null ? `${rawPct}%` : hasObserved || planNum === null ? "N/A" : "—"}
          </span>
        </div>
      ) : (
        showPlanSlot && showNoPlanLabel && (
          <div className="text-[10px] font-medium leading-none text-base-content/40">No plan</div>
        )
      )}
    </div>
  );
}

function summarizePlanOther(planCell: PlanShiftSummary, unit: CountUnit): { label: string; title: string } | null {
  const values: (number | null)[] = [];
  const parts: string[] = [];
  if (planCell.hasNoLoad) {
    values.push(planCell.noLoad);
    parts.push(`No load ${fmtQuantity(planCell.noLoad, unit)}`);
  }
  if (planCell.hasNeed) {
    values.push(planCell.need);
    parts.push(`Need WIP ${fmtQuantity(planCell.need, unit)}`);
  }
  if (planCell.hasUnassigned) {
    values.push(planCell.unassigned);
    parts.push(`Unassigned ${fmtQuantity(planCell.unassigned, unit)}`);
  }
  if (!values.length) return null;
  const total = values.reduce<number | null>(
    (acc, val) => (acc === null || val === null ? null : acc + val),
    0,
  );
  return {
    label: total === null ? "N/A" : `+${fmtQuantity(total, unit)}`,
    title: parts.join(" · "),
  };
}

/** Keep saved arrivals separate from observed output and unknown historical coverage. */
export function ApiMonthlySummary({
  rows, snapshot, month, today, unit, search, version, planId, gate, category, output,
  outputScope = "all", onOutputScopeChange, allocations, tvMode = false,
}: Props) {
  const [selected, setSelected] = useState<{ date: string; product?: string; mode: "actual" | "plan"; asOf?: string } | null>(null);
  // A new search or output scope closes the open day details.
  const [searchedFor, setSearchedFor] = useState(`${search}\0${outputScope}`);
  const currentFilterKey = `${search}\0${outputScope}`;
  if (searchedFor !== currentFilterKey) {
    setSearchedFor(currentFilterKey);
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
      ds: known ? (cell.ds ?? 0) : null, ns: known ? (cell.ns ?? 0) : null,
      planFuture: snapshot && !cell && day.date >= workToday ? day.plan : null,
      plan: snapshot ? day.plan : null,
      dateText: day.date,
      actualText: cell ? `D/S ${showQuantity(cell.ds, unit, cell.hasDs)} · N/S ${showQuantity(cell.ns, unit, cell.hasNs)} · Total ${showQuantity(cell.total, unit, true)}` : undefined,
      planText: snapshot ? formatPlanBreakdown(day.shifts, unit) : undefined,
    };
  }), [data, actual, workToday, snapshot, unit]);
  const selection = useMemo(() => selected?.mode === "actual" && selected.asOf ? {
    month, category, search, gate, date: selected.date, product: selected.product, asOf: selected.asOf,
    ...(outputScope === "plan" && planId ? { planId } : {}),
  } : null, [selected, month, category, search, gate, outputScope, planId]);
  const selectedRows = selected ? filtered.filter(row => row.plannedDate === selected.date && (!selected.product || row.product === selected.product)) : [];
  const selectedSummary = selected?.mode === "plan" ? planShiftTotals(selectedRows, unit, allocations) : null;
  const planTooltip = snapshot ? formatPlanTooltip(data.shifts, unit) : undefined;
  const kpiMetrics = useMemo(
    () => computeMonthlyKpis(actual, data.days, workToday, Boolean(snapshot)),
    [actual, data.days, workToday, snapshot],
  );
  const dailyAvgValue = kpiMetrics.activeOutputDays === 0
    ? "—"
    : kpiMetrics.dailyAverage === null
      ? "N/A"
      : kpiMetrics.dailyAverage.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const dailyAvgSub = kpiMetrics.activeOutputDays === 0
    ? "No observed output"
    : kpiMetrics.dailyAverage === null
      ? `${unit}/day · Unknown quantity`
      : `${unit}/day · across ${kpiMetrics.activeOutputDays} ${kpiMetrics.activeOutputDays === 1 ? "output day" : "output days"}`;
  const belowPlanValue = !snapshot || kpiMetrics.comparedPlanDays === 0
    ? "—"
    : String(kpiMetrics.belowPlanDays);
  const belowPlanSub = !snapshot
    ? "No saved plan available"
    : kpiMetrics.comparedPlanDays === 0
      ? kpiMetrics.noOutputPlanDays > 0
        ? `No observed output (${kpiMetrics.noOutputPlanDays} past planned)`
        : "No past planned days"
      : kpiMetrics.noOutputPlanDays > 0
        ? `of ${kpiMetrics.comparedPlanDays} observed (${kpiMetrics.noOutputPlanDays} no output)`
        : `of ${kpiMetrics.comparedPlanDays} past planned ${kpiMetrics.comparedPlanDays === 1 ? "day" : "days"}`;
  const belowPlanTooltip = snapshot && kpiMetrics.comparedPlanDays > 0
    ? kpiMetrics.belowPlanDates.length > 0
      ? `Observed output below planned arrivals on: ${kpiMetrics.belowPlanDates.join(", ")}`
      : `All ${kpiMetrics.comparedPlanDays} observed past planned day(s) met or exceeded planned arrivals`
    : undefined;
  const kpis = [
    {
      title: "Observed output (month)",
      value: show(actual.total, records.length > 0),
      sub: outputScope === "plan" && snapshot
        ? `${unit} · Filtered to ${version ? `Plan v${version}` : "saved plan"} (${month})`
        : `${unit} · All recorded gate output`,
    },
    {
      title: "Plan this month",
      value: snapshot ? fmt(data.total) : "—",
      sub: snapshot
        ? `${version ? `Plan v${version}` : "Saved arrivals"} · D/S ${show(data.shifts.ds, data.shifts.hasDs)} · N/S ${show(data.shifts.ns, data.shifts.hasNs)}`
        : "No saved plan available",
      titleAttr: planTooltip,
    },
    { title: "Daily average", value: dailyAvgValue, sub: dailyAvgSub },
    {
      title: "By shift (month)",
      value: "",
      sub: snapshot
        ? `Observed · Plan: ${show(data.shifts.ds, data.shifts.hasDs)} D/S · ${show(data.shifts.ns, data.shifts.hasNs)} N/S`
        : "Observed output · All matching work dates",
      titleAttr: planTooltip,
    },
    {
      title: "Days below plan",
      value: belowPlanValue,
      sub: belowPlanSub,
      titleAttr: belowPlanTooltip,
      highlightError: Boolean(snapshot && kpiMetrics.comparedPlanDays > 0 && kpiMetrics.belowPlanDays > 0),
    },
  ];
  return <div className="p-6 flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-extrabold uppercase tracking-wider">Monthly summary</h2>
      {onOutputScopeChange && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-base-content/60">Output</span>
          <div role="group" aria-label="Observed output scope" className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/80 p-0.5">
            <button
              type="button"
              aria-pressed={outputScope === "all"}
              onClick={() => onOutputScopeChange("all")}
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-bold whitespace-nowrap transition-all ${outputScope === "all" ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"}`}
            >
              All output
            </button>
            <button
              type="button"
              disabled={!snapshot || !planId}
              aria-pressed={outputScope === "plan"}
              title={snapshot && planId ? `Show observed output only for lots in ${version ? `Plan v${version}` : "saved plan"} (${month})` : "No saved plan available"}
              onClick={() => onOutputScopeChange("plan")}
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-bold whitespace-nowrap transition-all disabled:opacity-40 ${outputScope === "plan" ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70 hover:bg-base-300/50"}`}
            >
              {version ? `In Plan v${version} only` : "In Plan only"}
            </button>
          </div>
        </div>
      )}
    </div>
    {output.loading && <p role="status" className="text-sm text-base-content/60">Loading observed output…</p>}
    {output.error && <div role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm">{output.error}{output.data && " Showing the last checked results."}<button type="button" className="btn btn-xs ml-2" onClick={output.reload}>Retry output</button></div>}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map(kpi => <div key={kpi.title} title={kpi.titleAttr} className="rounded-xl border border-base-300 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">{kpi.title}</div>
        <div className={`mt-0.5 text-2xl font-extrabold tabular-nums leading-tight ${kpi.highlightError ? "text-rose-600" : ""}`}>{kpi.title.startsWith('By shift') ? <><span className="text-[#c98a00]">{show(actual.ds, actual.hasDs)}</span><small className="text-sm text-base-content/60"> D/S · </small><span className="text-[#6d4fd8]">{show(actual.ns, actual.hasNs)}</span><small className="text-sm text-base-content/60"> N/S</small></> : kpi.value}</div>
        <div className="text-xs text-base-content/60">{kpi.sub}</div>
      </div>)}
    </div>
    <MonthlyChart compareOutputToPlan={Boolean(snapshot)} data={chart} onPick={date => setSelected({ date, mode: actual.dates.has(date) ? "actual" : "plan", asOf: output.data?.checkedAt })} />
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-base-content/70">
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#f5c542]" />D/S</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#6d4fd8]" />N/S</span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-3.5 items-center rounded bg-rose-600 px-1 text-[9px] font-bold leading-none text-white">!</span>
        Over capacity
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-4 rounded-sm border border-base-300 border-l-[3px] border-l-[#316be8] bg-base-100" />
        Actual (observed)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3.5 w-4 rounded-sm border border-dashed border-[#f97316]/70 bg-[#f97316]/[0.06]" />
        Plan (saved arrivals)
      </span>
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[#f97316]" />{version ? `Plan v${version} line` : "Saved arrivals unavailable"}</span>
      <span className="ml-auto">Click Actual or Plan to inspect lots · — No evidence · N/A Unknown quantity</span>
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
          {data.days.map(day => <th key={day.date} scope="col" className={`px-1 py-2 text-center font-normal border-b border-l border-base-300 min-w-[96px] ${day.date === workToday ? "bg-[#316be8] text-white rounded-t-lg" : ""}`}>
            <div>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(`${day.date}T00:00:00Z`).getUTCDay()]}</div>
            <div className="text-sm font-bold">{day.day}</div>{day.off && <small>OFF</small>}
          </th>)}
          <th scope="col" className="sticky right-0 z-10 bg-base-100 py-2 pl-3 pr-2 text-right font-semibold uppercase tracking-wide border-b border-l border-base-300 min-w-[136px]">
            <div>Total</div>
            <div className="text-[10px] font-normal normal-case tracking-normal text-base-content/50">
              {snapshot ? "Actual / Plan" : "Observed"}
            </div>
          </th>
        </tr></thead>
        <tbody>{products.map(product => {
          const plan = plans.get(product);
          const total = actual.products.get(product);
          const hasProductPlan = Boolean(snapshot && plan && plan.total !== 0);
          const totalTitle = [
            total ? `Observed · D/S ${show(total.ds, total.hasDs)} · N/S ${show(total.ns, total.hasNs)} · Total ${show(total.total, true)}` : null,
            hasProductPlan && plan ? formatPlanTooltip(plan.shifts, unit) : null,
          ].filter(Boolean).join("\n") || undefined;
          return <tr key={product}>
            <th scope="row" className="sticky left-0 z-10 bg-base-100 py-2 pr-4 text-left border-b border-base-200"><div className="font-bold">{product}</div><div className="text-xs font-normal text-base-content/50">{plan ? "Saved arrivals" : "No saved arrivals"}{total ? " · Observed output" : ""}</div></th>
            {data.days.map(day => {
              const cell = actual.cells.get(JSON.stringify([product, day.date]));
              const planCell = snapshot ? plan?.shiftCells[day.date] : undefined;
              const hasPlan = Boolean(planCell && planCell.total !== 0);
              if (!cell && !hasPlan) {
                return <td key={day.date} className="px-1 py-1.5 border-b border-l border-base-200 text-center text-base-content/25">–</td>;
              }
              const metDayPlan = Boolean(
                cell &&
                hasPlan &&
                planCell &&
                typeof cell.total === "number" &&
                typeof planCell.total === "number" &&
                planCell.total > 0 &&
                cell.total >= planCell.total,
              );
              const planOther = hasPlan && planCell ? summarizePlanOther(planCell, unit) : null;
              return <td key={day.date} className="px-1 py-1.5 border-b border-l border-base-200 align-middle">
                <div className="flex flex-col gap-1">
                  {cell && (
                    <button
                      type="button"
                      disabled={!output.data}
                      aria-label={`Observed output ${product} ${day.date}`}
                      title={`Observed · D/S ${show(cell.ds, cell.hasDs)} · N/S ${show(cell.ns, cell.hasNs)} · Total ${show(cell.total, true)}`}
                      onClick={() => setSelected({ date: day.date, product, mode: "actual", asOf: output.data?.checkedAt })}
                      className="w-full rounded-lg border border-base-300/90 border-l-[3px] border-l-[#316be8] bg-base-100 px-1.5 py-1 text-left transition-colors hover:border-[#316be8]/60 hover:bg-base-200/50 disabled:opacity-50 cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between gap-1.5 leading-none">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-blue-600">Actual</span>
                        <span
                          className={`text-[13px] font-extrabold tabular-nums whitespace-nowrap ${
                            metDayPlan ? "text-emerald-600" : "text-base-content"
                          }`}
                        >
                          {show(cell.total, true)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 whitespace-nowrap">
                        <span
                          className={`flex-1 min-w-5 rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none ${
                            cell.hasDs ? "bg-[#fdecb3] text-[#8a5a00]" : "bg-base-200/70 text-base-content/30"
                          }`}
                        >
                          {cell.hasDs ? show(cell.ds, true) : "–"}
                        </span>
                        <span
                          className={`flex-1 min-w-5 rounded px-1 py-0.5 text-center text-[10px] font-bold leading-none ${
                            cell.hasNs ? "bg-[#e9e3fb] text-[#5a3fc0]" : "bg-base-200/70 text-base-content/30"
                          }`}
                        >
                          {cell.hasNs ? show(cell.ns, true) : "–"}
                        </span>
                      </div>
                    </button>
                  )}
                  {hasPlan && planCell && (
                    <button
                      type="button"
                      disabled={!snapshot}
                      aria-label={`Planned arrivals ${product} ${day.date}`}
                      title={formatPlanTooltip(planCell, unit)}
                      onClick={() => setSelected({ date: day.date, product, mode: "plan" })}
                      className="w-full rounded-lg border border-dashed border-[#f97316]/55 bg-[#f97316]/[0.04] px-1.5 py-1 text-left transition-colors hover:border-[#f97316] hover:bg-[#f97316]/[0.09] disabled:opacity-50 cursor-pointer"
                    >
                      <div className="flex items-baseline justify-between gap-1.5 leading-none">
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-orange-600">Plan</span>
                        <span className="text-[12px] font-bold text-base-content/80 tabular-nums whitespace-nowrap">
                          {show(planCell.total, true)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 whitespace-nowrap">
                        <span
                          className={`flex-1 min-w-5 rounded px-1 py-0.5 text-center text-[10px] font-semibold leading-none ${
                            planCell.hasDs
                              ? "border border-[#e5b325]/60 bg-[#fdecb3]/55 text-[#8a5a00]"
                              : "bg-base-200/60 text-base-content/30"
                          }`}
                        >
                          {planCell.hasDs ? show(planCell.ds, true) : "–"}
                        </span>
                        <span
                          className={`flex-1 min-w-5 rounded px-1 py-0.5 text-center text-[10px] font-semibold leading-none ${
                            planCell.hasNs
                              ? "border border-[#7c62dc]/50 bg-[#e9e3fb]/55 text-[#5a3fc0]"
                              : "bg-base-200/60 text-base-content/30"
                          }`}
                        >
                          {planCell.hasNs ? show(planCell.ns, true) : "–"}
                        </span>
                        {planCell.hasOver && (
                          <span
                            title={`Over capacity: ${show(planCell.over, true)}`}
                            className="shrink-0 rounded bg-rose-600 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white"
                          >
                            !{show(planCell.over, true)}
                          </span>
                        )}
                        {planOther && (
                          <span
                            title={planOther.title}
                            className="shrink-0 rounded bg-base-300/80 px-1 py-0.5 text-center text-[10px] font-semibold leading-none text-base-content/75"
                          >
                            {planOther.label}
                          </span>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              </td>;
            })}
            <td
              title={totalTitle}
              className="sticky right-0 z-10 bg-base-100 py-2 pl-3 pr-2 text-right border-b border-l border-base-200 align-middle"
            >
              <TotalProgress
                observed={total?.total}
                hasObserved={Boolean(total)}
                planned={plan?.total}
                hasPlan={hasProductPlan}
                unit={unit}
                showPlanSlot={Boolean(snapshot)}
                showNoPlanLabel={Boolean(snapshot)}
              />
            </td>
          </tr>;
        })}
          {!products.length && <tr><td colSpan={data.days.length + 2} className="py-10 text-center text-base-content/50">{output.loading ? "Loading monthly output…" : "No saved arrivals or observed output match this month and filter."}</td></tr>}
        </tbody>
        <tfoot><tr><th scope="row" className="sticky left-0 z-10 bg-base-100 py-3 pr-4 text-left font-bold border-t-2 border-base-300">Observed / Arrivals</th>
          {data.days.map(day => <td key={day.date} title={snapshot ? formatPlanTooltip(day.shifts, unit) : undefined} className="py-3 text-center border-t-2 border-base-300">{show(actual.dates.get(day.date)?.total, actual.dates.has(day.date))}<span className="text-base-content/50"> / {snapshot ? fmt(day.plan) : "—"}</span></td>)}
          <td title={planTooltip} className="sticky right-0 z-10 bg-base-100 py-2.5 pl-3 pr-2 text-right border-t-2 border-l border-base-300 align-middle">
            <TotalProgress
              observed={actual.total}
              hasObserved={records.length > 0}
              planned={data.total}
              hasPlan={Boolean(snapshot && data.total !== 0)}
              unit={unit}
              showPlanSlot
              showNoPlanLabel={false}
            />
          </td>
        </tr></tfoot>
      </table>
    </div>
    {selection && (
      <ObservedLotDrawer
        key={JSON.stringify(selection)}
        selection={selection}
        planVersion={version}
        onClose={() => setSelected(null)}
      />
    )}
    {selected?.mode === "plan" && (
      <PlannedArrivalDrawer
        key={`${selected.date}\0${selected.product ?? ""}`}
        gate={gate}
        date={selected.date}
        product={selected.product}
        version={version}
        unit={unit}
        rows={selectedRows}
        summary={selectedSummary}
        allocations={allocations}
        onClose={() => setSelected(null)}
      />
    )}
  </div>;
}
