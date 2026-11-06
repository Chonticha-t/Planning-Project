import React, { memo, useMemo } from "react";
import type { GateUnit, GateUnitMode, MatrixDayCell, MatrixGateRow } from "../types";
import { ARRIVAL_GATE_WIDTH, getArrivalMinWidth } from "../arrivalLayout";
import { formatGateQuantity, GATE_UNIT_LABELS, GATE_UNIT_TITLES } from "../gateUnits";

interface GateMatrixTableProps {
  matrixRows: MatrixGateRow[];
  selectedGate: string;
  selectedDate: string | null;
  onSelectCell: (gateName: string, dateStr: string | null) => void;
  unitMode: GateUnitMode;
  unit: GateUnit;
  onUnitModeChange: (mode: GateUnitMode) => void;
}

const MODES: { mode: GateUnitMode; label: string }[] = [
  { mode: "all", label: "All Units" }, { mode: "piece", label: "Piece" },
  { mode: "sheet", label: "Sheet" }, { mode: "lot", label: "Lot" },
];

export const GateMatrixTable: React.FC<GateMatrixTableProps> = memo(({
  matrixRows, selectedGate, selectedDate, onSelectCell, unitMode, unit, onUnitModeChange,
}) => {
  const maxValue = useMemo(() => {
    let maximum = 0;
    for (const row of matrixRows) {
      for (const cell of [row.todayCell, ...row.days]) {
        const value = cell.quantities.total[unit];
        if (value !== null && value > maximum) maximum = value;
      }
    }
    return maximum;
  }, [matrixRows, unit]);

  const shading = (value: number | null) => {
    if (value === null || value === 0 || maxValue === 0) return "bg-base-200 text-base-content";
    const ratio = value / maxValue;
    if (ratio <= 0.25) return "bg-[#e6f0fd] text-[#1e293b]";
    if (ratio <= 0.5) return "bg-[#cfe3fc] text-[#1e293b]";
    if (ratio <= 0.75) return "bg-[#a3caf9] text-[#0f172a]";
    return "bg-[#76aef4] text-white";
  };

  const renderCell = (gate: string, cell: MatrixDayCell) => {
    const value = cell.quantities.total[unit];
    const populated = cell.lotsCount > 0 || cell.needCount > 0 || cell.quantities.unidentifiedCount > 0;
    const selected = selectedGate === gate && selectedDate === cell.dateStr;
    return (
      <td key={cell.dateStr} className="p-[2px] align-middle">
        <button type="button" aria-pressed={selected}
          aria-label={`${gate} ${cell.dateStr}: ${formatGateQuantity(value, unit)} ${GATE_UNIT_LABELS[unit]}, ${cell.needCount} Need WIP requests`}
          onClick={() => onSelectCell(gate, cell.dateStr)}
          title={value === null ? "Quantity unavailable: missing or invalid quantity/conversion data." : `${GATE_UNIT_TITLES[unit]}${cell.needCount ? `; ${cell.needCount} Need WIP requests (not actual lots)` : ""}`}
          className={`w-full min-h-[42px] rounded-[6px] flex flex-col items-center justify-center gap-1 py-1 px-0.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${selected ? "ring-2 ring-[#4f46e5]" : "hover:brightness-95"} ${populated ? shading(value) : `border border-dashed border-slate-200/80 ${cell.isHoliday ? "bg-slate-50/80 text-slate-400" : "text-slate-300"}`}`}
        >
          {populated ? <>
            <span className="text-[11px] font-extrabold tabular-nums leading-tight break-all">{formatGateQuantity(value, unit)}</span>
            <span className="text-[9px] font-medium opacity-75 leading-tight">{unit === "sheet" ? "sheets eq." : GATE_UNIT_LABELS[unit]}</span>
            {cell.needCount > 0 && <span className="text-[9px] leading-tight opacity-80">{cell.needCount} need</span>}
          </> : <span className="text-[10px] font-bold">{cell.isHoliday ? "OFF" : "-"}</span>}
        </button>
      </td>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">Gate Arrival Schedule</h3>
        <div role="group" aria-label="Display units" className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-base-300 bg-base-100 p-0.5">
          {MODES.map(({ mode, label }) => (
            <button key={mode} type="button" aria-pressed={unitMode === mode} onClick={() => onUnitModeChange(mode)}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ${unitMode === mode ? "bg-neutral text-neutral-content shadow-xs" : "text-base-content/70 hover:bg-base-200"}`}
            >{label}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto" data-arrival-scroll>
        <table className="w-full table-fixed text-center border-collapse select-none" style={{ minWidth: getArrivalMinWidth((matrixRows[0]?.days.length ?? 0) + 1) }}>
          <colgroup>
            <col style={{ width: ARRIVAL_GATE_WIDTH }} />
            {Array.from({ length: (matrixRows[0]?.days.length ?? 0) + 1 }, (_, index) => <col key={index} />)}
          </colgroup>
          <thead><tr>
            <th className="text-left font-bold text-[11px] text-slate-400 tracking-wider px-2 py-1 sticky left-0 bg-base-100 z-10">GATE</th>
            <th className="p-[2px]">
              <div className="py-1 px-1.5 rounded-[6px] bg-[#eef2ff] text-[#4f46e5]">
                <div className="text-[9.5px] font-extrabold uppercase leading-tight">TODAY</div>
                <div className="text-[11px] font-extrabold tabular-nums leading-tight">{matrixRows[0]?.todayCell.dateDisplay || ""}</div>
              </div>
            </th>
            {matrixRows[0]?.days.map((day) => (
              <th key={day.dateStr} className="p-[2px] font-medium">
                <div className="py-1">
                  <div className={`text-[9.5px] uppercase font-bold leading-tight ${day.dayName.toUpperCase() === "SUN" ? "text-rose-500" : "text-slate-400"}`}>{day.dayName}</div>
                  <div className="text-[11px] font-bold text-slate-600 tabular-nums leading-tight">{day.dateDisplay}</div>
                </div>
              </th>
            ))}
          </tr></thead>
          <tbody>{matrixRows.map((row) => (
            <tr key={row.gate_name}>
              <td className="px-2 py-1 text-left text-xs sticky left-0 z-10 bg-base-100">
                <button type="button" onClick={() => onSelectCell(row.gate_name, null)}
                  className={`font-semibold cursor-pointer focus-visible:outline-primary ${selectedGate === row.gate_name ? "text-[#4f46e5]" : "text-slate-800 hover:text-[#4f46e5]"}`}
                >{row.gate_name}</button>
              </td>
              {renderCell(row.gate_name, row.todayCell)}
              {row.days.map((cell) => renderCell(row.gate_name, cell))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-base-content/60">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-md bg-[#c8e0fc] border border-blue-300" />Low to High ({GATE_UNIT_TITLES[unit]})</span>
          <span>OFF: non-working day</span>
        </div>
        <span>{unitMode === "all" ? "All Units: schedule and summaries use Piece." : unit === "sheet" ? "Sheet equivalent = pieces / pieces per sheet." : unit === "lot" ? "Distinct actual lots; Need WIP is excluded." : "Planned pieces."}</span>
      </div>
    </div>
  );
});
