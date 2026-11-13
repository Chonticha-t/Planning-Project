import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { X } from "lucide-react";
import { getApiBaseUrl } from "@/utils/apiConfig";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { validateOutputLots, type OutputLot, type OutputSelection } from "../monthlyOutput";

export function ObservedLotDrawer({ selection, onClose }: { selection: OutputSelection; onClose: () => void }) {
  const [state, setState] = useState<{ rows: OutputLot[]; nextCursor: string | null; loading: boolean; error?: string }>({ rows: [], nextCursor: null, loading: true });
  const request = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLElement | null>(null);
  const close = useRef<HTMLButtonElement | null>(null);
  const load = useCallback(async (cursor?: string) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ ...previous, loading: true, error: undefined }));
    try {
      const response = await axios.get(`${getApiBaseUrl()}/capacity_leveling/routing/output/lots`, {
        params: { ...selection, cursor }, signal: controller.signal, timeout: 20000,
      });
      const page = validateOutputLots(response.data?.data, selection, cursor);
      if (!controller.signal.aborted) setState(previous => ({
        rows: cursor ? [...previous.rows, ...page.rows] : page.rows, nextCursor: page.nextCursor, loading: false,
      }));
    } catch {
      if (!controller.signal.aborted) setState(previous => ({ ...previous, loading: false, error: "Unable to load output lots. Please retry." }));
    } finally { if (request.current === controller) request.current = null; }
  }, [selection]);
  useEffect(() => {
    void load();
    return () => { request.current?.abort(); request.current = null; };
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
  const time = (row: OutputLot) => new Intl.DateTimeFormat("en-GB", {
    timeZone: row.timeZone, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(row.outAt));
  return createPortal(<div className="planning-summary-gate fixed inset-0 z-[120] flex justify-end" onKeyDown={event => {
    if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    if (event.key === "Tab") {
      const controls = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled), [href], [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <button type="button" tabIndex={-1} aria-label="Close output details backdrop" className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
    <aside ref={dialog} role="dialog" aria-modal="true" aria-labelledby="observed-output-title" className="relative h-full w-full max-w-4xl bg-base-100 border-l border-base-300 shadow-2xl overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h3 id="observed-output-title" className="font-bold">Observed output · {selection.gate} · {selection.date}</h3>
          <p className="text-xs text-base-content/60">{selection.product ?? "All matching products"} · Evidence time is the next gate's SCAN IN.</p></div>
        <button ref={close} type="button" className="btn btn-sm btn-ghost" aria-label="Close output details" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="table table-sm"><thead><tr><th>Product</th><th>Lot</th><th>Shift</th><th>Pcs</th><th>Sheets</th><th>Evidence time (local)</th><th>Next gate</th></tr></thead>
        <tbody>{state.rows.map(row => <tr key={row.id}><td>{row.product}</td><td>{row.lot}</td><td>{row.shift}</td><td>{formatGateQuantity(row.pcs, "piece")}</td><td>{formatGateQuantity(row.sheets, "sheet")}</td><td title={row.timeZone}>{time(row)}</td><td>{row.nextGate}</td></tr>)}</tbody>
      </table></div>
      {state.loading && <p role="status" className="p-6 text-center text-sm">Loading output lots…</p>}
      {state.error && <div role="alert" className="mt-3 text-sm text-error">{state.error}<button type="button" className="btn btn-sm btn-ghost ml-2" onClick={() => void load(state.nextCursor ?? undefined)}>Retry</button></div>}
      {!state.loading && !state.error && !state.rows.length && <p className="p-8 text-center text-sm text-base-content/60">No observed output for this selection. This does not confirm zero output.</p>}
      {state.nextCursor && !state.error && <button type="button" disabled={state.loading} className="btn btn-sm mt-4" onClick={() => void load(state.nextCursor ?? undefined)}>Load more lots</button>}
      <p className="mt-3 text-xs text-base-content/50">{state.rows.length.toLocaleString()} records shown · Saved plan membership does not limit this list.</p>
    </aside>
  </div>, document.body);
}
