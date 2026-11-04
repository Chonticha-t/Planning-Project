import React, { useState, memo } from "react";
import type { MatrixGateRow, MatrixViewMode } from "../types";

interface GateMatrixTableProps {
  matrixRows: MatrixGateRow[];
  selectedGate: string;
  selectedDate: string | null;
  onSelectCell: (gateName: string, dateStr: string | null) => void;
}

export const GateMatrixTable: React.FC<GateMatrixTableProps> = memo(({
  matrixRows,
  selectedGate,
  selectedDate,
  onSelectCell,
}) => {
  const [viewMode, setViewMode] = useState<MatrixViewMode>("daily");

  // Compute max lot count across all cells so the 4 soft-blue levels scale naturally
  const maxLotCount = React.useMemo(() => {
    let max = 10;
    for (const row of matrixRows) {
      if (row.todayCell.lotsCount > max) max = row.todayCell.lotsCount;
      for (const d of row.days) {
        if (d.lotsCount > max) max = d.lotsCount;
      }
    }
    return max;
  }, [matrixRows]);

  // Soft pastel sky-blue scale matching reference design (no OS dark-mode override)
  const getCellShadingClass = (count: number) => {
    if (count === 0) return "";
    const ratio = count / maxLotCount;
    if (ratio <= 0.25) return "bg-[#e6f0fd] text-[#1e293b]";
    if (ratio <= 0.5) return "bg-[#cfe3fc] text-[#1e293b]";
    if (ratio <= 0.75) return "bg-[#a3caf9] text-[#0f172a]";
    return "bg-[#76aef4] text-white";
  };

  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">
            Gate Must-Out Schedule
          </h3>
        </div>

        {/* View Mode Switcher */}
        <div className="join bg-base-200/80 p-0.5 rounded-xl border border-base-300">
          {(["daily", "weekly", "monthly"] as MatrixViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`btn btn-xs rounded-lg px-2.5 capitalize font-semibold transition-all ${
                viewMode === mode
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-center border-collapse select-none">
          <thead>
            <tr>
              {/* Gate Column */}
              <th className="text-left font-bold text-[11px] text-slate-400 tracking-wider px-2 py-1 w-16 sticky left-0 bg-base-100 z-10">
                GATE
              </th>

              {/* Today Column */}
              <th className="p-[2px] min-w-[60px]">
                <div className="py-1 px-1.5 rounded-[6px] bg-[#eef2ff] text-[#4f46e5] text-center">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-tight leading-tight">TODAY</div>
                  <div className="text-[11px] font-extrabold tabular-nums leading-tight">
                    {matrixRows[0]?.todayCell.dateDisplay || ""}
                  </div>
                </div>
              </th>

              {/* Day Columns */}
              {matrixRows[0]?.days.map((d) => {
                const isSunday = d.dayName.toUpperCase() === "SUN";
                return (
                  <th
                    key={d.dateStr}
                    className="p-[2px] min-w-[54px] font-medium"
                  >
                    <div className="py-1 text-center">
                      <div
                        className={`text-[9.5px] uppercase font-bold tracking-tight leading-tight ${
                          isSunday ? "text-rose-500 font-extrabold" : "text-slate-400"
                        }`}
                      >
                        {d.dayName}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600 tabular-nums leading-tight">
                        {d.dateDisplay}
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {matrixRows.map((row) => {
              const isGateActive = selectedGate === row.gate_name;

              return (
                <tr key={row.gate_name}>
                  {/* Gate Name Header Cell */}
                  <td
                    onClick={() => onSelectCell(row.gate_name, null)}
                    className={`px-2 py-1 text-left font-extrabold text-xs cursor-pointer sticky left-0 z-10 bg-base-100 transition-colors ${
                      isGateActive ? "text-[#4f46e5]" : "text-slate-800 hover:text-[#4f46e5]"
                    }`}
                  >
                    {row.gate_name}
                  </td>

                  {/* Today Cell */}
                  <td
                    onClick={() => onSelectCell(row.gate_name, row.todayCell.dateStr)}
                    className="p-[2px] cursor-pointer align-middle"
                  >
                    {row.todayCell.lotsCount > 0 ? (
                      <div
                        className={`w-full min-h-[38px] rounded-[6px] flex flex-col items-center justify-center py-1 px-1 transition-all ${
                          selectedGate === row.gate_name && selectedDate === row.todayCell.dateStr
                            ? "ring-2 ring-[#4f46e5]"
                            : "hover:brightness-95"
                        } ${getCellShadingClass(row.todayCell.lotsCount)}`}
                      >
                        <span className="text-[12px] font-extrabold leading-none">{row.todayCell.lotsCount}</span>
                        <span className="text-[9.5px] font-medium opacity-75 leading-none mt-1">
                          {row.todayCell.needCount > 0 ? `${row.todayCell.needCount} need` : "lots"}
                        </span>
                      </div>
                    ) : (
                      <div
                        className={`w-full min-h-[38px] rounded-[6px] border border-dashed border-slate-200/80 flex items-center justify-center ${
                          row.todayCell.isHoliday
                            ? "bg-slate-50/80 text-slate-400 text-[10px] font-bold tracking-wider"
                            : "text-slate-300 text-xs"
                        }`}
                      >
                        {row.todayCell.isHoliday ? "OFF" : "-"}
                      </div>
                    )}
                  </td>

                  {/* Calendar Days Cells */}
                  {row.days.map((cell) => {
                    const isCellSelected = selectedGate === row.gate_name && selectedDate === cell.dateStr;

                    return (
                      <td
                        key={cell.dateStr}
                        onClick={() => onSelectCell(row.gate_name, cell.dateStr)}
                        className="p-[2px] cursor-pointer align-middle"
                      >
                        {cell.lotsCount > 0 ? (
                          <div
                            className={`w-full min-h-[38px] rounded-[6px] flex flex-col items-center justify-center py-1 px-1 transition-all ${
                              isCellSelected
                                ? "ring-2 ring-[#4f46e5]"
                                : "hover:brightness-95"
                            } ${getCellShadingClass(cell.lotsCount)}`}
                          >
                            <span className="text-[12px] font-extrabold leading-none">{cell.lotsCount}</span>
                            <span className="text-[9.5px] font-medium opacity-75 leading-none mt-1">
                              {cell.needCount > 0 ? `${cell.needCount} need` : "lots"}
                            </span>
                          </div>
                        ) : (
                          <div
                            className={`w-full min-h-[38px] rounded-[6px] border border-dashed border-slate-200/80 flex items-center justify-center ${
                              cell.isHoliday
                                ? "bg-slate-50/80 text-slate-400 text-[10px] font-bold tracking-wider"
                                : "text-slate-300 text-xs"
                            }`}
                          >
                            {cell.isHoliday ? "OFF" : "-"}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend & Notes Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-base-content/60">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-md bg-[#c8e0fc] border border-blue-300" />
            <span>Low ➔ High (Lot volume)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-md bg-base-200 border border-base-300" />
            <span>Holidays (skip)</span>
          </div>
        </div>
      </div>
    </div>
  );
});

