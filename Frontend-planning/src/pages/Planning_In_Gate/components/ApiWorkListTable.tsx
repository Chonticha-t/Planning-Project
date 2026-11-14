import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpToLine, Check, GripVertical } from "lucide-react";
import type { BoardShiftAllocation, CapacityDay, LotItem } from "../../Capacity_Leveling/types";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { planStatus, summarizeActivePlan } from "../savedPlan";
import { useLotRouting, type LotRouting } from "../hooks/useLotRouting";
import { LiveRouteDetails } from "./LiveRouteDetails";
import type { FinishedEvidence, FinishedState } from "../hooks/useFinishedToday";
import { buildWorkRows } from "../finishedPlan";

const unavailable = <span className="text-base-content/40" title="Not available in the saved plan">—</span>;
const PAGE_SIZE = 100;
type Filter = "all" | "queue" | "finished";
const rowShiftGroup = (lot: LotItem, allocation?: BoardShiftAllocation) =>
  lot.kind === "lot" && lot.passedGate ? "passed" : allocation?.status;

const shiftName = (allocation?: BoardShiftAllocation, lot?: LotItem | null) => {
  if (lot?.kind === "lot" && lot.passedGate) return "PASSED GATE · Already passed gate";
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
  savedPlanLots: LotItem[];
  search: string;
  allocations: ReadonlyMap<string, BoardShiftAllocation>;
  capacity?: CapacityDay;
  finished: FinishedState;
}

/** Keep the original queue design; all quantities come from the saved API snapshot. */
export function ApiWorkListTable({ planOrder, savedPlanLots, search, allocations, capacity, finished }: Props) {
  const [filter, setFilter] = useState<Filter>("queue");
  const [page, setPage] = useState(0);
  const [routeLot, setRouteLot] = useState<LotItem | null>(null);
  const query = search.trim().toLowerCase();
  const compactFinished = filter === "finished";
  const work = useMemo(() => buildWorkRows(planOrder, savedPlanLots, finished.rows), [planOrder, savedPlanLots, finished.rows]);
  const display = work[filter].filter(row => !query || [row.lot?.product, row.lot?.label, row.evidence?.product, row.evidence?.lotNo]
    .some(value => value?.toLowerCase().includes(query)));
  const summary = useMemo(() => summarizeActivePlan(planOrder, capacity?.capacityMin), [planOrder, capacity?.capacityMin]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(display.length / PAGE_SIZE) - 1));
  const visible = display.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const routing = useLotRouting(visible.flatMap(row => row.lot ? [row.lot] : []));
  const pendingCount = work.queue.filter(row => row.lot?.kind === "lot").length;
  const allLotCount = work.all.filter(row => !row.lot || row.lot.kind === "lot").length;
  const countAvailable = !finished.loading && !finished.error;
  const finishedCount = countAvailable ? finished.rows.length : "—";

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/45 px-3 py-2">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-base-200 p-1">
        {([['all', `All lots (${countAvailable ? allLotCount : "—"})`], ['queue', `In queue (${pendingCount})`], ['finished', `Finished today (${finishedCount})`]] as const).map(([value, text]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${filter === value ? "bg-base-100 text-[#316be8] shadow-2xs" : "text-base-content/65 hover:text-base-content"}`}>{text}</button>)}
        {summary.needs > 0 && <span className="px-2 text-xs text-base-content/60">+ {summary.needs} requirements / no ID</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/70 tabular-nums">
        <span>Finished today: <b>{finishedCount} lots observed</b></span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-[#fdecb3] text-[#8a5a00]"><span className="h-2 w-2 rounded-xs bg-[#f59e0b]" />D/S —</span>
        <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold bg-[#e9e3fb] text-[#5a3fc0]"><span className="h-2 w-2 rounded-full bg-[#6d4fd8]" />N/S —</span>
      </div>
    </div>
    {filter === "all" && <p className="text-xs text-base-content/60">Finished quantities, plan minutes and shift allocation are from the saved plan. They are not actual passed quantity or runtime. Unplanned or ambiguous matches have no plan values.</p>}
    <div className="text-xs text-base-content/60" role={finished.error ? "alert" : "status"}>
      {finished.loading ? "Loading next-gate SCAN IN evidence…"
        : finished.error ? <>{finished.error} <button type="button" className="link" onClick={finished.reload}>Retry finished</button></>
        : <>Finished = SCAN IN at the next gate, using its in_date calendar day. Latest WIP evidence only; not a complete scan history.
          {finished.unresolved > 0 && <span> Some scans have unresolved routing or category and are excluded from the corresponding totals.</span>}
          <button type="button" className="link ml-2" onClick={finished.reload}>Refresh finished</button></>}
    </div>
    <div className="overflow-x-auto rounded-xl border border-base-300">
      <table className={`w-full ${compactFinished ? "min-w-[620px]" : "min-w-[980px]"} table-fixed text-sm text-base-content tabular-nums`}>
        <colgroup>{(compactFinished ? [7, 28, 18, 35, 12] : [5.5, 12.5, 9.5, 8.5, 8.5, 17, 7.5, 7.5, 13.5, 10]).map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr className="whitespace-nowrap bg-slate-100 border-b border-base-300 text-[11px] font-extrabold tracking-wide text-slate-700 uppercase">
          {[['NO', ''], ['PRODUCT', 'Lot No'], ['STATUS', filter === "queue" ? 'at save' : 'scan evidence / saved'], ['SHEET', '/ lot · plan'], ['PCS', '/ lot · plan'], ['ROUTE · WHERE NOW', 'latest WIP'], ['PLAN', '(Lot)'], ['PLAN', '(min)'], ['CAPACITY USED', 'planned'], ['ORDER', '']].map((column, index) => ({ column, index })).filter(({ index }) => !compactFinished || ![3, 4, 7, 8, 9].includes(index)).map(({ column: [title, sub], index }) =>
            <th key={index} scope="col" className={`px-2.5 py-2.5 border-r border-base-300 ${[3, 4, 7].includes(index) ? 'text-right' : index === 1 ? 'text-left' : 'text-center'}`}>
              <div>{title}</div>{sub && <div className="text-[10px] font-semibold normal-case text-slate-500">{sub}</div>}
            </th>)}
        </tr></thead>
        <tbody>
          <>
            {filter !== "finished" &&
            <tr className="h-10 bg-slate-50 border-b border-base-300 text-xs">
              <td colSpan={3} className="px-3 font-extrabold uppercase tracking-wider text-slate-700 border-r border-base-200">SAVED PLAN SUMMARY</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200">{formatGateQuantity(summary.sheets, "sheet")}</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200">{formatGateQuantity(summary.pcs, "piece")}</td>
              <td className="text-center border-r border-base-200">{unavailable}</td>
              <td className="text-center font-extrabold border-r border-base-200">{summary.lotCount}</td>
              <td className="px-2.5 text-right font-bold border-r border-base-200" title="Saved daily planning load; not remaining runtime">{summary.totalLoad === null ? unavailable : summary.totalLoad.toLocaleString()}</td>
              <td className="px-3 border-r border-base-200"><CapacityBar pct={summary.pct} /></td>
              <td className="text-center">{unavailable}</td>
            </tr>}
            {visible.map((row, index) => {
              if (!row.lot && row.evidence) return <OutsidePlanFinishedRow key={row.key} record={row.evidence} sequence={row.sequence} ambiguous={row.matchStatus === "ambiguous"} compactFinished={compactFinished} />;
              if (!row.lot) return null;
              const { lot, sequence } = row;
              const allocation = allocations.get(lot.id);
              const group = rowShiftGroup(lot, allocation);
              const day = group === "day";
              const night = group === "night" || group === "split";
              const color = day ? "#f59e0b" : night ? "#6d4fd8" : "#94a3b8";
              const previous = visible[index - 1];
              const showSection = !compactFinished && (!previous?.lot || rowShiftGroup(previous.lot, allocations.get(previous.lot.id)) !== group);
              return <QueueRow key={lot.id} lot={lot} sequence={sequence} color={color} showSection={showSection}
                section={shiftName(allocation, lot)} sectionClass={day ? "bg-[#fef3c7] text-[#8a5a00] border-[#f5c542]" : night ? "bg-[#e9e3fb] text-[#5a3fc0] border-[#c4b5fd]" : "bg-base-200/70 text-base-content/60 border-base-300"}
                compactFinished={compactFinished} evidence={row.evidence} allocation={allocation} route={routing.routes.get(lot.id)} routeLoading={routing.loading}
                routeUnavailable={Boolean(routing.error)} onRoute={() => setRouteLot(lot)} />;
            })}
            {!display.length && <tr><td colSpan={compactFinished ? 5 : 10} className="py-10 text-center text-base-content/50">{filter === "finished" ? countAvailable ? "No next-gate SCAN IN evidence found for this gate and date in latest WIP." : "Finished today is not available yet." : query ? "No lots match your search." : "No pending saved arrivals for this gate and day."}</td></tr>}
          </>
        </tbody>
      </table>
    </div>
    {display.length > PAGE_SIZE && <div className="flex justify-end items-center gap-3 text-xs">
      <span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, display.length)} of {display.length}</span>
      <button type="button" className="btn btn-sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <button type="button" className="btn btn-sm" disabled={(currentPage + 1) * PAGE_SIZE >= display.length} onClick={() => setPage(currentPage + 1)}>Next</button>
    </div>}
    {routeLot && <LiveRouteDetails lot={routeLot} route={routing.routes.get(routeLot.id)} loading={routing.loading} error={routing.error} checkedAt={routing.checkedAt} retry={routing.retry} onClose={() => setRouteLot(null)} />}
  </div>;
}

function OutsidePlanFinishedRow({ record, sequence, ambiguous, compactFinished }: { record: FinishedEvidence; sequence: number; ambiguous: boolean; compactFinished: boolean }) {
  return <tr data-finished-row className="h-14 border-b border-base-300 bg-base-200/25" style={{ boxShadow: "inset 4px 0 0 #94a3b8" }}>
    <td className="px-2 text-center border-r border-base-200"><div className="inline-flex items-center gap-1"><Check size={13} className="text-base-content/40" /><span className="text-xs font-bold">{sequence}</span></div></td>
    <td className="px-3 py-1.5 border-r border-base-200"><div className="font-bold text-sm break-words">{record.product}</div><div className="text-xs text-base-content/55">{record.lotNo}</div></td>
    <td className="px-2.5 text-center border-r border-base-200"><span className="rounded-md bg-base-200 px-2.5 py-0.5 text-xs font-bold text-base-content/70">Finished</span><div className="mt-1 text-[11px] tabular-nums" title={`Next gate SCAN IN: ${record.scannedAt}`}>{record.scannedAt.slice(11, 19)}</div></td>
    {!compactFinished && <><td className="px-2.5 text-right border-r border-base-200">{unavailable}</td>
    <td className="px-2.5 text-right border-r border-base-200">{unavailable}</td></>}
    <td className="px-3 text-center border-r border-base-200"><div className="text-xs font-bold">{record.gate} → {record.nextGate}</div><div className="text-[11px] text-base-content/60">SCAN IN · {record.currentProcess || record.nextGate}</div></td>
    <td className="px-2.5 text-center text-[10px] text-base-content/55 border-r border-base-200" title="No unique saved plan row is available">{ambiguous ? "Multiple plans" : "Unplanned"}</td>
    {!compactFinished && <><td className="px-2.5 text-center border-r border-base-200">{unavailable}</td>
    <td className="px-3 border-r border-base-200">{unavailable}</td>
    <td className="px-2.5 text-center">{unavailable}</td></>}
  </tr>;
}

function PlannedAllocation({ allocation }: { allocation?: BoardShiftAllocation }) {
  return <div title={allocation?.reason ?? "Saved plan allocation; not actual utilization"}>
    {allocation && !["none", "unassigned"].includes(allocation.status) ? <div className="py-1.5 text-[11px] font-semibold tabular-nums leading-5">
      <div className="text-[#8a5a00]">D/S {allocation.dayMin.toLocaleString()}m</div>
      <div className="text-[#5a3fc0]">N/S {allocation.nightMin.toLocaleString()}m</div>
      {allocation.overflowMin > 0 && <div className="text-rose-600">Over {allocation.overflowMin.toLocaleString()}m</div>}
    </div> : unavailable}
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

function QueueRow({ lot, sequence, color, showSection, section, sectionClass, allocation, route, routeLoading, routeUnavailable, evidence, compactFinished, onRoute }: {
  lot: LotItem; sequence: number; color: string; showSection: boolean; section: string;
  sectionClass: string; allocation?: BoardShiftAllocation; route?: LotRouting;
  routeLoading: boolean; routeUnavailable: boolean; onRoute: () => void;
  evidence?: FinishedEvidence;
  compactFinished: boolean;
}) {
  return <>
    {showSection && <tr className={`h-9 border-y ${sectionClass}`}><td colSpan={compactFinished ? 5 : 10} className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider"><span className="inline-block h-2.5 w-2.5 mr-2 rounded-xs" style={{ backgroundColor: color }} />{section}</td></tr>}
    <tr data-plan-row={!evidence ? true : undefined} data-finished-row={evidence ? true : undefined} className="h-14 border-b border-base-300 bg-base-100 hover:bg-base-200/60" style={{ boxShadow: `inset 4px 0 0 ${color}` }}>
      <td className="px-2 text-center border-r border-base-200"><div className="inline-flex gap-1 items-center">{evidence ? <Check size={13} className="text-base-content/40" /> : <GripVertical size={14} className="text-base-content/15" />}<span className="w-5 text-xs font-extrabold">{sequence}</span></div></td>
      <td className="px-3 py-1.5 border-r border-base-200"><div className="font-bold text-sm break-words">{lot.product}</div><div className="mt-0.5 text-xs font-semibold text-base-content/55">{lot.kind === "unidentified" ? "No lot identity" : lot.label}</div>{evidence && <div className="text-[10px] text-base-content/50">Plan: {lot.plannedDate}</div>}</td>
      <td className="px-2.5 text-center border-r border-base-200"><span title={evidence ? `Next gate SCAN IN: ${evidence.scannedAt}` : "Status captured when this plan was saved"} className={`inline-flex rounded-md px-2.5 py-0.5 text-xs font-bold ${evidence || lot.passedGate ? "bg-base-200 text-base-content/70" : lot.isHold ? "bg-[#fdecb3] text-[#8a5a00]" : lot.gateState === "in_gate" ? "bg-[#316be8] text-white" : "bg-base-200 text-base-content/70"}`}>{evidence ? "Finished" : lot.passedGate ? "Passed gate" : planStatus(lot)}</span>{evidence && <div className="mt-1 text-[11px] tabular-nums">{evidence.scannedAt.slice(11, 19)}</div>}</td>
    {!compactFinished && <><td className="px-2.5 text-right font-bold text-xs border-r border-base-200">{formatGateQuantity(lot.sheets, "sheet")}</td>
      <td className="px-2.5 text-right font-bold text-xs border-r border-base-200">{formatGateQuantity(lot.qty, "piece")}</td></>}
      <td className="px-3 text-center border-r border-base-200"><button type="button" onClick={onRoute} title="Inspect routing and current WIP" className="inline-flex max-w-full items-center gap-2 rounded-full border border-base-300/80 bg-base-100 px-3 py-1 hover:border-[#316be8]/50 text-xs"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${route?.status === "matched" ? "bg-[#316be8]" : "bg-base-300"}`} /><span className="truncate">{routeLoading ? "Loading…" : routeUnavailable ? "Routing unavailable" : route?.status === "matched" ? route.current?.process || route.current?.gate || "Details" : "Position unconfirmed"}</span></button></td>
      <td className="px-2.5 text-center font-extrabold text-xs border-r border-base-200">{lot.kind === "lot" ? 1 : unavailable}</td>
      {!compactFinished && <><td className="px-2.5 text-right text-xs font-bold border-r border-base-200" title="Saved daily planning load; not runtime or ETA">{lot.kind === "lot" && lot.loadMin !== null ? lot.loadMin.toLocaleString() : unavailable}</td>
      <td className="px-3 border-r border-base-200" title={allocation?.reason ?? "Planned allocation from saved capacity; not actual utilization"}>
        <PlannedAllocation allocation={allocation} />
      </td>
      <td className="px-2 text-center"><div className="inline-flex gap-1">{[{ Icon: ArrowUp, title: 'Move up' }, { Icon: ArrowDown, title: 'Move down' }, { Icon: ArrowUpToLine, title: 'Move to top' }].map(({ Icon, title }) =>
        <button key={title} type="button" disabled title={`${title}: Save order is not connected`} className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-base-300 bg-base-100 text-base-content/80 disabled:opacity-30"><Icon size={13} /></button>)}</div></td></>}
    </tr>
  </>;
}
