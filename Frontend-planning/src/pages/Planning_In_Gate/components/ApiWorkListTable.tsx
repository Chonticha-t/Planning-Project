import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpToLine, Check, GripVertical } from "lucide-react";
import type { BoardShiftAllocation, CapacityDay, LotItem } from "../../Capacity_Leveling/types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planQuantity, planStatus } from "../savedPlan";
import { useLotRouting, type LotRouting } from "../hooks/useLotRouting";
import { LiveRouteDetails } from "./LiveRouteDetails";
import type { FinishedEvidence, FinishedState } from "../hooks/useFinishedToday";

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
  finished: FinishedState;
}

/** Keep the original queue design; all quantities come from the saved API snapshot. */
export function ApiWorkListTable({ planOrder, search, allocations, capacity, finished }: Props) {
  const [filter, setFilter] = useState<Filter>("queue");
  const [page, setPage] = useState(0);
  const [routeLot, setRouteLot] = useState<LotItem | null>(null);
  const query = search.trim().toLowerCase();
  const completed = new Set(finished.rows.map(row => JSON.stringify([row.gate, row.lotNo])));
  const rows = useMemo(() => planOrder.map((lot, index) => ({ lot, sequence: index + 1 }))
    .filter(({ lot }) => !query || lot.product.toLowerCase().includes(query) || lot.label.toLowerCase().includes(query)), [planOrder, query]);
  const pending = rows.filter(({ lot }) => lot.kind !== "lot" || !completed.has(JSON.stringify([lot.gate, lot.label])));
  const finishedRows = finished.rows.filter(row => !query || row.product.toLowerCase().includes(query) || row.lotNo.toLowerCase().includes(query));
  const display = [
    ...(filter !== "queue" ? finishedRows.map((evidence, index) => ({ evidence, sequence: index + 1 })) : []),
    ...(filter !== "finished" ? pending : []),
  ];
  const totalLoad = planOrder.reduce<number | null>((sum, lot) => lot.kind !== "lot" ? sum
    : sum === null || lot.loadMin === null ? null : sum + lot.loadMin, 0);
  const capacityMin = capacity?.capacityMin;
  const pct = totalLoad !== null && typeof capacityMin === "number" && capacityMin > 0 ? Math.round(totalLoad / capacityMin * 100) : null;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(display.length / PAGE_SIZE) - 1));
  const visible = display.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const routing = useLotRouting(visible.flatMap(row => "lot" in row ? [row.lot] : []));
  const lotCount = planQuantity(planOrder, "lots");
  const needs = planOrder.filter(lot => lot.kind !== "lot").length;
  const pendingCount = planOrder.filter(lot => lot.kind === "lot" && !completed.has(JSON.stringify([lot.gate, lot.label]))).length;
  const countAvailable = !finished.needsLogin && !finished.loading && !finished.error;
  const finishedCount = countAvailable ? finished.rows.length : "—";

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/45 px-3 py-2">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-base-200 p-1">
        {([['all', `All lots (${countAvailable ? pendingCount + finished.rows.length : "—"})`], ['queue', `In queue (${pendingCount})`], ['finished', `Finished today (${finishedCount})`]] as const).map(([value, text]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${filter === value ? "bg-base-100 text-[#316be8] shadow-2xs" : "text-base-content/65 hover:text-base-content"}`}>{text}</button>)}
        {needs > 0 && <span className="px-2 text-xs text-base-content/60">+ {needs} requirements / no ID</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/70 tabular-nums">
        <span>Finished today: <b>{finishedCount} lots observed</b></span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-[#fdecb3] text-[#8a5a00]"><span className="h-2 w-2 rounded-xs bg-[#f59e0b]" />D/S —</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-[#e9e3fb] text-[#5a3fc0]"><span className="h-2 w-2 rounded-full bg-[#6d4fd8]" />N/S —</span>
      </div>
    </div>
    <div className="text-xs text-base-content/60" role={finished.error ? "alert" : "status"}>
      {finished.needsLogin ? <><span>Sign in to read Finished today. </span><button type="button" className="link" onClick={finished.login}>Sign in</button></>
        : finished.loading ? "Loading next-gate SCAN IN evidence…"
        : finished.error ? <>{finished.error} <button type="button" className="link" onClick={finished.reload}>Retry finished</button></>
        : <>Finished = SCAN IN at the next gate, using its in_date calendar day. Latest WIP evidence only; not a complete scan history.
          {finished.unresolved > 0 && <span> Some scans have unresolved routing or category and are excluded from the corresponding totals.</span>}
          <button type="button" className="link ml-2" onClick={finished.reload}>Refresh finished</button></>}
    </div>
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <table className="w-full min-w-[980px] table-fixed text-sm text-base-content tabular-nums">
        <colgroup>{[5.5, 12.5, 9.5, 8.5, 8.5, 17, 7.5, 7.5, 13.5, 10].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr className="whitespace-nowrap bg-slate-100 border-b border-base-300 text-[11px] font-extrabold tracking-wide text-slate-700 uppercase">
          {[['NO', ''], ['PRODUCT', 'Lot No'], ['STATUS', filter === "queue" ? 'at save' : 'scan evidence / saved'], ['SHEET', '/ lot'], ['PCS', '/ lot'], ['ROUTE · WHERE NOW', 'latest WIP'], ['PLAN', '(Lot)'], ['PLAN', '(min)'], ['CAPACITY USED', 'planned'], ['ORDER', '']].map(([title, sub], index) =>
            <th key={index} scope="col" className={`px-2.5 py-2.5 border-r border-base-300 ${[3, 4, 7].includes(index) ? 'text-right' : index === 1 ? 'text-left' : 'text-center'}`}>
              <div>{title}</div>{sub && <div className="text-[10px] font-semibold normal-case text-slate-500">{sub}</div>}
            </th>)}
        </tr></thead>
        <tbody>
          <>
            {filter !== "finished" &&
            <tr className="h-10 bg-slate-50 border-b border-base-300 text-xs">
              <td colSpan={3} className="px-3 font-extrabold uppercase tracking-wider text-slate-700 border-r border-base-200">SAVED PLAN SUMMARY</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200">{formatGateQuantity(planQuantity(planOrder, "sheets"), "sheet")}</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200">{formatGateQuantity(planQuantity(planOrder, "pcs"), "piece")}</td>
              <td className="text-center border-r border-base-200">{unavailable}</td>
              <td className="text-center font-extrabold border-r border-base-200">{lotCount}</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200" title="Saved daily planning load; not remaining runtime">{totalLoad === null ? unavailable : totalLoad.toLocaleString()}</td>
              <td className="px-3 border-r border-base-200"><CapacityBar pct={pct} /></td>
              <td className="text-center">{unavailable}</td>
            </tr>}
            {visible.map((row, index) => {
              if ("evidence" in row) return <FinishedRow key={row.evidence.id} record={row.evidence} sequence={row.sequence} />;
              const { lot, sequence } = row;
              const allocation = allocations.get(lot.id);
              const group = allocation?.status;
              const day = group === "day";
              const night = group === "night" || group === "split";
              const color = day ? "#f59e0b" : night ? "#6d4fd8" : "#94a3b8";
              const previous = visible[index - 1];
              const showSection = !previous || !("lot" in previous) || allocations.get(previous.lot.id)?.status !== group;
              return <QueueRow key={lot.id} lot={lot} sequence={sequence} color={color} showSection={showSection}
                section={shiftName(allocation)} sectionClass={day ? "bg-[#fef3c7] text-[#8a5a00] border-[#f5c542]" : night ? "bg-[#e9e3fb] text-[#5a3fc0] border-[#c4b5fd]" : "bg-base-200/70 text-base-content/60 border-base-300"}
                allocation={allocation} route={routing.routes.get(lot.id)} routeLoading={routing.loading}
                routeUnavailable={Boolean(routing.error)} needsLogin={routing.needsLogin} onRoute={() => setRouteLot(lot)} />;
            })}
            {!display.length && <tr><td colSpan={10} className="py-10 text-center text-base-content/50">{filter === "finished" ? countAvailable ? "No next-gate SCAN IN evidence found for this gate and date in latest WIP." : "Finished today is not available yet." : query ? "No lots match your search." : "No pending saved arrivals for this gate and day."}</td></tr>}
          </>
        </tbody>
      </table>
    </div>
    {display.length > PAGE_SIZE && <div className="flex justify-end items-center gap-3 text-xs">
      <span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, display.length)} of {display.length}</span>
      <button type="button" className="btn btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <button type="button" className="btn btn-sm" disabled={(currentPage + 1) * PAGE_SIZE >= display.length} onClick={() => setPage(currentPage + 1)}>Next</button>
    </div>}
    {routeLot && <LiveRouteDetails lot={routeLot} route={routing.routes.get(routeLot.id)} loading={routing.loading} error={routing.error} checkedAt={routing.checkedAt} needsLogin={routing.needsLogin} login={routing.login} retry={routing.retry} onClose={() => setRouteLot(null)} />}
  </div>;
}

function FinishedRow({ record, sequence }: { record: FinishedEvidence; sequence: number }) {
  return <tr data-finished-row className="h-14 border-b border-base-300 bg-base-200/25" style={{ boxShadow: "inset 4px 0 0 #94a3b8" }}>
    <td className="px-2 text-center border-r border-base-200"><div className="inline-flex items-center gap-1"><Check size={13} className="text-base-content/40" /><span className="text-xs font-bold">{sequence}</span></div></td>
    <td className="px-3 py-1.5 border-r border-base-200"><div className="font-bold text-sm break-words">{record.product}</div><div className="text-xs text-base-content/55">{record.lotNo}</div></td>
    <td className="px-2.5 text-center border-r border-base-200"><span className="rounded-md bg-base-200 px-2.5 py-0.5 text-xs font-bold text-base-content/70">Finished</span><div className="mt-1 text-[11px] tabular-nums" title={`Next gate SCAN IN: ${record.scannedAt}`}>{record.scannedAt.slice(11, 19)}</div></td>
    <td className="px-2.5 text-right border-r border-base-200" title="Actual passed quantity is not available">{unavailable}</td><td className="px-2.5 text-right border-r border-base-200" title="Actual passed quantity is not available">{unavailable}</td>
    <td className="px-3 text-center border-r border-base-200"><div className="text-xs font-bold">{record.gate} → {record.nextGate}</div><div className="text-[11px] text-base-content/60">SCAN IN · {record.currentProcess || record.nextGate}</div></td>
    {["plan-lots", "plan-minutes", "capacity", "order"].map(key => <td key={key} className="px-2.5 text-center border-r border-base-200">{unavailable}</td>)}
  </tr>;
}

function CapacityBar({ pct }: { pct: number | null }) {
  return <div className="flex items-center gap-2" title="Planning load relative to saved capacity; not actual utilization">
    <div className="relative flex h-2 w-18 shrink-0 items-center rounded-full bg-slate-200/85">
      {pct !== null && <div className="h-full rounded-full bg-[#316be8]" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />}
      <span className="absolute -right-px top-1/2 h-3 w-[1.5px] -translate-y-1/2 bg-slate-700" />
    </div><span className="text-xs font-extrabold text-[#316be8]">{pct === null ? "—" : `${pct}%`}</span>
  </div>;
}

function QueueRow({ lot, sequence, color, showSection, section, sectionClass, allocation, route, routeLoading, routeUnavailable, needsLogin, onRoute }: {
  lot: LotItem; sequence: number; color: string; showSection: boolean; section: string;
  sectionClass: string; allocation?: BoardShiftAllocation; route?: LotRouting;
  routeLoading: boolean; routeUnavailable: boolean; needsLogin: boolean; onRoute: () => void;
}) {
  return <>
    {showSection && <tr className={`h-9 border-y ${sectionClass}`}><td colSpan={10} className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider"><span className="inline-block h-2.5 w-2.5 mr-2 rounded-xs" style={{ backgroundColor: color }} />{section}</td></tr>}
    <tr data-plan-row className="h-14 border-b border-base-300 bg-base-100 hover:bg-base-200/60" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
      <td className="px-2 text-center border-r border-base-200"><div className="inline-flex gap-1 items-center"><GripVertical size={14} className="text-base-content/15" /><span className="w-5 text-xs font-extrabold">{sequence}</span></div></td>
      <td className="px-3 py-1.5 border-r border-base-200"><div className="font-bold text-sm break-words">{lot.product}</div><div className="mt-0.5 text-xs font-semibold text-base-content/55">{lot.kind === "unidentified" ? "No lot identity" : lot.label}</div></td>
      <td className="px-2.5 text-center border-r border-base-200"><span title="Status captured when this plan was saved" className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-bold ${lot.isHold ? "bg-[#fdecb3] text-[#8a5a00]" : lot.gateState === "in_gate" ? "bg-[#316be8] text-white" : "bg-base-200 text-base-content/70"}`}>{planStatus(lot)}</span></td>
      <td className="px-2.5 text-right font-bold text-xs border-r border-base-200">{formatGateQuantity(lot.sheets, "sheet")}</td>
      <td className="px-2.5 text-right font-bold text-xs border-r border-base-200">{formatGateQuantity(lot.qty, "piece")}</td>
      <td className="px-3 text-center border-r border-base-200"><button type="button" onClick={onRoute} title="Inspect routing and current WIP" className="inline-flex max-w-full items-center gap-2 rounded-full border border-base-300/80 bg-base-100 px-3 py-1 hover:border-[#316be8]/50 text-xs"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${route?.status === "matched" ? "bg-[#316be8]" : "bg-base-300"}`} /><span className="truncate">{needsLogin ? "Sign in for routing" : routeLoading ? "Loading…" : routeUnavailable ? "Routing unavailable" : route?.status === "matched" ? route.current?.process || route.current?.gate || "Details" : "Position unconfirmed"}</span></button></td>
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
