import { useState } from "react";
import { Plus } from "lucide-react";
import "../../Planning_Summary_Gate/gateTheme.css";
import usePlanningInGate from "../hooks/usePlanningInGate";
import { InGateHeader } from "../components/InGateHeader";
import { ApiWorkListTable } from "../components/ApiWorkListTable";
import { ApiMonthlySummary } from "../components/ApiMonthlySummary";
import { HistoryPanel } from "../components/HistoryPanel";

const Planning_In_Gate = () => {
  const {
    today, category, view, date, setDate, month, setMonth, unit, setUnit, search, setSearch,
    workMode, setWorkMode, tvMode, setTvMode, exporting,
    saved, loading, error, reload, finished, monthly,
    gates, gate, setSelectedGate, gateRows, dayPlanLots, savedPlanLots, scheduledDates, queue, visible,
    allocations, finishedRows,
    changeCategory, changeView, countText, refresh, exportPlan,
  } = usePlanningInGate();
  const [historyOpen, setHistoryOpen] = useState(false);

  return <div className={`planning-summary-gate flex flex-col gap-4 w-full ${tvMode ? "fixed inset-0 z-[100] overflow-y-auto bg-base-200 p-4 sm:p-6" : ""}`}>
    <InGateHeader snapshotOnly busy={loading || exporting || finished.loading || monthly.loading} exportDisabled={!saved || Boolean(error) || !visible.length}
      monthStatus={monthly.loading ? "Loading observed output…" : monthly.error ? (monthly.data ? "Showing last checked output" : "Observed output unavailable") : "Saved arrivals · Observed gate output"}
      view={view} onViewChange={changeView} month={month} thisMonth={today.slice(0, 7)} onMonthChange={setMonth}
      unit={unit} onUnitChange={setUnit} category={category} onCategoryChange={changeCategory}
      date={date} todayStr={today} onDateChange={setDate} orderBy="plan" onOrderByChange={() => {}}
      search={search} onSearchChange={setSearch} onExcel={() => void exportPlan()} onRefresh={refresh}
      workMode={workMode} onWorkModeChange={setWorkMode} tvMode={tvMode} onTvModeChange={setTvMode} />
    {saved && error && <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
      {error} Showing the last loaded plan. <button type="button" className="btn btn-xs ml-2" onClick={reload}>Retry plan</button>
    </div>}
    {!saved && loading && view === "day" ? <div role="status" className="p-8 text-center">Loading saved plan…</div>
      : !saved && error && view === "day" ? <div role="alert" className="rounded-xl border border-error/30 bg-error/10 p-5">
        <p>{error}</p><button type="button" className="btn btn-sm mt-3" onClick={reload}>Retry</button>
      </div>
      : !saved && view === "day" ? <div role="status" className="rounded-xl bg-base-100 border border-base-300 p-8 text-center">
        No saved plan yet. Save a plan in Capacity Leveling, then refresh this page.
      </div>
      : <>
        {view === "month" && !saved && <div role={error ? "alert" : "status"} className="rounded-xl border border-base-300 bg-base-100 p-3 text-sm">
          {loading ? "Loading saved arrivals…" : error ? "Saved arrivals are unavailable. Observed output can still be viewed." : "No saved plan available. Showing observed output only."}
          {error && <button type="button" className="btn btn-xs ml-2" onClick={reload}>Retry plan</button>}
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
                <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold text-base-content/75">Finished {finished.checkedAt ? finishedRows.length : "—"} lots observed · {countText(gate)} planned</span>
                {queue.some(({ lot }) => lot.isHold) && <span className="rounded-full border border-base-300 bg-base-200/60 px-3 py-1 text-xs font-semibold">{queue.filter(({ lot }) => lot.isHold).length} HOLD at save</span>}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {workMode === "edit" && <button type="button" disabled title="Save order is not connected yet" className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold flex items-center gap-1.5"><Plus size={13} className="rotate-45 text-[#316be8]" />+ Auto-arrange</button>}
                  <button type="button" onClick={() => setHistoryOpen(true)} className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content/80">History</button>
                  {workMode === "edit" && <><button type="button" disabled className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold">Undo</button><button type="button" disabled title="Save order is not connected yet" className="btn btn-xs h-8 rounded-lg btn-primary px-4 text-xs font-bold shadow-xs">Save order</button></>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-base-content/55">
                <strong className="text-base-content/75">Plan v{saved.plan.version}</strong><span>{saved.plan.savedAt} · {saved.plan.savedBy}</span>
                <span>Status at save</span>
                {scheduledDates.length > 0 && <select aria-label="Scheduled day" className="select select-xs select-bordered ml-auto" value={scheduledDates.includes(date) ? date : ""} onChange={event => event.target.value && setDate(event.target.value)}><option value="" disabled>Select a planned day</option>{scheduledDates.map(day => <option key={day} value={day}>{day}</option>)}</select>}
              </div>
              {(saved.snapshot.undatedArrivalCount > 0 || saved.snapshot.orphanMoves.length > 0) && <p className="text-xs text-warning">Some arrivals have missing dates or unmatched overrides. Review this plan in Capacity Leveling.</p>}
              <ApiWorkListTable key={JSON.stringify([saved.plan.planId, category, gate, date, search])} planOrder={dayPlanLots} savedPlanLots={savedPlanLots} search={search} allocations={allocations} capacity={saved.snapshot.capacity?.[gate]?.[date]} finished={{ ...finished, rows: finishedRows, unresolved: finished.unresolved + finished.rows.filter(row => row.processGroup === null).length }} />
            </div> : null}
        </div>
        {saved && <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title={`${gate} · ${date}`} entries={[]} pending={null}
          snapshotLots={dayPlanLots} plan={{ version: saved.plan.version, savedAt: saved.plan.savedAt, savedBy: saved.plan.savedBy, reason: saved.plan.note ?? undefined, sourceCategory: category }} />}
      </>}
  </div>;
};

export default Planning_In_Gate;
