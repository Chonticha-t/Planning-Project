import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { LotItem } from "../../Capacity_Leveling/types";
import { ROUTING_MESSAGES, type LotRouting } from "../hooks/useLotRouting";

interface Props {
  lot: LotItem; route?: LotRouting; loading: boolean; error?: string; checkedAt?: string;
  needsLogin: boolean; login: () => void; retry: () => void; onClose: () => void;
}

export function LiveRouteDetails({ lot, route, loading, error, checkedAt, needsLogin, login, retry, onClose }: Props) {
  const current = route?.status === "matched" ? route.current : null;
  const steps = route?.steps ?? [];
  const gates = [...new Set(steps.map(step => step.gate).filter((gate): gate is string => Boolean(gate)))];
  const index = current ? steps.findIndex(step => step.seq === current.seq) : -1;
  const start = Math.max(0, index - 30);
  return createPortal(<div className="planning-summary-gate fixed inset-0 z-[120] flex items-center justify-center p-4" onKeyDown={event => event.key === "Escape" && onClose()}>
    <button type="button" aria-label="Close route backdrop" className="absolute inset-0 bg-slate-900/20" onClick={onClose} />
    <div role="dialog" aria-modal="true" aria-label="Lot routing and current process" className="relative w-[420px] max-w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-4 text-base-content shadow-2xl">
      <div className="flex justify-between items-center gap-2 text-xs font-bold"><span>{lot.product} · {lot.label}</span><button autoFocus type="button" aria-label="Close gate route" onClick={onClose}><X size={16} /></button></div>
      {needsLogin ? <div className="mt-4 text-sm"><p>Sign in to view routing and current WIP.</p><button type="button" className="btn btn-sm btn-primary mt-2" onClick={login}>Sign in</button></div>
        : loading ? <p role="status" className="mt-4 text-sm">Loading routing and current WIP…</p>
        : error ? <div role="alert" className="mt-4 text-sm"><p>{error}</p><button type="button" className="btn btn-sm mt-2" onClick={retry}>Retry</button><button type="button" className="btn btn-sm mt-2 ml-2" onClick={login}>Sign in</button></div>
        : <>
          <div className="mt-3 flex flex-wrap justify-around gap-3 rounded-xl bg-base-200/40 p-3 text-xs font-bold">
            {gates.map(gate => <span key={gate} className={current?.gate === gate ? "text-[#316be8]" : gate === lot.gate ? "text-base-content" : "text-base-content/50"}>
              <span className={`block mx-auto mb-1 h-3 w-3 rounded-full ${current?.gate === gate ? "bg-[#316be8] ring-4 ring-blue-200" : "bg-base-300"}`} />{gate}
            </span>)}
          </div>
          {current ? <div className="mt-3 rounded-xl border border-[#316be8]/40 bg-[#e6f0fd]/60 p-3 text-xs">
            <strong>Current: {current.process || "—"}</strong><div>Gate: {current.gate || "—"}{current.stepInGate && current.totalInGate ? ` · Step ${current.stepInGate}/${current.totalInGate}` : ""}</div>
            {current.gate !== lot.gate && <p className="mt-1">The lot is currently outside the selected gate ({lot.gate}).</p>}
          </div> : <div role="status" className="mt-3 text-xs text-amber-700">
            {route?.observed?.process && <p className="font-bold mb-1">WIP process: {route.observed.process}</p>}
            {ROUTING_MESSAGES[route?.status ?? ""] ?? "The saved card represents multiple or unsupported identities. Current position cannot be confirmed."}
          </div>}
          <div className="mt-3 text-[11px] font-bold uppercase text-base-content/55">Process routing · Selected gate {lot.gate}</div>
          <ol className="mt-2 space-y-1.5">{steps.slice(start, start + 100).map(step => <li key={step.seq} data-current-process={current?.seq === step.seq ? "true" : undefined} className={`rounded-xl px-3 py-2 text-xs ${current?.seq === step.seq ? "border border-[#316be8]/40 bg-[#e6f0fd]/80" : "border border-base-200 bg-base-200/25"}`}>
            <div className="flex items-center gap-2"><span className={`h-2 w-2 shrink-0 rounded-full ${current?.seq === step.seq ? "bg-[#316be8] ring-2 ring-blue-200" : "bg-base-300"}`} /><strong>{step.process || step.processId || "Unnamed process"}</strong>{current?.seq === step.seq && <span className="ml-auto font-bold text-[#316be8]">Current</span>}</div>
            <div className="mt-1 text-base-content/55">Seq {step.seq} · {step.gate || "Unmapped gate"}{step.stepInGate && step.totalInGate ? ` · ${step.stepInGate}/${step.totalInGate}` : ""}</div>
          </li>)}</ol>
          {steps.length > 100 && <p className="mt-2 text-xs text-base-content/55">Showing routing positions {start + 1}–{Math.min(start + 100, steps.length)} of {steps.length}, around the current process when available.</p>}
          <dl className="grid grid-cols-2 gap-2 mt-4 text-xs"><dt>WIP source updated</dt><dd>{current?.updatedAt || route?.observed?.updatedAt || "Unavailable"}</dd><dt>Checked at</dt><dd>{checkedAt || "—"}</dd><dt>Saved planned arrival</dt><dd>{lot.plannedDate}</dd></dl>
          <p className="mt-3 text-xs text-base-content/50">WIP reflects its source refresh. Routing order does not confirm scan completion; scan times and ETA are unavailable.</p>
        </>}
    </div>
  </div>, document.body);
}
