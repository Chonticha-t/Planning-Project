import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import "../../Planning_Summary_Gate/gateTheme.css";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { allocateBoardShifts } from "../../Capacity_Leveling/utils/boardShiftAllocation";
import type { CountUnit, InGateCategory, InGateView, WorkMode } from "../types";
import { InGateHeader } from "./InGateHeader";
import { useSavedPlan } from "../hooks/useSavedPlan";
import { useFinishedToday } from "../hooks/useFinishedToday";
import { useMonthlyOutput } from "../hooks/useMonthlyOutput";
import { observedTotals } from "../monthlyOutput";
import { planStatus, savedPlanGates, savedPlanRows } from "../savedPlan";
import { ApiWorkListTable } from "./ApiWorkListTable";
import { ApiMonthlySummary } from "./ApiMonthlySummary";
import { HistoryPanel } from "./HistoryPanel";

const CATEGORIES: InGateCategory[] = ["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"];

export default function SavedPlanPage() {
  const [params, setParams] = useSearchParams();
  const rawCategory = params.get("cat") ?? (params.get("group") === "SMT" ? "SMT" : "EFPC_AUTO");
  const category = CATEGORIES.includes(rawCategory as InGateCategory) ? rawCategory as InGateCategory : "EFPC_AUTO";
  const today = dayjs().format("YYYY-MM-DD");
  const [date, setDate] = useState(today);
  const [selectedGate, setSelectedGate] = useState("FVAC");
  const [month, setMonth] = useState(today.slice(0, 7));
  const view: InGateView = params.get("view") === "month" ? "month" : "day";
  const [workMode, setWorkMode] = useState<WorkMode>("edit");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [unit, setUnit] = useState<CountUnit>("lots");
  const [search, setSearch] = useState("");
  const [tvMode, setTvMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { saved, loading, error, reload } = useSavedPlan();
  const finished = useFinishedToday(date, view === "day");
  const monthly = useMonthlyOutput(month, category, search, view === "month");
  const savedPlanLots = useMemo(() => saved ? savedPlanRows(saved.snapshot, "ALL") : [], [saved]);
  const rows = useMemo(() => saved ? savedPlanRows(saved.snapshot, category) : [], [saved, category]);
  const allocations = useMemo(() => saved ? allocateBoardShifts(saved.snapshot, rows) : new Map(), [saved, rows]);
  const gates = useMemo(() => [...new Set([
    ...(saved ? savedPlanGates(saved.snapshot, category).map(item => item.gate) : []),
    ...(view === "month" ? monthly.data?.rows.map(row => row.gate) ?? [] : []),
  ])].map(gate => ({ gate })), [saved, category, view, monthly.data]);
  const gate = gates.find(item => item.gate === selectedGate)?.gate ?? gates[0]?.gate ?? "";
  const finishedRows = useMemo(() => finished.rows.filter(row => row.gate === gate && (category === "ALL" || row.processGroup === category)), [finished.rows, gate, category]);
  const gateRows = useMemo(() => rows.filter(row => row.gate === gate), [rows, gate]);
  const dayRows = useMemo(() => rows.filter(row => view === "month" ? row.plannedDate.startsWith(`${month}-`) : row.plannedDate === date), [rows, date, month, view]);
  const scheduledDates = useMemo(() => [...new Set(gateRows.map(row => row.plannedDate))].sort(), [gateRows]);
  const queue = useMemo(() => dayRows.filter(row => row.gate === gate).map((lot, index) => ({ lot, sequence: index + 1 })), [dayRows, gate]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return queue.filter(({ lot }) => !query || [lot.label, lot.product, lot.item].some(value => value?.toLowerCase().includes(query)));
  }, [queue, search]);

  const changeCategory = (nextCategory: InGateCategory) => {
    const next = new URLSearchParams(params);
    next.delete("group");
    next.set("cat", nextCategory);
    setParams(next, { replace: true });
  };
  const changeView = (nextView: InGateView) => {
    const next = new URLSearchParams(params);
    if (nextView === "month") next.set("view", "month");
    else next.delete("view");
    setParams(next, { replace: true });
  };
  const countText = (gateName: string) => {
    const query = search.trim().toLowerCase();
    const items = dayRows.filter(row => row.gate === gateName && (view !== "month" || !query
      || row.product.toLowerCase().includes(query) || row.label.toLowerCase().includes(query)));
    const needs = items.filter(row => row.kind === "need").length;
    const unknown = items.filter(row => row.kind === "unidentified").length;
    const value = unit === "lots" ? items.filter(row => row.kind === "lot").length
      : items.reduce<number | null>((total, row) => {
        const amount = unit === "pcs" ? row.qty : row.sheets;
        return total === null || amount === null ? null : total + amount;
      }, 0);
    const planned = `${formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet")} ${unit}${needs ? ` · ${needs} need` : ""}${unknown ? ` · ${unknown} no ID` : ""}`;
    if (view !== "month") return planned;
    const observed = monthly.data?.rows.filter(row => row.gate === gateName) ?? [];
    const amount = observedTotals(observed, unit).total;
    return `${observed.length ? formatGateQuantity(amount, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet") : "—"} observed · ${saved ? planned : "—"} planned`;
  };
  const exportPlan = async () => {
    if (!saved || loading || error || exporting || !visible.length) return;
    setExporting(true);
    try {
      await exportToExcel({
        fileName: `InGate_Plan_v${saved.plan.version}_${gate}_${view === "month" ? month : date}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
        data: visible.map(({ lot, sequence }) => ({
          planId: saved.plan.planId, version: saved.plan.version, savedAt: saved.plan.savedAt,
          savedBy: saved.plan.savedBy, sequence, gate, plannedDate: lot.plannedDate,
          product: lot.product, lot: lot.kind === "unidentified" ? "No lot identity" : lot.label, kind: lot.kind, pcs: lot.qty ?? "N/A",
          sheets: lot.sheets === null ? "N/A" : Math.ceil(lot.sheets),
          mustOut: lot.mustOut, capturedStatus: planStatus(lot),
        })),
        columns: [
          { header: "Plan ID", key: "planId", width: 38 },
          { header: "Version", key: "version", width: 10 },
          { header: "Saved at", key: "savedAt", width: 22 },
          { header: "Saved by", key: "savedBy", width: 20 },
          { header: "Plan order", key: "sequence", width: 12 },
          { header: "Gate", key: "gate", width: 12 },
          { header: "Planned arrival", key: "plannedDate", width: 18 },
          { header: "Product", key: "product", width: 25 },
          { header: "Lot / Need WIP", key: "lot", width: 24 },
          { header: "Type", key: "kind", width: 16 },
          { header: "Pcs", key: "pcs", width: 14 },
          { header: "Sheets", key: "sheets", width: 14 },
          { header: "Source must out", key: "mustOut", width: 18 },
          { header: "Status at save", key: "capturedStatus", width: 22 },
        ],
      });
    } catch {
      toast.error("Unable to export the saved plan. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return <div className={`planning-summary-gate flex flex-col gap-4 w-full ${tvMode ? "fixed inset-0 z-[100] overflow-y-auto bg-base-200 p-4 sm:p-6" : ""}`}>
    <InGateHeader snapshotOnly busy={loading || exporting || monthly.loading} exportDisabled={!saved || Boolean(error) || !visible.length}
      monthStatus={monthly.loading ? "Loading observed output…" : monthly.error ? "Observed output unavailable" : "Saved arrivals · Observed gate output"}
      view={view} onViewChange={changeView} month={month} thisMonth={today.slice(0, 7)} onMonthChange={setMonth}
      unit={unit} onUnitChange={setUnit} category={category} onCategoryChange={changeCategory}
      date={date} todayStr={today} onDateChange={setDate} orderBy="plan" onOrderByChange={() => {}}
      search={search} onSearchChange={setSearch} onExcel={() => void exportPlan()} onRefresh={() => { void reload(); finished.reload(); monthly.reload(); }}
      workMode={workMode} onWorkModeChange={setWorkMode} tvMode={tvMode} onTvModeChange={setTvMode} />
    {loading && view === "day" ? <div role="status" className="p-8 text-center">Loading saved plan…</div>
      : error && view === "day" ? <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-5">
        <p>{error}</p><button type="button" className="btn btn-sm mt-3" onClick={() => void reload()}>Retry</button>
      </div>
      : !saved && view === "day" ? <div role="status" className="rounded-xl bg-base-100 border border-base-300 p-8 text-center">
        No saved plan yet. Save a plan in Capacity Leveling, then refresh this page.
      </div>
      : <>
        {view === "month" && (loading || error || !saved) && <div role={error ? "alert" : "status"} className="rounded-xl border border-base-300 bg-base-100 p-3 text-sm">
          {loading ? "Loading saved arrivals…" : error ? "Saved arrivals are unavailable. Observed output can still be viewed." : "No saved plan available. Showing observed output only."}
          {error && <button type="button" className="btn btn-xs ml-2" onClick={() => void reload()}>Retry plan</button>}
        </div>}
        <div className="rounded-2xl bg-base-100 border border-base-300 shadow-xs overflow-visible">
          <div role="group" aria-label="Gate" className="flex overflow-x-auto gap-1 px-4 pt-3 rounded-t-2xl bg-[#316be8]">
            {gates.map(item => <button key={item.gate} type="button" aria-pressed={gate === item.gate}
              onClick={() => setSelectedGate(item.gate)}
              className={`shrink-0 rounded-t-lg px-5 py-2 text-left ${gate === item.gate ? "bg-base-100 text-[#316be8]" : "text-white hover:bg-white/10"}`}>
              <div className="text-sm font-bold">{item.gate}</div><div className="text-xs">{countText(item.gate)}</div>
            </button>)}
          </div>
          {view === "month" ? <ApiMonthlySummary key={JSON.stringify([saved?.plan.planId, category, gate, month, search])} rows={gateRows} snapshot={saved?.snapshot} month={month} today={today} unit={unit} search={search} version={saved?.plan.version} gate={gate} category={category} output={monthly} /> : saved ?
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-sm font-extrabold uppercase tracking-wider mr-1">Queue</h2>
                <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold text-base-content/75">Finished {finished.loading || finished.error ? "—" : finishedRows.length} lots observed · {countText(gate)} planned</span>
                {queue.some(({ lot }) => lot.isHold) && <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold">{queue.filter(({ lot }) => lot.isHold).length} HOLD at save</span>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {workMode === "edit" && <button type="button" disabled title="Save order is not connected yet" className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold flex items-center gap-1.5"><Plus size={13} className="rotate-45 text-[#316be8]" />+ Auto-arrange</button>}
                  <button type="button" onClick={() => setHistoryOpen(true)} className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content/80">History</button>
                  {workMode === "edit" && <><button type="button" disabled className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold">Undo</button><button type="button" disabled title="Save order is not connected yet" className="btn btn-xs h-8 rounded-lg btn-primary px-4 text-xs font-bold shadow-xs">Save order</button></>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/55">
                <strong className="text-base-content/75">Plan v{saved.plan.version}</strong><span>{saved.plan.savedAt} · {saved.plan.savedBy}</span>
                <span>Status at save · Finished from next-gate SCAN IN · ETA unavailable</span>
                {scheduledDates.length > 0 && <select aria-label="Scheduled day" className="select select-xs select-bordered ml-auto" value={scheduledDates.includes(date) ? date : ""} onChange={event => event.target.value && setDate(event.target.value)}><option value="" disabled>Select a planned day</option>{scheduledDates.map(day => <option key={day} value={day}>{day}</option>)}</select>}
              </div>
              {(saved.snapshot.undatedArrivalCount > 0 || saved.snapshot.orphanMoves.length > 0) && <p className="text-xs text-warning">Some arrivals have missing dates or unmatched overrides. Review this plan in Capacity Leveling.</p>}
              <ApiWorkListTable key={JSON.stringify([saved.plan.planId, category, gate, date, search])} planOrder={queue.map(({ lot }) => lot)} savedPlanLots={savedPlanLots} search={search} allocations={allocations} capacity={saved.snapshot.capacity?.[gate]?.[date]} finished={{ ...finished, rows: finishedRows, unresolved: finished.unresolved + finished.rows.filter(row => row.processGroup === null).length }} />
            </div> : null}
        </div>
        {saved && <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title={`${gate} · ${date}`} entries={[]} pending={null}
          snapshotLots={queue.map(({ lot }) => lot)} plan={{ version: saved.plan.version, savedAt: saved.plan.savedAt, savedBy: saved.plan.savedBy, reason: saved.plan.note ?? undefined, sourceCategory: category }} />}
      </>}
  </div>;
}
