import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LevelingData, LotItem } from "../../Capacity_Leveling/types";
import type { CountUnit } from "../types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planStatus, savedMonth } from "../savedPlan";
import { MonthlyChart, type ChartDay } from "./MonthlyChart";

interface Props {
  rows: LotItem[];
  snapshot: LevelingData;
  month: string;
  today: string;
  unit: CountUnit;
  search: string;
  version: number;
}

/** Preserve the monthly cards/chart/grid design without generating any actual production data. */
export function ApiMonthlySummary({ rows, snapshot, month, today, unit, search, version }: Props) {
  const [selected, setSelected] = useState<{ date: string; product?: string } | null>(null);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => !query || row.product.toLowerCase().includes(query) || row.label.toLowerCase().includes(query));
  }, [rows, search]);
  const data = useMemo(() => savedMonth(filtered, snapshot, month, unit), [filtered, snapshot, month, unit]);
  const fmt = (value: number | null) => formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet");
  const chart = useMemo<ChartDay[]>(() => data.days.map(day => ({
    date: day.date, label: String(day.day), off: day.off,
    phase: day.date === today ? "today" : day.date < today ? "past" : "future",
    ds: null, ns: null, planFuture: day.plan, plan: day.plan,
  })), [data, today]);
  const selectedRows = selected ? filtered.filter(row => row.plannedDate === selected.date && (!selected.product || row.product === selected.product)) : [];
  const kpis = [
    { title: "Out month-to-date", value: "—", sub: "Actual scan-out data unavailable" },
    { title: "Plan this month", value: fmt(data.total), sub: `${unit} · Saved plan v${version}` },
    { title: "Daily average", value: "—", sub: "Actual output unavailable" },
    { title: "By shift (to yesterday)", value: "D/S — · N/S —", sub: "Shift output unavailable" },
    { title: "Days below plan", value: "—", sub: "Actual output required" },
  ];
  return <div className="p-6 flex flex-col gap-4">
    <h2 className="text-sm font-extrabold uppercase tracking-wider">Monthly summary</h2>
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {kpis.map(kpi => <div key={kpi.title} className="rounded-xl border border-base-300 px-4 py-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">{kpi.title}</div>
        <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-tight">{kpi.title.startsWith('By shift') ? <><span className="text-[#c98a00]">—</span><small className="text-sm text-base-content/60"> D/S · </small><span className="text-[#6d4fd8]">—</span><small className="text-sm text-base-content/60"> N/S</small></> : kpi.value}</div>
        <div className="text-xs text-base-content/60">{kpi.sub}</div>
      </div>)}
    </div>
    <MonthlyChart data={chart} onPick={date => setSelected({ date })} />
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/70">
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#f5c542]" />D/S actual —</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#6d4fd8]" />N/S actual —</span>
      <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm border border-dashed border-base-content/40" />Saved arrivals</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[#f97316]" />Saved plan (Plan v{version})</span>
      <span className="ml-auto">Click a bar or cell to see planned lots</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
        <thead><tr className="text-xs text-base-content/60">
          <th scope="col" className="sticky left-0 z-10 bg-base-100 py-2 pr-4 text-left font-semibold uppercase tracking-wide border-b border-base-300 min-w-[170px]">Product</th>
          {data.days.map(day => <th key={day.date} scope="col" className={`px-1 py-2 text-center font-normal border-b border-l border-base-300 min-w-[88px] ${day.date === today ? "bg-[#316be8] text-white rounded-t-lg" : ""}`}>
            <div>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(`${day.date}T00:00:00Z`).getUTCDay()]}</div>
            <div className="text-sm font-bold">{day.day}</div>{day.off && <small>OFF</small>}
          </th>)}
          <th scope="col" className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right font-semibold uppercase border-b border-base-300 min-w-[90px]">Total</th>
        </tr></thead>
        <tbody>{data.products.map(row => <tr key={row.product}>
          <th scope="row" className="sticky left-0 z-10 bg-base-100 py-2 pr-4 text-left border-b border-base-200"><div className="font-bold">{row.product}</div><div className="text-xs font-normal text-base-content/50">Saved arrivals</div></th>
          {data.days.map(day => <td key={day.date} className="px-1 py-1 border-b border-l border-base-200 text-center">
            <button type="button" title={`${row.product} · ${day.date} · saved plan`} onClick={() => setSelected({ date: day.date, product: row.product })} className="w-full rounded-md px-1 py-1.5 hover:bg-base-200/70 text-center">
              <span className="inline-flex gap-1 text-[11px] font-semibold"><span className="rounded bg-[#fdecb3] text-[#8a5a00] px-1">—</span><span className="rounded bg-[#e9e3fb] text-[#5a3fc0] px-1">—</span></span>
              <div className="text-xs text-base-content/60">Plan {fmt(row.cells[day.date])}</div>
            </button>
          </td>)}
          <td className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right border-b border-base-200"><div className="font-semibold">—</div><div className="text-xs text-base-content/50">Plan {fmt(row.total)}</div></td>
        </tr>)}
          {!data.products.length && <tr><td colSpan={data.days.length + 2} className="py-10 text-center text-base-content/50">No saved arrivals match this month and filter.</td></tr>}
        </tbody>
        <tfoot><tr><th scope="row" className="sticky left-0 z-10 bg-base-100 py-3 pr-4 text-left font-bold border-t-2 border-base-300">Total / Plan</th>
          {data.days.map(day => <td key={day.date} className="py-3 text-center border-t-2 border-base-300"><span className="text-base-content/40">— / </span>{fmt(day.plan)}</td>)}
          <td className="sticky right-0 z-10 bg-base-100 py-3 pl-3 text-right border-t-2 border-base-300">— / {fmt(data.total)}</td>
        </tr></tfoot>
      </table>
    </div>
    {selected && createPortal(<div className="planning-summary-gate fixed inset-0 z-[120] flex justify-end" onKeyDown={event => event.key === 'Escape' && setSelected(null)}>
      <button type="button" aria-label="Close lot details backdrop" className="absolute inset-0 bg-slate-900/30" onClick={() => setSelected(null)} />
      <aside role="dialog" aria-modal="true" aria-label="Saved plan lots" className="relative h-full w-full max-w-3xl bg-base-100 border-l border-base-300 shadow-2xl overflow-y-auto p-5">
        <div className="flex justify-between items-center gap-2"><div><h3 className="font-bold">Planned lots · {selected.date}</h3><p className="text-xs text-base-content/60">Plan v{version} · Scan-in/out and actual output unavailable</p></div><button autoFocus type="button" className="btn btn-sm btn-ghost" aria-label="Close lot details" onClick={() => setSelected(null)}><X size={18} /></button></div>
        <div className="mt-4 overflow-x-auto"><table className="table table-sm"><thead><tr><th>Product</th><th>Lot</th><th>Pcs</th><th>Sheets</th><th>Status at save</th><th>Scan in/out</th></tr></thead>
          <tbody>{selectedRows.slice(0, 200).map(lot => <tr key={lot.id}><td>{lot.product}</td><td>{lot.label}</td><td>{formatGateQuantity(lot.qty, 'piece')}</td><td>{formatGateQuantity(lot.sheets, 'sheet')}</td><td>{planStatus(lot)}</td><td>—</td></tr>)}</tbody>
        </table></div>{!selectedRows.length && <p className="p-8 text-center text-sm text-base-content/50">No saved arrivals for this selection.</p>}
        {selectedRows.length > 200 && <p className="mt-3 text-xs text-base-content/60">Showing the first 200 records. Use the daily view or Excel for the full list.</p>}
      </aside>
    </div>, document.body)}
  </div>;
}
