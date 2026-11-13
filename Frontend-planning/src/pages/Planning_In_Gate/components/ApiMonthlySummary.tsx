import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LevelingData, LotItem } from "../../Capacity_Leveling/types";
import type { CountUnit, InGateCategory } from "../types";
import type { useMonthlyOutput } from "../hooks/useMonthlyOutput";
import { observedMonth } from "../monthlyOutput";
import { ObservedLotDrawer } from "./ObservedLotDrawer";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planStatus, savedMonth } from "../savedPlan";
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
}

/** Keep saved arrivals separate from observed output and unknown historical coverage. */
export function ApiMonthlySummary({ rows, snapshot, month, today, unit, search, version, gate, category, output }: Props) {
  const [selected, setSelected] = useState<{ date: string; product?: string; mode: "actual" | "plan" } | null>(null);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => !query || row.product.toLowerCase().includes(query) || row.label.toLowerCase().includes(query));
  }, [rows, search]);
  const data = useMemo(() => savedMonth(filtered, snapshot ?? { calendarDays: [] }, month, unit), [filtered, snapshot, month, unit]);
  const records = useMemo(() => output.data?.rows.filter(row => row.gate === gate) ?? [], [output.data, gate]);
  const actual = useMemo(() => observedMonth(records, unit), [records, unit]);
  const products = useMemo(() => [...new Set([...data.products.map(row => row.product), ...actual.products.keys()])].sort(), [data, actual]);
  const plans = useMemo(() => new Map(data.products.map(row => [row.product, row])), [data]);
  const fmt = (value: number | null) => formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet");
  const show = (value: number | null | undefined, present = value !== undefined) => present ? fmt(value ?? null) : "—";
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
    };
  }), [data, actual, workToday, snapshot]);
  const selection = useMemo(() => selected?.mode === "actual" && output.data ? {
    month, category, search, gate, date: selected.date, product: selected.product, asOf: output.data.checkedAt,
  } : null, [selected, output.data, month, category, search, gate]);
  const selectedRows = selected ? filtered.filter(row => row.plannedDate === selected.date && (!selected.product || row.product === selected.product)) : [];
  const kpis = [
    { title: "Observed output (month)", value: show(actual.total, records.length > 0), sub: `${unit} · Next-gate scan evidence` },
    { title: "Plan this month", value: snapshot ? fmt(data.total) : "—", sub: version ? `Saved arrivals · Plan v${version}` : "No saved plan available" },
    { title: "Daily average", value: "—", sub: "Full-period coverage not confirmed" },
    { title: "By shift (month)", value: "", sub: "Observed output · All matching work dates" },
    { title: "Days below plan", value: "—", sub: "Arrival plan is not an output target" },
  ];
  return <div className="p-6 flex flex-col gap-4">
    <h2 className="text-sm font-extrabold uppercase tracking-wider">Monthly summary</h2>
    {output.loading && <p role="status" className="text-sm text-base-content/60">Loading observed output…</p>}
    {output.error && <div role="alert" className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm">{output.error}<button type="button" className="btn btn-xs ml-2" onClick={output.reload}>Retry output</button></div>}
    <p className="text-xs text-base-content/60">Observed output uses the next gate's SCAN IN as evidence. Missing records do not confirm zero output. Saved arrivals are shown separately; output achievement is not calculated.</p>
    {output.data && <p className="text-xs text-base-content/50">Work date includes the overnight shift{output.data.workToday ? ` · Current work date ${output.data.workToday}` : ""}. Historical coverage is not confirmed.</p>}
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map(kpi => <div key={kpi.title} className="rounded-xl border border-base-300 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">{kpi.title}</div>
        <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-tight">{kpi.title.startsWith('By shift') ? <><span className="text-[#c98a00]">{show(actual.ds, actual.hasDs)}</span><small className="text-sm text-base-content/60"> D/S · </small><span className="text-[#6d4fd8]">{show(actual.ns, actual.hasNs)}</span><small className="text-sm text-base-content/60"> N/S</small></> : kpi.value}</div>
        <div className="text-xs text-base-content/60">{kpi.sub}</div>
      </div>)}
    </div>
    <MonthlyChart compareOutputToPlan={false} data={chart} onPick={date => setSelected({ date, mode: actual.dates.has(date) ? "actual" : "plan" })} />
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/70">
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#f5c542]" />D/S observed</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#6d4fd8]" />N/S observed</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm border border-dashed border-base-content/40" />Future saved arrivals</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[#f97316]" />{version ? `Saved arrivals (Plan v${version})` : "Saved arrivals unavailable"}</span>
      <span className="ml-auto">Click output or plan to see its lots · — No evidence · N/A Unknown quantity</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead><tr className="text-xs text-base-content/60">
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
              return <td key={day.date} className="px-1 py-1 border-b border-l border-base-200 text-center">
                <button type="button" disabled={!output.data} aria-label={`Observed output ${product} ${day.date}`} onClick={() => setSelected({ date: day.date, product, mode: "actual" })} className="w-full rounded-md px-1 py-1 hover:bg-base-200/70 disabled:opacity-50">
                  <span className="inline-flex gap-1 text-[11px] font-semibold"><span className="rounded bg-[#fdecb3] text-[#8a5a00] px-1">{show(cell?.ds, cell?.hasDs ?? false)}</span><span className="rounded bg-[#e9e3fb] text-[#5a3fc0] px-1">{show(cell?.ns, cell?.hasNs ?? false)}</span></span>
                  <div className="text-xs font-semibold">{show(cell?.total, Boolean(cell))}</div>
                </button>
                <button type="button" disabled={!snapshot} onClick={() => setSelected({ date: day.date, product, mode: "plan" })} className="w-full text-xs text-base-content/60 rounded hover:bg-base-200/70 py-0.5">Plan {snapshot ? fmt(plan ? plan.cells[day.date] : 0) : "—"}</button>
              </td>;
            })}
            <td className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right border-b border-base-200"><div className="font-semibold">{show(total?.total, Boolean(total))}</div><div className="text-xs text-base-content/50">Plan {snapshot ? fmt(plan ? plan.total : 0) : "—"}</div></td>
          </tr>;
        })}
          {!products.length && <tr><td colSpan={data.days.length + 2} className="py-10 text-center text-base-content/50">{output.loading ? "Loading monthly output…" : "No saved arrivals or observed output match this month and filter."}</td></tr>}
        </tbody>
        <tfoot><tr><th scope="row" className="sticky left-0 z-10 bg-base-100 py-3 pr-4 text-left font-bold border-t-2 border-base-300">Observed / Arrivals</th>
          {data.days.map(day => <td key={day.date} className="py-3 text-center border-t-2 border-base-300">{show(actual.dates.get(day.date)?.total, actual.dates.has(day.date))}<span className="text-base-content/50"> / {snapshot ? fmt(day.plan) : "—"}</span></td>)}
          <td className="sticky right-0 z-10 bg-base-100 py-3 pl-3 text-right border-t-2 border-base-300">{show(actual.total, records.length > 0)} / {snapshot ? fmt(data.total) : "—"}</td>
        </tr></tfoot>
      </table>
    </div>
    {selection && <ObservedLotDrawer key={JSON.stringify(selection)} selection={selection} onClose={() => setSelected(null)} />}
    {selected?.mode === "plan" && createPortal(<div className="planning-summary-gate fixed inset-0 z-[120] flex justify-end" onKeyDown={event => event.key === 'Escape' && setSelected(null)}>
      <button type="button" aria-label="Close lot details backdrop" className="absolute inset-0 bg-slate-900/30" onClick={() => setSelected(null)} />
      <aside role="dialog" aria-modal="true" aria-label="Saved plan lots" className="relative h-full w-full max-w-3xl bg-base-100 border-l border-base-300 shadow-2xl overflow-y-auto p-5">
        <div className="flex justify-between items-center gap-2"><div><h3 className="font-bold">Planned arrivals · {selected.date}</h3><p className="text-xs text-base-content/60">Plan v{version} · Status at save</p></div><button autoFocus type="button" className="btn btn-sm btn-ghost" aria-label="Close lot details" onClick={() => setSelected(null)}><X size={18} /></button></div>
        <div className="mt-4 overflow-x-auto"><table className="table table-sm"><thead><tr><th>Product</th><th>Lot</th><th>Pcs</th><th>Sheets</th><th>Status at save</th></tr></thead>
          <tbody>{selectedRows.slice(0, 200).map(lot => <tr key={lot.id}><td>{lot.product}</td><td>{lot.label}</td><td>{formatGateQuantity(lot.qty, 'piece')}</td><td>{formatGateQuantity(lot.sheets, 'sheet')}</td><td>{planStatus(lot)}</td></tr>)}</tbody>
        </table></div>{!selectedRows.length && <p className="p-8 text-center text-sm text-base-content/50">No saved arrivals for this selection.</p>}
        {selectedRows.length > 200 && <p className="mt-3 text-xs text-base-content/60">Showing the first 200 records. Use the daily view or Excel for the full list.</p>}
      </aside>
    </div>, document.body)}
  </div>;
}
