import React, { useState } from "react";
import dayjs from "dayjs";
import { X } from "lucide-react";
import type { DayGateLoad, PlanMode, LevelingKpiData } from "../types";
import { GATES_CONFIG } from "../mock/levelingMockData";

export type GridUnitMode = "pct" | "piece" | "sheet" | "lot";

const UNIT_MODES: { mode: GridUnitMode; label: string }[] = [
  { mode: "pct", label: "Load %" },
  { mode: "piece", label: "Piece" },
  { mode: "sheet", label: "Sheet" },
  { mode: "lot", label: "Lot" },
];

// Derive Piece / Sheet / Lot metrics strictly from actual accumulated lots on that gate-day
const getCellMetrics = (
  _pct: number,
  gInfo?: DayGateLoad["gates"][string]
) => {
  if (gInfo && gInfo.lotCount !== undefined && gInfo.lotCount > 0) {
    return {
      pcs: gInfo.totalPcs || 0,
      sheets: gInfo.totalSheets || Math.ceil((gInfo.totalPcs || 0) / 12),
      lots: gInfo.lotCount,
    };
  }
  return { pcs: 0, sheets: 0, lots: 0 };
};


interface GateLoadGridProps {
  gridData: DayGateLoad[];
  /** Same grid with lots on their original system dates (Required) — compared in "required" mode */
  requiredGridData?: DayGateLoad[];
  planMode: PlanMode;
  onPlanModeChange: (mode: PlanMode) => void;
  kpis: LevelingKpiData;
  isDragging?: boolean;
  selectedGate?: string | null;
  selectedDate?: string | null;
  onSelectCell?: (gateId: string | null, dateStr: string | null) => void;
}

export const GateLoadGrid: React.FC<GateLoadGridProps> = ({
  gridData,
  requiredGridData,
  planMode,
  onPlanModeChange,
  kpis,
  selectedGate = null,
  selectedDate = null,
  onSelectCell,
}) => {
  const [unitMode, setUnitMode] = useState<GridUnitMode>("pct");
  const isCompare = planMode === "required" && Boolean(requiredGridData);

  // Keep the two tables (Required / Planned) scrolled together horizontally
  const scrollRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const syncingRef = React.useRef(false);
  const handleScroll = (idx: number) => {
    if (syncingRef.current) return;
    const src = scrollRefs.current[idx];
    if (!src) return;
    syncingRef.current = true;
    scrollRefs.current.forEach((el, i) => {
      if (el && i !== idx) el.scrollLeft = src.scrollLeft;
    });
    requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  };

  const handleCellClick = (gateId: string | null, dateStr: string | null) => {
    if (!onSelectCell) return;
    if (selectedGate === gateId && selectedDate === dateStr) {
      onSelectCell(null, null);
    } else {
      onSelectCell(gateId, dateStr);
    }
  };

  // Compute summary metrics for the currently clicked cell (if both gate & date are selected)
  const selectedCellSummary = React.useMemo(() => {
    if (!selectedGate || !selectedDate) return null;
    const dayCol = gridData.find((d) => d.date === selectedDate);
    const gInfo = dayCol?.gates[selectedGate];
    if (!gInfo) return null;
    const pct =
      planMode === "planned" && gInfo.previewPct !== undefined
        ? gInfo.previewPct
        : gInfo.pct;
    return {
      pct,
      ...getCellMetrics(pct, gInfo),
    };
  }, [gridData, selectedGate, selectedDate, planMode]);

  // One Gate Load table (used once in Planned mode, twice in Required mode)
  const renderTable = (data: DayGateLoad[], idx: number, allowPreview: boolean) => (
      <div
        ref={(el) => {
          scrollRefs.current[idx] = el;
        }}
        onScroll={() => handleScroll(idx)}
        className="overflow-x-auto pb-1"
      >
        <table
          className="w-full table-fixed text-center border-collapse select-none"
          style={{ minWidth: `${72 + data.length * 88}px` }}
        >
          <colgroup>
            <col style={{ width: "72px" }} />
            {data.map((col) => (
              <col key={col.date} style={{ width: "88px" }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="text-left font-bold text-[11px] text-slate-400 tracking-wider px-2.5 py-1.5 sticky left-0 bg-base-100 z-10">
                GATE
              </th>
              {data.map((col, idx) => {
                const isToday = idx === 0;
                const isSun = col.isSunday;
                const isDaySelected = selectedDate === col.date;
                return (
                  <th key={col.date} className="p-[3px] font-medium">
                    <button
                      type="button"
                      disabled={isSun}
                      onClick={() => handleCellClick(null, col.date)}
                      className={`w-full rounded-[7px] py-1.5 px-1.5 transition-all ${
                        isSun
                          ? "cursor-default"
                          : "cursor-pointer hover:bg-base-200/70"
                      } ${
                        isDaySelected
                          ? "ring-2 ring-[#4f46e5] bg-[#eef2ff] text-[#4f46e5]"
                          : isToday
                          ? "bg-[#eef2ff] text-[#4f46e5]"
                          : ""
                      }`}
                    >
                      <div
                        className={`text-[10px] uppercase font-bold leading-tight ${
                          isToday || isDaySelected
                            ? "text-[#4f46e5]"
                            : isSun
                            ? "text-rose-500"
                            : "text-slate-400"
                        }`}
                      >
                        {isToday ? "TODAY" : col.dayLabel}
                      </div>
                      <div
                        className={`text-[11.5px] font-bold tabular-nums leading-tight mt-0.5 ${
                          isToday || isDaySelected
                            ? "text-[#4f46e5]"
                            : "text-slate-600"
                        }`}
                      >
                        {col.displayDate}
                      </div>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {GATES_CONFIG.map((gate) => {
              const isGateSelected =
                selectedGate === gate.id && !selectedDate;
              return (
                <tr key={gate.id}>
                  <td className="text-left text-xs px-2.5 py-1.5 sticky left-0 bg-base-100 z-10">
                    <button
                      type="button"
                      onClick={() => handleCellClick(gate.id, null)}
                      className={`font-bold cursor-pointer transition-colors ${
                        selectedGate === gate.id
                          ? "text-[#4f46e5]"
                          : "text-base-content hover:text-[#4f46e5]"
                      }`}
                    >
                      {gate.name}
                    </button>
                  </td>
                  {data.map((col) => {
                    const gInfo = col.gates[gate.id];

                    if (!gInfo || col.isSunday) {
                      return (
                        <td key={col.date} className="p-[3px] align-middle">
                          <div className="w-full h-[54px] min-h-[54px] rounded-[8px] border border-dashed border-slate-200/80 bg-slate-50/80 text-slate-400 flex items-center justify-center text-[10.5px] font-bold">
                            OFF
                          </div>
                        </td>
                      );
                    }

                    const hasPreview =
                      allowPreview &&
                      gInfo.previewPct !== undefined &&
                      gInfo.previewPct !== gInfo.pct;

                    const displayPct = hasPreview
                      ? gInfo.previewPct!
                      : gInfo.pct;

                    const originalPct = gInfo.pct;
                    const { pcs, sheets, lots } = getCellMetrics(
                      displayPct,
                      gInfo
                    );
                    const isCellSelected =
                      (selectedGate === gate.id && selectedDate === col.date) ||
                      (selectedGate === null && selectedDate === col.date) ||
                      isGateSelected;

                    let pillStyle = "";
                    if (col.isFrozen) {
                      if (displayPct > 100) {
                        pillStyle =
                          "bg-[#fee2e2]/70 text-[#b91c1c]/85 font-semibold";
                      } else if (displayPct >= 80) {
                        pillStyle =
                          "bg-[#fef3c7]/65 text-[#92400e]/80 font-semibold";
                      } else {
                        pillStyle =
                          "bg-base-200/80 text-base-content/55 font-medium";
                      }
                    } else {
                      if (displayPct > 100) {
                        pillStyle = "bg-[#fee2e2] text-[#991b1b] font-bold";
                      } else if (displayPct >= 80) {
                        pillStyle = "bg-[#fef3c7] text-[#92400e] font-bold";
                      } else {
                        pillStyle = "bg-[#d1fae5] text-[#065f46] font-semibold";
                      }
                    }

                    return (
                      <td key={col.date} className="p-[3px] align-middle">
                        <button
                          type="button"
                          aria-pressed={isCellSelected}
                          onClick={() => handleCellClick(gate.id, col.date)}
                          title={`${gate.name} · ${col.displayDate}: ${displayPct}% load | ${pcs.toLocaleString()} pcs | ${sheets.toLocaleString()} sheets | ${lots} lots`}
                          className={`w-full h-[54px] min-h-[54px] rounded-[8px] flex flex-col items-center justify-center gap-1 py-1.5 px-1.5 transition-all cursor-pointer tabular-nums hover:brightness-95 focus-visible:outline-2 focus-visible:outline-primary ${pillStyle} ${
                            isCellSelected
                              ? "ring-2 ring-[#4f46e5] shadow-xs"
                              : hasPreview
                              ? "border-[1.5px] border-dashed border-[#4f46e5] ring-1 ring-[#4f46e5]/20"
                              : ""
                          }`}
                        >
                          {unitMode === "pct" &&
                            (hasPreview ? (
                              <>
                                <div className="flex items-baseline gap-1 leading-none whitespace-nowrap">
                                  <span className="text-[12px] font-extrabold leading-none">
                                    {displayPct}%
                                  </span>
                                  <span className="text-[9.5px] line-through opacity-70 font-medium leading-none">
                                    {originalPct}%
                                  </span>
                                </div>
                                <span className="text-[9.5px] font-medium opacity-80 leading-none whitespace-nowrap">
                                  {pcs.toLocaleString()} pcs
                                </span>
                                <span className="text-[9px] opacity-75 leading-none whitespace-nowrap">
                                  {lots} lots
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-[12.5px] font-extrabold leading-none whitespace-nowrap">
                                  {displayPct}%
                                </span>
                                <span className="text-[9.5px] font-medium opacity-80 leading-none whitespace-nowrap">
                                  {pcs.toLocaleString()} pcs
                                </span>
                                <span className="text-[9px] opacity-75 leading-none whitespace-nowrap">
                                  {lots} lots
                                </span>
                              </>
                            ))}

                          {unitMode === "piece" && (
                            <>
                              <span className="text-[12px] font-extrabold leading-none whitespace-nowrap">
                                {pcs.toLocaleString()}
                              </span>
                              <span className="text-[9.5px] font-medium opacity-75 leading-none whitespace-nowrap">
                                pcs
                              </span>
                              <span className="text-[9.5px] opacity-80 leading-none whitespace-nowrap">
                                {displayPct}% · {lots} lots
                              </span>
                            </>
                          )}

                          {unitMode === "sheet" && (
                            <>
                              <span className="text-[12px] font-extrabold leading-none whitespace-nowrap">
                                {sheets.toLocaleString()}
                              </span>
                              <span className="text-[9.5px] font-medium opacity-75 leading-none whitespace-nowrap">
                                sheets
                              </span>
                              <span className="text-[9.5px] opacity-80 leading-none whitespace-nowrap">
                                {displayPct}% · {lots} lots
                              </span>
                            </>
                          )}

                          {unitMode === "lot" && (
                            <>
                              <span className="text-[12.5px] font-extrabold leading-none whitespace-nowrap">
                                {lots}
                              </span>
                              <span className="text-[9.5px] font-medium opacity-75 leading-none whitespace-nowrap">
                                lots
                              </span>
                              <span className="text-[9.5px] opacity-80 leading-none whitespace-nowrap">
                                {displayPct}% · {(pcs / 1000).toFixed(1)}k
                              </span>
                            </>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
  );

  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Header Row with Unit Switcher & Compact Summary Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">
            Gate Load by Day
          </h3>

          {/* Display Units Switcher matching GateMatrixTable (Load % | Piece | Sheet | Lot) */}
          <div
            role="group"
            aria-label="Display units"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-100 p-0.5"
          >
            {UNIT_MODES.map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                aria-pressed={unitMode === mode}
                onClick={() => setUnitMode(mode)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
                  unitMode === mode
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-base-content/70 hover:bg-base-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Redesigned Status Summary Chips (Clean & Scannable) */}
          <div className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
            {/* 1. Overload Cells */}
            <div
              title={kpis.redCellPlanningDetail}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-100 border border-base-300 text-xs"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  kpis.redCellsPlanningAfter > 0
                    ? "bg-rose-500"
                    : "bg-emerald-500"
                }`}
              />
              <span className="text-base-content/60 font-medium">Overload</span>
              <span className="font-bold text-base-content">
                {kpis.redCellsPlanningAfter}
              </span>
              {kpis.redCellsPlanningBefore !== kpis.redCellsPlanningAfter && (
                <span className="text-[10.5px] text-base-content/40">
                  (was {kpis.redCellsPlanningBefore})
                </span>
              )}
            </div>

            {/* 2. Late / At Risk Lots */}
            <div
              title={kpis.posAtRiskDetail}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-100 border border-base-300 text-xs"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  kpis.posAtRiskAfter > 0 ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
              <span className="text-base-content/60 font-medium">
                Late Lots
              </span>
              <span className="font-bold text-base-content">
                {kpis.posAtRiskAfter}
              </span>
            </div>

            {/* 3. Moved Lots */}
            <div
              title={`${kpis.releasesMovedEarlier} earlier · ${kpis.releasesMovedLater} later`}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-100 border border-base-300 text-xs"
            >
              <span className="w-2 h-2 rounded-full bg-[#4f46e5]" />
              <span className="text-base-content/60 font-medium">Moved</span>
              <span className="font-bold text-base-content">
                {kpis.releasesMovedCount}
                <span className="text-base-content/40 font-normal">
                  /{kpis.releasesTotalCount}
                </span>
              </span>
            </div>
          </div>

          {/* Active Selection Pill showing Gate · Date + % / Pcs / Sheet / Lot when clicked */}
          {(selectedGate || selectedDate) && (
            <button
              type="button"
              onClick={() => onSelectCell?.(null, null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#eef2ff] border border-indigo-200 text-xs font-semibold text-[#4f46e5] hover:bg-indigo-100/80 transition-colors cursor-pointer tabular-nums"
              title="Click to clear selection"
            >
              <span>
                {[
                  selectedGate
                    ? GATES_CONFIG.find((g) => g.id === selectedGate)?.name ||
                      selectedGate
                    : null,
                  selectedDate ? dayjs(selectedDate).format("DD/MM") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {selectedCellSummary
                  ? ` — ${selectedCellSummary.pct}% · ${selectedCellSummary.pcs.toLocaleString()} pcs · ${selectedCellSummary.sheets.toLocaleString()} sheets · ${selectedCellSummary.lots} lots`
                  : ""}
              </span>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Required / Planned Toggle matching GateMatrixTable */}
        <div
          role="group"
          aria-label="Plan mode"
          className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-100 p-0.5"
        >
          <button
            type="button"
            onClick={() => onPlanModeChange("planned")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              planMode === "planned"
                ? "bg-primary text-primary-content shadow-xs"
                : "text-base-content/70 hover:bg-base-200"
            }`}
          >
            Planned
          </button>
          <button
            type="button"
            onClick={() => onPlanModeChange("required")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
              planMode === "required"
                ? "bg-primary text-primary-content shadow-xs"
                : "text-base-content/70 hover:bg-base-200"
            }`}
          >
            Required
          </button>
        </div>
      </div>

      {isCompare ? (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-base-content/70">
              <span className="h-2 w-2 rounded-full bg-base-content/40" />
              REQUIRED
              <span className="font-normal text-base-content/50">· lots on system dates</span>
            </div>
            {renderTable(requiredGridData ?? [], 0, false)}
          </div>
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-bold tracking-wide text-[#4f46e5]">
              <span className="h-2 w-2 rounded-full bg-[#4f46e5]" />
              PLANNED
              <span className="font-normal text-base-content/50">· after leveling</span>
            </div>
            {renderTable(gridData, 1, false)}
          </div>
        </div>
      ) : (
        renderTable(gridData, 0, true)
      )}
    </div>
  );
};
