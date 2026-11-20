import { useMemo, useState } from "react";
import { AlertCircle, Clock, History } from "lucide-react";
import "../../Planning_Summary_Gate/gateTheme.css";
import { useAuth } from "@/context/AuthContext";
import { ConfirmReorderModal } from "../../Capacity_Leveling/components/ConfirmReorderModal";
import type { LotItem } from "../../Capacity_Leveling/types";
import usePlanningInGate from "../hooks/usePlanningInGate";
import { InGateHeader } from "../components/InGateHeader";
import { ApiWorkListTable } from "../components/ApiWorkListTable";
import { ApiMonthlySummary } from "../components/ApiMonthlySummary";
import { HistoryPanel } from "../components/HistoryPanel";
import { PlannedDateDropdown } from "../components/PlannedDateDropdown";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

const Planning_In_Gate = () => {
  const { requirePlanner } = useAuth();
  const {
    today, category, view, date, setDate, month, setMonth, unit, setUnit, search, setSearch,
    workMode, setWorkMode, tvMode, setTvMode, exporting,
    saved, loading, error, reload, finished, monthly,
    gates, gate, setSelectedGate, gateRows, dayPlanLots, savedPlanLots, scheduledDates, queue, visible,
    allocations, finishedRows,
    changeCategory, changeView, countText, refresh, exportPlan,
    hasUnsavedChanges, saving, stageMoveLot, stageReorderById, confirmReorder, undoOrder, saveOrder,
  } = usePlanningInGate();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pendingReorder, setPendingReorder] = useState<{
    before: LotItem[];
    after: LotItem[];
    movingIds: string[];
    nextOrder: any;
    historyEvents: Map<string, any>;
  } | null>(null);

  const handleStageMove = (lot: LotItem, direction: "up" | "down" | "top") => {
    void requirePlanner(() => {
      const staged = stageMoveLot(lot, direction);
      if (staged) {
        setPendingReorder(staged);
      }
    });
  };

  const handleDragReorder = (movingLotId: string, targetLotId: string, position: "before" | "after") => {
    void requirePlanner(() => {
      const staged = stageReorderById(movingLotId, targetLotId, position);
      if (staged) {
        setPendingReorder(staged);
      }
    });
  };
  // Tables filter after typing pauses, so each keystroke does not re-filter or re-query routing.
  // Search is not part of the table keys: a key change would remount the table and refetch routing.
  const tableSearch = useDebouncedValue(search, 250);

  const lotsPerScheduledDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of gateRows) {
      if (row.plannedDate) {
        map[row.plannedDate] = (map[row.plannedDate] || 0) + 1;
      }
    }
    return map;
  }, [gateRows]);

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
          {view === "month" ? <ApiMonthlySummary key={JSON.stringify([saved?.plan.planId, category, gate, month])} rows={gateRows} snapshot={saved?.snapshot} month={month} today={today} unit={unit} search={tableSearch} version={saved?.plan.version} gate={gate} category={category} output={monthly} /> : saved ?
            <div className="p-4 sm:p-5 flex flex-col gap-3">
              {/* Clean Unified Queue Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-base-200">
                {/* Left: Queue Title + Plan Badge + Save Timestamp + Hold indicator */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-base-content">Queue</h2>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#316be8]/10 text-[#316be8] border border-[#316be8]/20">
                    Plan v{saved.plan.version}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-base-content/60 font-medium">
                    <Clock size={12} className="opacity-60" />
                    <span>{saved.plan.savedAt}</span>
                    <span className="opacity-40">·</span>
                    <span>{saved.plan.savedBy}</span>
                  </span>
                  <span className="text-[11px] font-medium text-base-content/50 bg-base-200/80 px-2 py-0.5 rounded">
                    Status at save
                  </span>
                  {queue.some(({ lot }) => lot.isHold) && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <AlertCircle size={12} />
                      {queue.filter(({ lot }) => lot.isHold).length} HOLD at save
                    </span>
                  )}
                </div>

                {/* Right: Planned Date Dropdown + Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {scheduledDates.length > 0 && (
                    <PlannedDateDropdown
                      date={date}
                      todayStr={today}
                      scheduledDates={scheduledDates}
                      lotsPerDate={lotsPerScheduledDate}
                      onDateChange={setDate}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content/80 flex items-center gap-1.5 hover:bg-base-200 transition-colors cursor-pointer"
                  >
                    <History size={13} />
                    History
                  </button>
                  {workMode === "edit" && (
                    <>
                      <button
                        type="button"
                        disabled={!hasUnsavedChanges || saving}
                        onClick={() => void requirePlanner(() => undoOrder())}
                        title={hasUnsavedChanges ? "Revert uncommitted reorders" : "No changes to undo"}
                        className="btn btn-xs h-8 rounded-lg border border-base-300 bg-base-100 px-3 text-xs font-bold text-base-content/80 hover:bg-base-200 transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        Undo
                      </button>
                      <button
                        type="button"
                        disabled={!hasUnsavedChanges || saving}
                        onClick={() => void requirePlanner(() => void saveOrder())}
                        title={hasUnsavedChanges ? "Save reordered queue to new plan version" : "No changes to save"}
                        className="btn btn-xs h-8 rounded-lg btn-primary px-4 text-xs font-bold shadow-xs hover:opacity-90 transition-opacity disabled:opacity-30 cursor-pointer flex items-center gap-1.5"
                      >
                        {saving && <span className="loading loading-spinner loading-xs" />}
                        {saving ? "Saving…" : "Save order"}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {(saved.snapshot.undatedArrivalCount > 0 || saved.snapshot.orphanMoves.length > 0) && <p className="text-xs text-warning">Some arrivals have missing dates or unmatched overrides. Review this plan in Capacity Leveling.</p>}
              <ApiWorkListTable
                key={JSON.stringify([saved.plan.planId, category, gate, date])}
                planOrder={dayPlanLots}
                savedPlanLots={savedPlanLots}
                search={tableSearch}
                allocations={allocations}
                capacity={saved.snapshot.capacity?.[gate]?.[date]}
                finished={{ ...finished, rows: finishedRows, unresolved: finished.unresolved + finished.rows.filter(row => row.processGroup === null).length }}
                canEdit={workMode === "edit"}
                onMoveUp={(lot) => handleStageMove(lot, "up")}
                onMoveDown={(lot) => handleStageMove(lot, "down")}
                onMoveToTop={(lot) => handleStageMove(lot, "top")}
                onDragReorder={handleDragReorder}
              />
            </div> : null}
        </div>
        {saved && <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title={`${gate} · ${date}`} entries={[]} pending={null}
          snapshotLots={dayPlanLots} plan={{ version: saved.plan.version, savedAt: saved.plan.savedAt, savedBy: saved.plan.savedBy, reason: saved.plan.note ?? undefined, sourceCategory: category }} />}
        {pendingReorder && (
          <ConfirmReorderModal
            before={pendingReorder.before}
            after={pendingReorder.after}
            movingIds={pendingReorder.movingIds}
            onConfirm={() => {
              confirmReorder(pendingReorder.nextOrder, pendingReorder.historyEvents);
              setPendingReorder(null);
            }}
            onCancel={() => setPendingReorder(null)}
          />
        )}
      </>}
  </div>;
};

export default Planning_In_Gate;
