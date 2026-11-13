import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpToLine, GripVertical, X } from "lucide-react";
import type { BoardShiftAllocation, CapacityDay, LotItem } from "../../Capacity_Leveling/types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planQuantity, planStatus } from "../savedPlan";

const unavailable = <span className="text-base-content/40" title="Not available in the saved plan">—</span>;
const PAGE_SIZE = 100;
type Filter = "all" | "queue" | "finished";
const shiftName = (allocation?: BoardShiftAllocation) => {
  switch (allocation?.status) {
    case "day": return "DAY SHIFT · Planned allocation";
    case "night": return "NIGHT SHIFT · Planned allocation";
    case "split": return "D/S + N/S · Planned allocation";
    case "over": return "OVER CAPACITY · Review plan";
    case "none": return "REQUIREMENTS · No production lot";
    default: return "SHIFT UNASSIGNED · Capacity unavailable";
  }
};

interface Props {
  planOrder: LotItem[];
  search: string;
  allocations: ReadonlyMap<string, BoardShiftAllocation>;
  capacity?: CapacityDay;
}

/** Keep the original queue design; all quantities come from the saved API snapshot. */
export function ApiWorkListTable({ planOrder, search, allocations, capacity }: Props) {
  const [filter, setFilter] = useState<Filter>("queue");
  const [page, setPage] = useState(0);
  const [routeLot, setRouteLot] = useState<LotItem | null>(null);
  const query = search.trim().toLowerCase();
  const rows = useMemo(() => planOrder.map((lot, index) => ({ lot, sequence: index + 1 }))
    .filter(({ lot }) => !query || lot.product.toLowerCase().includes(query) || lot.label.toLowerCase().includes(query)), [planOrder, query]);
  const totalLoad = planOrder.reduce<number | null>((sum, lot) => lot.kind !== "lot" ? sum
    : sum === null || lot.loadMin === null ? null : sum + lot.loadMin, 0);
  const capacityMin = capacity?.capacityMin;
  const pct = totalLoad !== null && typeof capacityMin === "number" && capacityMin > 0 ? Math.round(totalLoad / capacityMin * 100) : null;
  const visible = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const lotCount = planQuantity(planOrder, "lots");
  const needs = planOrder.filter(lot => lot.kind !== "lot").length;

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/45 px-3 py-2">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-base-200 p-1">
        {([['all', `All lots (${lotCount})`], ['queue', `In queue (${lotCount})`], ['finished', 'Finished today (—)']] as const).map(([value, text]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${filter === value ? "bg-base-100 text-[#316be8] shadow-2xs" : "text-base-content/65 hover:text-base-content"}`}>{text}</button>)}
        {needs > 0 && <span className="px-2 text-xs text-base-content/60">+ {needs} requirements / no ID</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/70 tabular-nums">
        <span>Finished today: <b>—</b></span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-[#fdecb3] text-[#8a5a00]"><span className="h-2 w-2 rounded-xs bg-[#f59e0b]" />D/S —</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-[#e9e3fb] text-[#5a3fc0]"><span className="h-2 w-2 rounded-full bg-[#6d4fd8]" />N/S —</span>
      </div>
    </div>
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <table className="w-full min-w-[980px] table-fixed text-sm text-base-content tabular-nums">
        <colgroup>{[5.5, 12.5, 9.5, 8.5, 8.5, 17, 7.5, 7.5, 13.5, 10].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr className="whitespace-nowrap bg-slate-100 border-b border-base-300 text-[11px] font-extrabold tracking-wide text-slate-700 uppercase">
          {[['NO', ''], ['PRODUCT', 'Lot No'], ['STATUS', 'at save'], ['SHEET', '/ lot'], ['PCS', '/ lot'], ['ROUTE · WHERE NOW', 'at save'], ['PLAN', '(Lot)'], ['PLAN', '(min)'], ['CAPACITY USED', 'planned'], ['ORDER', '']].map(([title, sub], index) =>
            <th key={index} scope="col" className={`px-2.5 py-2.5 border-r border-base-300 ${[3, 4, 7].includes(index) ? 'text-right' : index === 1 ? 'text-left' : 'text-center'}`}>
              <div>{title}</div>{sub && <div className="text-[10px] font-semibold normal-case text-slate-500">{sub}</div>}
            </th>)}
        </tr></thead>
        <tbody>
          {filter === "finished" ? <tr><td colSpan={10} className="py-10 text-center text-base-content/50">Actual scan-out data is not available. Finished quantity is unknown.</td></tr> : <>
            <tr className="h-10 bg-slate-50 border-b border-base-300 text-xs">
              <td colSpan={3} className="px-3 font-extrabold uppercase tracking-wider text-slate-700 border-r border-base-200">TOTAL SUMMARY</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200">{formatGateQuantity(planQuantity(planOrder, "sheets"), "sheet")}</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200">{formatGateQuantity(planQuantity(planOrder, "pcs"), "piece")}</td>
              <td className="text-center border-r border-base-200">{unavailable}</td>
              <td className="text-center font-extrabold border-r border-base-200">{lotCount}</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200" title="Saved daily planning load; not remaining runtime">{totalLoad === null ? unavailable : totalLoad.toLocaleString()}</td>
              <td className="px-3 border-r border-base-200"><CapacityBar pct={pct} /></td>
              <td className="text-center">{unavailable}</td>
            </tr>
            {visible.map(({ lot, sequence }, index) => {
              const allocation = allocations.get(lot.id);
              const group = allocation?.status;
              const day = group === "day";
              const night = group === "night" || group === "split";
              const color = day ? "#f59e0b" : night ? "#6d4fd8" : "#94a3b8";
              const showSection = index === 0 || allocations.get(visible[index - 1].lot.id)?.status !== group;
              return <QueueRow key={lot.id} lot={lot} sequence={sequence} color={color} showSection={showSection}
                section={shiftName(allocation)} sectionClass={day ? "bg-[#fef3c7] text-[#8a5a00] border-[#f5c542]" : night ? "bg-[#e9e3fb] text-[#5a3fc0] border-[#c4b5fd]" : "bg-base-200/70 text-base-content/60 border-base-300"}
                allocation={allocation} onRoute={() => setRouteLot(lot)} />;
            })}
            {!rows.length && <tr><td colSpan={10} className="py-10 text-center text-base-content/50">{query ? "No lots match your search." : "No saved arrivals for this gate and day."}</td></tr>}
          </>}
        </tbody>
      </table>
    </div>
    {filter !== "finished" && rows.length > PAGE_SIZE && <div className="flex justify-end items-center gap-3 text-xs">
      <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}</span>
      <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
      <button type="button" className="btn btn-sm" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage(value => value + 1)}>Next</button>
    </div>}
    {routeLot && createPortal(<div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4" onKeyDown={event => event.key === 'Escape' && setRouteLot(null)}>
      <button type="button" aria-label="Close route backdrop" className="absolute inset-0 bg-slate-900/20" onClick={() => setRouteLot(null)} />
      <div role="dialog" aria-modal="true" aria-label="Saved gate route" className="relative w-[360px] max-w-full rounded-2xl border border-base-300 bg-base-100 p-4 text-base-content shadow-2xl">
        <div className="flex justify-between items-center gap-2 text-xs font-bold"><span>{routeLot.product} · {routeLot.label}</span><button autoFocus type="button" aria-label="Close gate route" onClick={() => setRouteLot(null)}><X size={16} /></button></div>
        <div className="mt-3 flex justify-around items-center rounded-xl bg-base-200/40 p-3 text-xs font-bold">
          {[routeLot.prevGate, routeLot.gate, routeLot.nextGate].map((name, index) => <span key={index} className={index === 1 ? "text-[#316be8]" : "text-base-content/60"}><span className="block mx-auto mb-1 h-3 w-3 rounded-full bg-current" />{name || "—"}</span>)}
        </div>
        <dl className="grid grid-cols-2 gap-2 mt-4 text-xs">
          <dt>Current gate at save</dt><dd>{routeLot.currentGate || "—"}</dd>
          <dt>Process at save</dt><dd>{routeLot.currentProc || "—"}</dd>
          <dt>Planned arrival</dt><dd>{routeLot.plannedDate}</dd>
          <dt>Source must out</dt><dd>{routeLot.mustOut || "—"}</dd>
        </dl><p className="mt-3 text-xs text-base-content/50">Detailed process steps, scan times and ETA are unavailable.</p>
      </div>
    </div>, document.body)}
  </div>;
}

function CapacityBar({ pct }: { pct: number | null }) {
  return <div className="flex items-center gap-2" title="Planning load relative to saved capacity; not actual utilization">
    <div className="relative flex h-2 w-18 shrink-0 items-center rounded-full bg-slate-200/85">
      {pct !== null && <div className="h-full rounded-full bg-[#316be8]" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />}
      <span className="absolute -right-px top-1/2 h-3 w-[1.5px] -translate-y-1/2 bg-slate-700" />
    </div><span className="text-xs font-extrabold text-[#316be8]">{pct === null ? "—" : `${pct}%`}</span>
  </div>;
}

function QueueRow({ lot, sequence, color, showSection, section, sectionClass, allocation, onRoute }: {
  lot: LotItem; sequence: number; color: string; showSection: boolean; section: string;
  sectionClass: string; allocation?: BoardShiftAllocation; onRoute: () => void;
}) {
  return <>
    {showSection && <tr className={`h-9 border-y ${sectionClass}`}><td colSpan={10} className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider"><span className="inline-block h-2.5 w-2.5 mr-2 rounded-xs" style={{ backgroundColor: color }} />{section}</td></tr>}
    <tr data-plan-row className="h-14 border-b border-base-300 bg-base-100 hover:bg-base-200/60" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
      <td className="px-2 text-center border-r border-base-200"><div className="inline-flex gap-1 items-center"><GripVertical size={14} className="text-base-content/15" /><span className="w-5 text-xs font-extrabold">{sequence}</span></div></td>
      <td className="px-3 py-1.5 border-r border-base-200"><div className="font-bold text-sm break-words">{lot.product}</div><div className="mt-0.5 text-xs font-semibold text-base-content/55">{lot.kind === "unidentified" ? "No lot identity" : lot.label}</div></td>
      <td className="px-2.5 text-center border-r border-base-200"><span title="Status captured when this plan was saved" className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-bold ${lot.isHold ? "bg-[#fdecb3] text-[#8a5a00]" : lot.gateState === "in_gate" ? "bg-[#316be8] text-white" : "bg-base-200 text-base-content/70"}`}>{planStatus(lot)}</span></td>
      <td className="px-2.5 text-right font-bold text-xs border-r border-base-200">{formatGateQuantity(lot.sheets, "sheet")}</td>
      <td className="px-2.5 text-right font-bold text-xs border-r border-base-200">{formatGateQuantity(lot.qty, "piece")}</td>
      <td className="px-3 text-center border-r border-base-200"><button type="button" onClick={onRoute} title="Inspect saved route" className="inline-flex max-w-full items-center gap-2 rounded-full border border-base-300/80 bg-base-100 px-3 py-1 hover:border-[#316be8]/50 text-xs"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#316be8]" /><span className="truncate">{lot.currentProc || lot.currentGate || "Details"}</span></button></td>
      <td className="px-2.5 text-center font-extrabold text-xs border-r border-base-200">{lot.kind === "lot" ? 1 : unavailable}</td>
      <td className="px-2.5 text-right text-xs font-bold border-r border-base-200" title="Saved daily planning load; not runtime or ETA">{lot.kind === "lot" && lot.loadMin !== null ? lot.loadMin.toLocaleString() : unavailable}</td>
      <td className="px-3 border-r border-base-200" title={allocation?.reason ?? "Planned allocation from saved capacity; not actual utilization"}>
        {allocation && !["none", "unassigned"].includes(allocation.status) ? <div className="py-1.5 text-[11px] font-semibold tabular-nums leading-5">
          <div className="text-[#8a5a00]">D/S {allocation.dayMin.toLocaleString()}m</div>
          <div className="text-[#5a3fc0]">N/S {allocation.nightMin.toLocaleString()}m</div>
          {allocation.overflowMin > 0 && <div className="text-rose-600">Over {allocation.overflowMin.toLocaleString()}m</div>}
        </div> : unavailable}
      </td>
      <td className="px-2 text-center"><div className="inline-flex gap-1">{[{ Icon: ArrowUp, title: 'Move up' }, { Icon: ArrowDown, title: 'Move down' }, { Icon: ArrowUpToLine, title: 'Move to top' }].map(({ Icon, title }) =>
        <button key={title} type="button" disabled title={`${title}: Save order is not connected`} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/80 disabled:opacity-30"><Icon size={13} /></button>)}</div></td>
    </tr>
  </>;
}
