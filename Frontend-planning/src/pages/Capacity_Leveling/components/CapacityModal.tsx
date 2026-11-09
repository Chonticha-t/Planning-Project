import React, { useState } from "react";
import dayjs from "dayjs";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Pencil,
  Table2,
  Folder,
  Users,
} from "lucide-react";

interface CapacityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

interface GateCapConfig {
  gate: string;
  group: "FPC" | "SMT";
  mcLines: number;
  manpower: string;
  shiftsPerDay: number;
  minPerShift: number;
  otEnabled: boolean;
  otMinutes: number;
  break1: boolean;
  break1Min: number;
  break2: boolean;
  break2Min: number;
  lunch: boolean;
  lunchMin: number;
  specialDays: Record<number, "ot" | "off" | "work">;
}

const INITIAL_GATE_CONFIGS: Record<string, GateCapConfig> = {
  FFPC: {
    gate: "FFPC",
    group: "FPC",
    mcLines: 8,
    manpower: "16",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  FVAC: {
    gate: "FVAC",
    group: "FPC",
    mcLines: 8,
    manpower: "16",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  FADL: {
    gate: "FADL",
    group: "FPC",
    mcLines: 8,
    manpower: "16",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: { 19: "ot", 23: "ot" },
  },
  FIN: {
    gate: "FIN",
    group: "FPC",
    mcLines: 8,
    manpower: "20",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: { 19: "ot" },
  },
  "W/H": {
    gate: "W/H",
    group: "FPC",
    mcLines: 8,
    manpower: "10",
    shiftsPerDay: 1,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 90,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  MFPC: {
    gate: "MFPC",
    group: "SMT",
    mcLines: 6,
    manpower: "12",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  MMOT: {
    gate: "MMOT",
    group: "SMT",
    mcLines: 6,
    manpower: "12",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  MBLK: {
    gate: "MBLK",
    group: "SMT",
    mcLines: 6,
    manpower: "12",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  MFIN: {
    gate: "MFIN",
    group: "SMT",
    mcLines: 6,
    manpower: "14",
    shiftsPerDay: 2,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 180,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
  "MW/H": {
    gate: "MW/H",
    group: "SMT",
    mcLines: 6,
    manpower: "8",
    shiftsPerDay: 1,
    minPerShift: 540,
    otEnabled: false,
    otMinutes: 90,
    break1: true,
    break1Min: 10,
    break2: true,
    break2Min: 10,
    lunch: true,
    lunchMin: 45,
    specialDays: {},
  },
};

const calcGateCapacityMin = (cfg: GateCapConfig, forceOt?: boolean) => {
  const breaks =
    (cfg.break1 ? cfg.break1Min : 0) +
    (cfg.break2 ? cfg.break2Min : 0) +
    (cfg.lunch ? cfg.lunchMin : 0);
  const netShiftMin = Math.max(0, cfg.minPerShift - breaks);
  const useOt = forceOt !== undefined ? forceOt : cfg.otEnabled;
  const lineMinPerDay =
    netShiftMin * cfg.shiftsPerDay + (useOt ? cfg.otMinutes : 0);
  return Math.round(lineMinPerDay * cfg.mcLines * 0.85);
};

export const CapacityModal: React.FC<CapacityModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [selectedGate, setSelectedGate] = useState("FADL");
  const [activeTab, setActiveTab] = useState<"input" | "table">("input");
  const [monthOffset, setMonthOffset] = useState(0); // 0 = Nov 2026
  const [configs, setConfigs] =
    useState<Record<string, GateCapConfig>>(INITIAL_GATE_CONFIGS);
  const [selectedDays, setSelectedDays] = useState<number[]>([19, 23]);
  const [specialAction, setSpecialAction] = useState<"ot" | "off" | "work">(
    "ot"
  );
  const [isDirty, setIsDirty] = useState(false);

  if (!isOpen) return null;

  const currentMonth = dayjs("2026-11-01").add(monthOffset, "month");
  const daysInMonth = currentMonth.daysInMonth();
  const firstDayDow = currentMonth.day(); // 0 = Sun, 1 = Mon ...
  const leadingEmptySlots = firstDayDow === 0 ? 6 : firstDayDow - 1;

  const cfg = configs[selectedGate] || configs.FADL;

  const updateCurrentGate = (patch: Partial<GateCapConfig>) => {
    setConfigs((prev) => ({
      ...prev,
      [selectedGate]: {
        ...prev[selectedGate],
        ...patch,
      },
    }));
    setIsDirty(true);
  };

  const normalCapMin = calcGateCapacityMin(cfg, false);
  const otCapMin = calcGateCapacityMin(cfg, true);
  const activeCapMin = calcGateCapacityMin(cfg);

  const handleApplySpecialDays = () => {
    const nextSpecial = { ...cfg.specialDays };
    for (const d of selectedDays) {
      nextSpecial[d] = specialAction;
    }
    updateCurrentGate({ specialDays: nextSpecial });
  };

  return (
    <div className="planning-summary-gate fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 overflow-y-auto">
      <div className="bg-base-100 rounded-2xl shadow-2xl border border-base-300 w-full max-w-[960px] flex flex-col max-h-[90vh] overflow-hidden text-base-content">
        {/* Top Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-base-300 bg-base-100">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center text-[#4f46e5]">
                <Sliders size={16} />
              </div>
              <div className="leading-tight">
                <div className="text-[10px] font-bold text-base-content/45 uppercase tracking-wider">
                  GATE CAPACITY SETTINGS
                </div>
                <div className="text-sm font-bold text-base-content">
                  Capacity Configuration
                </div>
              </div>
            </div>

            {/* View Switcher: Setting by Gate vs Summary Table */}
            <div className="inline-flex items-center bg-base-200/70 p-0.5 rounded-lg border border-base-300 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("input")}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "input"
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-base-content/70 hover:text-base-content"
                }`}
              >
                <Pencil size={12} />
                <span>Gate Settings</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("table")}
                className={`px-3 py-1.5 rounded-md font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === "table"
                    ? "bg-primary text-primary-content shadow-xs"
                    : "text-base-content/70 hover:text-base-content"
                }`}
              >
                <Table2 size={12} />
                <span>All Gates Summary</span>
              </button>
            </div>
          </div>

          {/* Right Month Selector & Close */}
          <div className="flex items-center gap-2.5">
            <div className="inline-flex items-center gap-2 bg-base-200/50 border border-base-300 px-2.5 py-1 rounded-xl tabular-nums">
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m - 1)}
                className="btn btn-xs btn-ghost btn-square h-6 w-6 rounded-md text-base-content/60 hover:text-base-content cursor-pointer"
                title="Previous month"
              >
                <ChevronLeft size={14} />
              </button>
              <div className="leading-tight text-center min-w-[135px]">
                <div className="text-xs font-bold text-base-content">
                  {currentMonth.format("MMMM YYYY")}
                </div>
                <div className="text-[10px] text-base-content/50">
                  {currentMonth.startOf("month").format("DD/MM/YYYY")} –{" "}
                  {currentMonth.endOf("month").format("DD/MM/YYYY")}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMonthOffset((m) => m + 1)}
                className="btn btn-xs btn-ghost btn-square h-6 w-6 rounded-md text-base-content/60 hover:text-base-content cursor-pointer"
                title="Next month"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-xs btn-ghost btn-square h-8 w-8 rounded-lg text-base-content/60 hover:text-base-content cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* =========================================================
            TAB 1: GATE SETTINGS (Clean & Organized)
           ========================================================= */}
        {activeTab === "input" ? (
          <div className="flex flex-1 overflow-hidden bg-base-200/30">
            {/* Left Gate Selector Sidebar */}
            <div className="w-[185px] bg-base-100 border-r border-base-300 p-3 flex flex-col justify-between shrink-0 overflow-y-auto">
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] font-bold text-primary uppercase tracking-wider px-2 mb-1">
                    FPC GATES
                  </div>
                  <div className="space-y-0.5">
                    {["FFPC", "FVAC", "FADL", "FIN", "W/H"].map((g) => {
                      const isActive = selectedGate === g;
                      const gCap = calcGateCapacityMin(configs[g]);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setSelectedGate(g)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            isActive
                              ? "bg-primary text-primary-content shadow-xs"
                              : "text-base-content/80 hover:bg-base-200"
                          }`}
                        >
                          <span>{g}</span>
                          <span
                            className={`text-[10.5px] font-semibold ${
                              isActive
                                ? "text-primary-content/85"
                                : "text-base-content/45"
                            }`}
                          >
                            {gCap.toLocaleString()}m
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-primary uppercase tracking-wider px-2 mb-1">
                    SMT GATES
                  </div>
                  <div className="space-y-0.5">
                    {["MFPC", "MMOT", "MBLK", "MFIN", "MW/H"].map((g) => {
                      const isActive = selectedGate === g;
                      const gCap = calcGateCapacityMin(configs[g]);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setSelectedGate(g)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            isActive
                              ? "bg-primary text-primary-content shadow-xs"
                              : "text-base-content/80 hover:bg-base-200"
                          }`}
                        >
                          <span>{g}</span>
                          <span
                            className={`text-[10.5px] font-semibold ${
                              isActive
                                ? "text-primary-content/85"
                                : "text-base-content/45"
                            }`}
                          >
                            {gCap.toLocaleString()}m
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Main Settings Area */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 tabular-nums">
              {/* Card 1: Daily Standard Settings (OT, Breaks, Lunch, MC, Shifts) */}
              <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-200 pb-3">
                  <div>
                    <div className="text-sm font-bold text-base-content">
                      Standard Daily Capacity ·{" "}
                      <span className="text-primary">{selectedGate}</span>
                    </div>
                    <div className="text-xs text-base-content/55">
                      Default shift, break, and OT configuration for working days
                    </div>
                  </div>

                  {/* Clean Capacity Badge (Minutes / Day) */}
                  <div className="flex items-center gap-2 bg-[#eef2ff] border border-indigo-200 px-3.5 py-2 rounded-xl">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-[#4f46e5]/80">
                        Total Gate Capacity / Day
                      </div>
                      <div className="text-base font-extrabold text-[#4f46e5]">
                        {activeCapMin.toLocaleString()} min
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2x2 Grid for OT, Break 1, Break 2, Lunch */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {/* OT */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-base-200/40 border border-base-300 rounded-xl">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={cfg.otEnabled}
                        onChange={(e) =>
                          updateCurrentGate({ otEnabled: e.target.checked })
                        }
                        className="toggle toggle-xs toggle-primary"
                      />
                      <div>
                        <div className="text-xs font-bold text-base-content">
                          Overtime (OT)
                        </div>
                        <div className="text-[11px] text-base-content/50">
                          {cfg.otEnabled
                            ? "Open by default every day"
                            : "Closed by default"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-base-100 border border-base-300 rounded-lg px-2.5 py-1">
                      <input
                        type="number"
                        value={cfg.otMinutes}
                        onChange={(e) =>
                          updateCurrentGate({
                            otMinutes: Number(e.target.value),
                          })
                        }
                        className="w-12 text-right text-xs font-bold focus:outline-none"
                      />
                      <span className="text-[11px] text-base-content/50">
                        min
                      </span>
                    </div>
                  </div>

                  {/* Break 1 */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-base-200/40 border border-base-300 rounded-xl">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={cfg.break1}
                        onChange={(e) =>
                          updateCurrentGate({ break1: e.target.checked })
                        }
                        className="toggle toggle-xs toggle-primary"
                      />
                      <div>
                        <div className="text-xs font-bold text-base-content">
                          Break 1
                        </div>
                        <div className="text-[11px] text-base-content/50">
                          Deducted per shift
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-base-100 border border-base-300 rounded-lg px-2.5 py-1">
                      <input
                        type="number"
                        value={cfg.break1Min}
                        onChange={(e) =>
                          updateCurrentGate({
                            break1Min: Number(e.target.value),
                          })
                        }
                        className="w-12 text-right text-xs font-bold focus:outline-none"
                      />
                      <span className="text-[11px] text-base-content/50">
                        min
                      </span>
                    </div>
                  </div>

                  {/* Break 2 */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-base-200/40 border border-base-300 rounded-xl">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={cfg.break2}
                        onChange={(e) =>
                          updateCurrentGate({ break2: e.target.checked })
                        }
                        className="toggle toggle-xs toggle-primary"
                      />
                      <div>
                        <div className="text-xs font-bold text-base-content">
                          Break 2
                        </div>
                        <div className="text-[11px] text-base-content/50">
                          Deducted per shift
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-base-100 border border-base-300 rounded-lg px-2.5 py-1">
                      <input
                        type="number"
                        value={cfg.break2Min}
                        onChange={(e) =>
                          updateCurrentGate({
                            break2Min: Number(e.target.value),
                          })
                        }
                        className="w-12 text-right text-xs font-bold focus:outline-none"
                      />
                      <span className="text-[11px] text-base-content/50">
                        min
                      </span>
                    </div>
                  </div>

                  {/* Lunch */}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-base-200/40 border border-base-300 rounded-xl">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={cfg.lunch}
                        onChange={(e) =>
                          updateCurrentGate({ lunch: e.target.checked })
                        }
                        className="toggle toggle-xs toggle-primary"
                      />
                      <div>
                        <div className="text-xs font-bold text-base-content">
                          Lunch Break
                        </div>
                        <div className="text-[11px] text-base-content/50">
                          Deducted per shift
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-base-100 border border-base-300 rounded-lg px-2.5 py-1">
                      <input
                        type="number"
                        value={cfg.lunchMin}
                        onChange={(e) =>
                          updateCurrentGate({
                            lunchMin: Number(e.target.value),
                          })
                        }
                        className="w-12 text-right text-xs font-bold focus:outline-none"
                      />
                      <span className="text-[11px] text-base-content/50">
                        min
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4 Machine, Manpower & Shift Inputs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                  <div className="bg-base-200/30 border border-base-300 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-base-content/70 flex items-center gap-1.5">
                      <Folder size={13} className="text-primary" />
                      MC (Lines)
                    </span>
                    <input
                      type="number"
                      value={cfg.mcLines}
                      onChange={(e) =>
                        updateCurrentGate({ mcLines: Number(e.target.value) })
                      }
                      className="w-14 bg-base-100 border border-base-300 rounded-lg px-2 py-1 text-right text-xs font-bold focus:outline-none"
                    />
                  </div>

                  <div className="bg-base-200/30 border border-base-300 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-base-content/70 flex items-center gap-1.5">
                      <Users size={13} className="text-primary" />
                      Manpower
                    </span>
                    <input
                      type="text"
                      value={cfg.manpower}
                      onChange={(e) =>
                        updateCurrentGate({ manpower: e.target.value })
                      }
                      placeholder="-"
                      className="w-14 bg-base-100 border border-base-300 rounded-lg px-2 py-1 text-right text-xs font-bold focus:outline-none"
                    />
                  </div>

                  <div className="bg-base-200/30 border border-base-300 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-base-content/70">
                      Minutes / Shift
                    </span>
                    <div className="flex items-center gap-1 bg-base-100 border border-base-300 rounded-lg px-2 py-1">
                      <input
                        type="number"
                        value={cfg.minPerShift}
                        onChange={(e) =>
                          updateCurrentGate({
                            minPerShift: Number(e.target.value),
                          })
                        }
                        className="w-12 text-right text-xs font-bold focus:outline-none"
                      />
                      <span className="text-[10.5px] text-base-content/50">
                        m
                      </span>
                    </div>
                  </div>

                  <div className="bg-base-200/30 border border-base-300 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-base-content/70">
                      Shifts / Day
                    </span>
                    <div className="flex items-center gap-1 bg-base-100 border border-base-300 rounded-lg px-2 py-1">
                      <input
                        type="number"
                        value={cfg.shiftsPerDay}
                        onChange={(e) =>
                          updateCurrentGate({
                            shiftsPerDay: Number(e.target.value),
                          })
                        }
                        className="w-10 text-right text-xs font-bold focus:outline-none"
                      />
                      <span className="text-[10.5px] text-base-content/50">
                        shift
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Full-Month Calendar for Special Days (OT / Day off overrides) */}
              <div className="bg-base-100 border border-base-300 rounded-2xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-bold text-base-content">
                      Special Days Override ·{" "}
                      {currentMonth.format("MMMM YYYY")}
                    </span>
                    <span className="text-xs text-base-content/50 ml-2">
                      Select specific dates to open OT or mark as Holiday/Off
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                  {/* Left: Full Month Calendar (1..30/31) */}
                  <div className="md:col-span-6">
                    <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] text-base-content/45 font-bold mb-1.5">
                      <span>Mo</span>
                      <span>Tu</span>
                      <span>We</span>
                      <span>Th</span>
                      <span>Fr</span>
                      <span>Sa</span>
                      <span className="text-rose-500">Su</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center text-xs">
                      {Array.from({ length: leadingEmptySlots }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                        (d) => {
                          const dateObj = currentMonth.date(d);
                          const isSun = dateObj.day() === 0;
                          const isSelected = selectedDays.includes(d);
                          const dayOverride = cfg.specialDays[d];

                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                setSelectedDays((prev) =>
                                  prev.includes(d)
                                    ? prev.filter((x) => x !== d)
                                    : [...prev, d]
                                );
                              }}
                              className={`relative h-8 rounded-lg font-bold text-xs transition-all cursor-pointer flex flex-col items-center justify-center ${
                                isSelected
                                  ? "bg-primary text-primary-content shadow-2xs"
                                  : dayOverride === "ot"
                                  ? "bg-amber-100 text-amber-900 border border-amber-300"
                                  : dayOverride === "off"
                                  ? "bg-slate-100 text-slate-400 line-through"
                                  : isSun
                                  ? "bg-rose-50/70 text-rose-500"
                                  : "hover:bg-base-200 text-base-content"
                              }`}
                            >
                              <span>{d}</span>
                              {dayOverride && !isSelected && (
                                <span className="text-[8px] uppercase leading-none font-extrabold">
                                  {dayOverride}
                                </span>
                              )}
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>

                  {/* Right: Action to apply to selected days */}
                  <div className="md:col-span-6 flex flex-col justify-between bg-base-200/35 border border-base-300 rounded-xl p-3.5 space-y-3">
                    <div>
                      <div className="text-xs font-bold text-base-content mb-1">
                        Selected Dates ({selectedDays.length})
                      </div>
                      <div className="text-xs text-base-content/65 min-h-[20px]">
                        {selectedDays.length > 0
                          ? selectedDays
                              .slice()
                              .sort((a, b) => a - b)
                              .map(
                                (d) =>
                                  `${String(d).padStart(2, "0")}/${currentMonth.format(
                                    "MM/YYYY"
                                  )}`
                              )
                              .join(", ")
                          : "Click dates on the calendar to select"}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase text-base-content/50">
                        Action for selected dates
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              id: "ot",
                              label: "Open OT",
                              sub: `${otCapMin.toLocaleString()} min`,
                            },
                            {
                              id: "work",
                              label: "Normal Day",
                              sub: `${normalCapMin.toLocaleString()} min`,
                            },
                            { id: "off", label: "Day Off", sub: "0 min" },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSpecialAction(item.id)}
                            className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              specialAction === item.id
                                ? "border-primary bg-[#eef2ff] text-[#4f46e5]"
                                : "border-base-300 bg-base-100 text-base-content/75 hover:bg-base-200/50"
                            }`}
                          >
                            <div className="text-xs font-bold">{item.label}</div>
                            <div className="text-[10.5px] opacity-75 mt-0.5">
                              {item.sub}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={selectedDays.length === 0}
                      onClick={handleApplySpecialDays}
                      className="btn btn-sm h-8 btn-primary text-xs font-semibold rounded-lg w-full cursor-pointer"
                    >
                      Apply to {selectedDays.length} selected day(s)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* =========================================================
             TAB 2: ALL GATES SUMMARY TABLE (Capacity Table)
             ========================================================= */
          <div className="flex-1 p-5 overflow-y-auto bg-base-200/30 tabular-nums">
            <div className="bg-base-100 border border-base-300 rounded-xl overflow-hidden shadow-2xs">
              <table className="table table-sm w-full text-center border-collapse [&_th]:bg-base-200/70 [&_th]:text-xs [&_th]:font-bold [&_th]:py-3 [&_td]:py-2.5 [&_td]:text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-base-300 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-base-300/60">
                <thead>
                  <tr className="border-b border-base-300">
                    <th>GROUP</th>
                    <th>GATE</th>
                    <th>MC (LINES)</th>
                    <th>MANPOWER</th>
                    <th>SHIFTS / DAY</th>
                    <th>MIN / SHIFT</th>
                    <th>BREAKS + LUNCH</th>
                    <th>DEFAULT OT</th>
                    <th>NORMAL CAP / DAY</th>
                    <th>WITH OT CAP / DAY</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(configs).map((gCfg) => {
                    const breaks =
                      (gCfg.break1 ? gCfg.break1Min : 0) +
                      (gCfg.break2 ? gCfg.break2Min : 0) +
                      (gCfg.lunch ? gCfg.lunchMin : 0);
                    const norm = calcGateCapacityMin(gCfg, false);
                    const withOt = calcGateCapacityMin(gCfg, true);
                    return (
                      <tr
                        key={gCfg.gate}
                        onClick={() => {
                          setSelectedGate(gCfg.gate);
                          setActiveTab("input");
                        }}
                        className="border-b border-base-200 hover:bg-base-200/40 cursor-pointer"
                      >
                        <td>
                          <span className="px-2 py-0.5 rounded bg-base-200 text-[11px] font-bold">
                            {gCfg.group}
                          </span>
                        </td>
                        <td className="font-bold text-primary">{gCfg.gate}</td>
                        <td className="font-semibold">{gCfg.mcLines}</td>
                        <td className="font-semibold text-base-content/75">
                          {gCfg.manpower || "-"}
                        </td>
                        <td>{gCfg.shiftsPerDay}</td>
                        <td>{gCfg.minPerShift} min</td>
                        <td className="text-base-content/65">-{breaks} min</td>
                        <td>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              gCfg.otEnabled
                                ? "bg-amber-100 text-amber-800"
                                : "bg-base-200 text-base-content/50"
                            }`}
                          >
                            {gCfg.otEnabled
                              ? `On (${gCfg.otMinutes}m)`
                              : "Closed"}
                          </span>
                        </td>
                        <td className="font-bold text-base-content">
                          {norm.toLocaleString()} min
                        </td>
                        <td className="font-bold text-amber-700">
                          {withOt.toLocaleString()} min
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-base-300 bg-base-100">
          <span className="text-xs text-base-content/50">
            {isDirty ? "Unsaved changes" : "All changes up to date"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-sm h-8 px-4 bg-base-100 border border-base-300 hover:bg-base-200 text-base-content text-xs font-semibold rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave();
                onClose();
              }}
              className="btn btn-sm h-8 px-4 btn-primary text-xs font-semibold rounded-lg cursor-pointer"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
