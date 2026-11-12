import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Eye, History, RefreshCw, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { deletePlanVersion, fetchPlanHistory, fetchPlanHistoryDetail, toApiFailure } from "../hooks/api";
import type { PlanHistoryDetail, PlanHistoryInfo } from "../types";

const cardLabel = (id: string) => {
  try {
    const parts: unknown = JSON.parse(id);
    if (Array.isArray(parts) && typeof parts[3] === "string") {
      return parts[2] === "lot" ? parts[3] : `${parts[2] === "need" ? "Need WIP" : "Unidentified work"} · ${parts[3]}`;
    }
  } catch { /* Older identities are displayed as saved. */ }
  return id;
};

interface Props {
  onClose: () => void;
}

export const PlanHistoryModal: React.FC<Props> = ({ onClose }) => {
  const { requireAdmin } = useAuth();
  const [plans, setPlans] = useState<PlanHistoryInfo[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PlanHistoryInfo | null>(null);
  const [detail, setDetail] = useState<PlanHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [confirm, setConfirm] = useState<PlanHistoryInfo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const listRequest = useRef<AbortController | null>(null);
  const deleteLock = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const loadHistory = useCallback(async (before?: number) => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPlanHistory(before, controller.signal);
      if (controller.signal.aborted) return;
      setPlans((previous) => before ? [...previous, ...page.plans] : page.plans);
      setNextBefore(page.nextBefore);
    } catch (failure) {
      if (!controller.signal.aborted) setError(toApiFailure(failure).message);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    return () => listRequest.current?.abort();
  }, [loadHistory]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    void fetchPlanHistoryDetail(selected.planId, controller.signal).then((next) => {
      if (!controller.signal.aborted) setDetail(next);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setDetailError(toApiFailure(failure).message);
    }).finally(() => {
      if (!controller.signal.aborted) setDetailLoading(false);
    });
    return () => controller.abort();
  }, [selected, detailAttempt]);

  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);

  useEffect(() => {
    if (!deleting) (confirm ? cancelRef.current : closeRef.current)?.focus();
  }, [selected, confirm, deleting]);

  const close = () => {
    if (!deleteLock.current) onClose();
  };

  const handleKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (!deleteLock.current) {
        if (confirm) setConfirm(null);
        else if (selected) setSelected(null);
        else onClose();
      }
    }
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), summary, [tabindex="0"]'
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const handleDelete = async () => {
    if (!confirm || deleteLock.current) return;
    const target = confirm;
    deleteLock.current = true;
    setDeleting(true);
    try {
      if (!await requireAdmin()) return;
      await deletePlanVersion(target.planId);
      setConfirm(null);
      setPlans((previous) => previous.filter((plan) => plan.planId !== target.planId));
      toast.success(`Plan v${target.version} removed from history`);
      await loadHistory();
    } catch (failure) {
      const failed = toApiFailure(failure);
      toast.error(failed.message);
      if (failed.code === "PLAN_NOT_FOUND" || failed.code === "ACTIVE_PLAN") {
        setConfirm(null);
        await loadHistory();
      }
    } finally {
      deleteLock.current = false;
      setDeleting(false);
    }
  };

  const button = "btn btn-sm rounded-lg normal-case";

  return createPortal(
    <div className="planning-summary-gate fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 p-3 sm:p-6" onClick={close}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="plan-history-title"
        onClick={(event) => event.stopPropagation()} onKeyDown={handleKey}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-base-300 bg-base-200/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <History size={22} className="text-primary" />
            <div>
              <h2 id="plan-history-title" className="text-base font-bold">Plan History{selected ? ` · v${selected.version}` : ""}</h2>
              <p className="text-xs text-base-content/60">Capacity Leveling · All process groups</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={close} disabled={deleting} className={`${button} btn-ghost btn-square`} aria-label="Close plan history"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {confirm ? (
            <div role="alert" className="mx-auto max-w-lg space-y-4 rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-950">
              <h3 className="font-bold">Delete Plan v{confirm.version}?</h3>
              <p className="text-sm">This version will be removed from history. The active plan will stay unchanged.</p>
              <p className="text-xs">Saved by {confirm.savedBy} · {confirm.savedAt}</p>
              {confirm.note && <p className="break-words text-sm">{confirm.note}</p>}
              <div className="flex justify-end gap-2">
                <button ref={cancelRef} type="button" disabled={deleting} onClick={() => setConfirm(null)} className={`${button} bg-base-100`}>Cancel</button>
                <button type="button" disabled={deleting} onClick={() => void handleDelete()} className={`${button} btn-error`}>
                  {deleting ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={14} />} Delete v{confirm.version}
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="space-y-4">
              <button type="button" onClick={() => setSelected(null)} className={`${button} btn-ghost`}><ArrowLeft size={15} /> Back to versions</button>
              {detailLoading && <p role="status" className="py-8 text-center text-sm">Loading plan details…</p>}
              {detailError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                {detailError}<button type="button" className={`${button} btn-ghost ml-2`} onClick={() => setDetailAttempt((value) => value + 1)}>Retry</button>
              </div>}
              {detail && <>
                <div className="space-y-2 rounded-xl border border-base-300 bg-base-200/40 p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><strong>Plan v{detail.plan.version}</strong>{detail.plan.isActive && <span className="badge badge-primary badge-sm">Active</span>}</div>
                  <p>Saved by {detail.plan.savedBy} · {detail.plan.savedAt}</p>
                  <p className="whitespace-pre-wrap break-words">{detail.plan.note || "No note"}</p>
                </div>
                <p className="text-xs text-base-content/60">Saved date overrides and card order. Viewing this version keeps the active plan unchanged.</p>
                <section>
                  <h3 className="mb-2 text-sm font-bold">Saved date overrides ({detail.moves.length})</h3>
                  <div className="overflow-x-auto rounded-xl border border-base-300">
                    <table className="table table-sm">
                      <thead><tr><th>Gate</th><th>Product</th><th>Lot / Work</th><th>Source arrival</th><th>Planned arrival</th></tr></thead>
                      <tbody>{detail.moves.map((move) => <tr key={`${move.workKey}|${move.gate}`}>
                        <td>{move.gate}</td><td>{move.prdName || "—"}</td><td className="max-w-56 break-all">{move.lotNo || move.workKey}</td><td className="whitespace-nowrap">{move.originalDate}</td><td className="whitespace-nowrap font-semibold">{move.plannedDate}</td>
                      </tr>)}{detail.moves.length === 0 && <tr><td colSpan={5} className="text-center text-base-content/60">No saved date overrides.</td></tr>}</tbody>
                    </table>
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-bold">Saved card order ({detail.boardCardOrder.length} gate/day groups)</h3>
                  {detail.boardCardOrder.length === 0 && <p className="text-sm text-base-content/60">No saved card order.</p>}
                  <div className="space-y-2">{detail.boardCardOrder.map((group) => <details key={`${group.gate}|${group.date}`} className="rounded-xl border border-base-300 p-3">
                    <summary className="cursor-pointer text-sm font-semibold">{group.gate} · {group.date} · {group.cardIds.length} cards</summary>
                    <ol className="mt-2 list-decimal space-y-1 pl-6 text-xs">{group.cardIds.map((id) => <li key={id} className="break-all" title={id}>{cardLabel(id)}</li>)}</ol>
                  </details>)}</div>
                </section>
              </>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-base-content/60">Newest first · Only older versions can be deleted.</p>
                <button type="button" disabled={loading} onClick={() => void loadHistory()} className={`${button} btn-ghost`} aria-label="Refresh plan history"><RefreshCw size={15} /> Refresh</button>
              </div>
              {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">{error}</div>}
              <div className="overflow-x-auto rounded-xl border border-base-300">
                <table className="table table-sm">
                  <thead><tr><th>Version</th><th>Saved at</th><th>Saved by</th><th>Note</th><th>Actions</th></tr></thead>
                  <tbody>{plans.map((plan) => <tr key={plan.planId}>
                    <td className="whitespace-nowrap"><strong>v{plan.version}</strong>{plan.isActive && <span className="badge badge-primary badge-sm ml-2">Active</span>}</td>
                    <td className="whitespace-nowrap">{plan.savedAt}</td><td>{plan.savedBy}</td><td className="max-w-64 whitespace-pre-wrap break-words">{plan.note || "—"}</td>
                    <td><div className="flex gap-1">
                      <button type="button" onClick={() => setSelected(plan)} className={`${button} btn-ghost`} aria-label={`View Plan v${plan.version}`}><Eye size={14} /> View</button>
                      {!plan.isActive && <button type="button" onClick={() => setConfirm(plan)} className={`${button} btn-ghost text-error`} aria-label={`Delete Plan v${plan.version}`}><Trash2 size={14} /> Delete</button>}
                    </div></td>
                  </tr>)}{!loading && !error && plans.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-base-content/60">No saved plans yet.</td></tr>}</tbody>
                </table>
              </div>
              {loading && <p role="status" className="py-4 text-center text-sm">Loading history…</p>}
              {nextBefore !== null && <div className="text-center"><button type="button" disabled={loading} onClick={() => void loadHistory(nextBefore)} className={`${button} btn-outline`}>Load older versions</button></div>}
            </div>
          )}
        </div>
      </div>
    </div>, document.body
  );
};
