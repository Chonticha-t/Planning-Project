import React, { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Pencil,
  Table2,
  Folder,
  Users,
  Sun,
  Moon,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import type { GateShiftConfig, Shift, ShiftConfig, SpecialDay } from "../types";
import { fetchCapacity, saveCapacity, toApiFailure } from "../hooks/api";
import { formatMinutes, shiftCapacityMin } from "../utils/levelingCalculations";

interface CapacityModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after settings were stored, so the page can recalculate Load % */
  onSaved: () => void;
}

const SHIFTS = [
  { id: "day", label: "Day Shift", Icon: Sun },
  { id: "night", label: "Night Shift", Icon: Moon },
] as const;

/** Day capacity of a gate; null while an active shift has no MC. */
const calcGateCapacityMin = (cfg: GateShiftConfig, forceOt?: boolean): number | null => {
  const shifts = [cfg.shifts.day, cfg.shifts.night].map((shift) => shiftCapacityMin(shift, forceOt ?? shift.otEnabled));
  return shifts.some((value) => value === null) ? null : Math.round(shifts.reduce<number>((sum, value) => sum + (value ?? 0), 0));
};

const shortCap = (value: number | null) => (value === null ? "Set MC" : `${value.toLocaleString()}m`);

export const CapacityModal: React.FC<CapacityModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const { requireAdmin } = useAuth();
  const [selectedGate, setSelectedGate] = useState("FADL");
  const [activeTab, setActiveTab] = useState<"input" | "table">("input");
  const [selectedShift, setSelectedShift] = useState<Shift>("day");
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [configs, setConfigs] = useState<Record<string, GateShiftConfig> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [specialAction, setSpecialAction] = useState<SpecialDay | "clear">("ot");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfigs = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      const gates = await fetchCapacity(signal);
      setConfigs(Object.fromEntries(gates.map((gate) => [gate.gate, gate])));
      setIsDirty(false);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(toApiFailure(error).message);
    }
  }, []);

  // Always start from the stored settings when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setConfigs(null);
    setSelectedDays([]);
    setMonthOffset(0);
    void loadConfigs(controller.signal);
    return () => controller.abort();
  }, [isOpen, loadConfigs]);

  if (!isOpen) return null;

  if (!configs) {
    return (
      <div className="planning-summary-gate fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
        <div role="dialog" aria-modal="true" aria-label="Capacity Configuration"
          className="bg-base-100 rounded-2xl shadow-2xl border border-base-300 w-full max-w-[460px] p-6 text-base-content flex flex-col gap-4">
          <div className="text-sm font-bold">Capacity Configuration</div>
          <div className={`text-sm ${loadError ? "text-rose-700" : "text-base-content/60"}`} role={loadError ? "alert" : "status"}>
            {loadError ?? "Loading capacity settings..."}
          </div>
          <div className="flex justify-end gap-2">
            {loadError && (
              <button type="button" onClick={() => void loadConfigs()}
                className="btn btn-sm h-8 px-4 btn-primary text-xs font-semibold rounded-lg">Try again</button>
            )}
            <button type="button" onClick={onClose}
              className="btn btn-sm h-8 px-4 bg-base-100 border border-base-300 hover:bg-base-200 text-base-content text-xs font-semibold rounded-lg">Close</button>
          </div>
        </div>
      </div>
    );
  }

  const gateNames = Object.keys(configs);
  const currentMonth = dayjs().startOf("month").add(monthOffset, "month");
  const daysInMonth = currentMonth.daysInMonth();
  const firstDayDow = currentMonth.day(); // 0 = Sun, 1 = Mon ...
  const leadingEmptySlots = firstDayDow === 0 ? 6 : firstDayDow - 1;

  const gateCfg = configs[selectedGate] || configs[gateNames[0]];
  const activeGate = gateCfg.gate;
  const cfg = gateCfg.shifts[selectedShift];
  const shiftLabel = selectedShift === "day" ? "Day Shift" : "Night Shift";
  // Keep shift colors scoped below the modal header.
  const shiftTheme = {
    ...(selectedShift === "day" ? {
      "--color-primary": "#facc15",
      "--color-primary-content": "#422006",
    } : {}),
    "--shift-label-color": selectedShift === "day"
      ? "color-mix(in oklab, var(--color-primary) 35%, var(--color-base-content))"
      : "var(--color-primary)",
    "--shift-accent-text": selectedShift === "day"
      ? "var(--shift-label-color)" : "#4f46e5",
    "--shift-accent-soft": selectedShift === "day"
      ? "color-mix(in oklab, var(--color-primary) 12%, var(--color-base-100))" : "#eef2ff",
    "--shift-accent-border": selectedShift === "day"
      ? "color-mix(in oklab, var(--color-primary) 45%, var(--color-base-300))" : "#c7d2fe",
  } as React.CSSProperties;

  const updateCurrentShift = (patch: Partial<ShiftConfig>) => {
    const validatedPatch = { ...patch };
    // MC and manpower may stay empty (null) until they are known.
    for (const key of ["mcLines", "manpower"] as const) {
      const value = validatedPatch[key];
      if (value !== undefined && value !== null) {
        if (!Number.isFinite(value)) return;
        validatedPatch[key] = Math.max(0, Math.floor(value));
      }
    }
    for (const key of ["minPerShift", "otMinutes", "break1Min", "break2Min", "lunchMin"] as const) {
      const value = validatedPatch[key];
      if (value !== undefined) {
        if (!Number.isFinite(value)) return;
        validatedPatch[key] = Math.max(0, value);
      }
    }
    setConfigs((prev) => prev && ({
      ...prev,
      [activeGate]: {
        ...prev[activeGate],
        shifts: {
          ...prev[activeGate].shifts,
          [selectedShift]: { ...prev[activeGate].shifts[selectedShift], ...validatedPatch },
        },
      },
    }));
    setIsDirty(true);
  };

  const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

  const normalCapMin = shiftCapacityMin(cfg, false);
  const otCapMin = shiftCapacityMin(cfg, true);
  const activeCapMin = calcGateCapacityMin(gateCfg);
  const shiftCapMin = shiftCapacityMin(cfg);

  const handleApplySpecialDays = () => {
    if (!cfg.enabled) return;
    const nextSpecial = { ...cfg.specialDays };
    for (const d of selectedDays) {
      if (d >= 1 && d <= daysInMonth) {
        const date = currentMonth.date(d).format("YYYY-MM-DD");
        if (specialAction === "clear") delete nextSpecial[date];
        else nextSpecial[date] = specialAction;
      }
    }
    updateCurrentShift({ specialDays: nextSpecial });
    setSelectedDays([]);
  };

  // Settings and special days of every gate are stored together, in one transaction.
  const handleSave = async () => {
    if (isSaving) return;
    await requireAdmin(async () => {
      setIsSaving(true);
      try {
        await saveCapacity(Object.values(configs));
        toast.success("Capacity settings saved.");
        onSaved();
        onClose();
      } catch (error) {
        toast.error(toApiFailure(error).message, { duration: 6000 });
      } finally {
        setIsSaving(false);
      }
    });
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
                onClick={() => { setMonthOffset((m) => m - 1); setSelectedDays([]); }}
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
                onClick={() => { setMonthOffset((m) => m + 1); setSelectedDays([]); }}
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

        <div className="flex min-h-0 flex-1 flex-col" style={shiftTheme} data-capacity-shift={selectedShift}>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 border-b border-base-300 bg-base-100">
          <div role="group" aria-label="Shift selection" className="inline-flex items-center gap-1 rounded-xl border border-base-300 bg-base-200/60 p-1">
            {SHIFTS.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={selectedShift === id}
                onClick={() => setSelectedShift(id)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors cursor-pointer ${selectedShift === id
                  ? "bg-primary text-primary-content shadow-xs"
                  : "text-base-content/65 hover:bg-base-100 hover:text-base-content"}`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-base-content/55">
            Settings and date overrides apply to the selected shift
          </span>
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
                  <div className="text-[10px] font-bold text-[color:var(--shift-label-color)] uppercase tracking-wider px-2 mb-1">
                    FPC GATES
                  </div>
                  <div className="space-y-0.5">
                    {gateNames.filter((g) => configs[g].group === "FPC").map((g) => {
                      const isActive = activeGate === g;
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
                            {shortCap(gCap)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] font-bold text-[color:var(--shift-label-color)] uppercase tracking-wider px-2 mb-1">
                    SMT GATES
                  </div>
                  <div className="space-y-0.5">
                    {gateNames.filter((g) => configs[g].group === "SMT").map((g) => {
                      const isActive = activeGate === g;
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
                            {shortCap(gCap)}
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
                      <span className="text-[color:var(--shift-label-color)]">{activeGate}</span>
                    </div>
                    <div className="text-xs text-base-content/55">
                      {shiftLabel} · Default break and OT configuration
                    </div>
                  </div>

                  {/* Clean Capacity Badge (Minutes / Day) */}
                  <div className="flex items-center gap-2 bg-[var(--shift-accent-soft)] border border-[var(--shift-accent-border)] px-3.5 py-2 rounded-xl">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase text-[color:var(--shift-accent-text)] opacity-80">
                        Total Gate Capacity / Day
                      </div>
                      <div className="text-base font-extrabold text-[color:var(--shift-accent-text)]">
                        {formatMinutes(activeCapMin)}
                      </div>
                      <div className="text-[10px] text-[color:var(--shift-accent-text)] opacity-80">
                        {shiftLabel}: {cfg.enabled ? formatMinutes(shiftCapMin) : "Off"}
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
                        aria-label="Enable overtime"
                        checked={cfg.otEnabled}
                        onChange={(e) =>
                          updateCurrentShift({ otEnabled: e.target.checked })
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
                        min={0}
                        aria-label="OT minutes"
                        value={cfg.otMinutes}
                        onChange={(e) =>
                          updateCurrentShift({
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
                        aria-label="Enable break 1"
                        checked={cfg.break1}
                        onChange={(e) =>
                          updateCurrentShift({ break1: e.target.checked })
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
                        min={0}
                        aria-label="Break 1 minutes"
                        value={cfg.break1Min}
                        onChange={(e) =>
                          updateCurrentShift({
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
                        aria-label="Enable break 2"
                        checked={cfg.break2}
                        onChange={(e) =>
                          updateCurrentShift({ break2: e.target.checked })
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
                        min={0}
                        aria-label="Break 2 minutes"
                        value={cfg.break2Min}
                        onChange={(e) =>
                          updateCurrentShift({
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
                        aria-label="Enable lunch break"
                        checked={cfg.lunch}
                        onChange={(e) =>
                          updateCurrentShift({ lunch: e.target.checked })
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
                        min={0}
                        aria-label="Lunch break minutes"
                        value={cfg.lunchMin}
                        onChange={(e) =>
                          updateCurrentShift({
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
                      <Folder size={13} className="text-[color:var(--shift-label-color)]" />
                      MC (Lines)
                    </span>
                    <input
                      type="number"
                        min={0}
                      aria-label="MC lines"
                      placeholder="-"
                      title="Leave empty until the machine count is known"
                        value={cfg.mcLines ?? ""}
                      onChange={(e) =>
                        updateCurrentShift({ mcLines: optionalNumber(e.target.value) })
                      }
                      className="w-14 bg-base-100 border border-base-300 rounded-lg px-2 py-1 text-right text-xs font-bold focus:outline-none"
                    />
                  </div>

                  <div className="bg-base-200/30 border border-base-300 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-base-content/70 flex items-center gap-1.5">
                      <Users size={13} className="text-[color:var(--shift-label-color)]" />
                      Manpower
                    </span>
                    <input
                      type="number"
                      min={0}
                      aria-label="Manpower"
                        value={cfg.manpower ?? ""}
                      onChange={(e) =>
                        updateCurrentShift({ manpower: optionalNumber(e.target.value) })
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
                        min={0}
                        aria-label="Minutes per shift"
                        value={cfg.minPerShift}
                        onChange={(e) =>
                          updateCurrentShift({
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
                      Shift Active
                    </span>
                    <div className="flex items-center gap-1 bg-base-100 border border-base-300 rounded-lg px-2 py-1">
                      <input
                        type="checkbox"
                        aria-label="Enable selected shift"
                        checked={cfg.enabled}
                        onChange={(e) =>
                          updateCurrentShift({
                            enabled: e.target.checked,
                          })
                        }
                        className="toggle toggle-xs toggle-primary"
                      />
                      <span className="text-[10.5px] text-base-content/50">
                        {cfg.enabled ? "On" : "Off"}
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
                      {activeGate} · {shiftLabel} · Select dates to open OT, run normally or mark as Off
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
                          const dayOverride = cfg.specialDays[dateObj.format("YYYY-MM-DD")];

                          return (
                            <button
                              key={d}
                              type="button"
                              aria-label={dateObj.format("YYYY-MM-DD")}
                              aria-pressed={isSelected}
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
                                  : dayOverride === "work"
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
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
                        Action for selected dates · {shiftLabel}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              id: "ot",
                              label: "Open OT",
                              sub: formatMinutes(otCapMin),
                            },
                            {
                              id: "work",
                              label: "Normal Day",
                              sub: formatMinutes(normalCapMin),
                            },
                            { id: "off", label: "Day Off", sub: "0 min" },
                            { id: "clear", label: "Clear", sub: "Follow calendar" },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSpecialAction(item.id)}
                            className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              specialAction === item.id
                                ? "border-primary bg-[var(--shift-accent-soft)] text-[color:var(--shift-accent-text)]"
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
                      disabled={selectedDays.length === 0 || !cfg.enabled}
                      onClick={handleApplySpecialDays}
                      className="btn btn-sm h-8 btn-primary text-xs font-semibold rounded-lg w-full cursor-pointer"
                    >
                      {cfg.enabled ? `Apply to ${selectedDays.length} selected day(s)` : "Enable this shift to apply overrides"}
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
            <div className="bg-base-100 border border-base-300 rounded-xl overflow-x-auto shadow-2xs">
              <table className="table table-sm w-full text-center border-collapse [&_th]:bg-base-200/70 [&_th]:text-xs [&_th]:font-bold [&_th]:py-3 [&_td]:py-2.5 [&_td]:text-xs [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-base-300 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-base-300/60">
                <thead>
                  <tr className="border-b border-base-300">
                    <th>GROUP</th>
                    <th>GATE</th>
                    <th>MC (LINES)</th>
                    <th>MANPOWER</th>
                    <th>SHIFT</th>
                    <th>MIN / SHIFT</th>
                    <th>BREAKS + LUNCH</th>
                    <th>DEFAULT OT</th>
                    <th>NORMAL CAP / SHIFT</th>
                    <th>WITH OT CAP / SHIFT</th>
                    <th>TOTAL CAP / DAY</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(configs).map((gate) => {
                    const gCfg = gate.shifts[selectedShift];
                    const breaks =
                      (gCfg.break1 ? gCfg.break1Min : 0) +
                      (gCfg.break2 ? gCfg.break2Min : 0) +
                      (gCfg.lunch ? gCfg.lunchMin : 0);
                    const norm = shiftCapacityMin(gCfg, false);
                    const withOt = shiftCapacityMin(gCfg, true);
                    return (
                      <tr
                        key={gate.gate}
                        onClick={() => {
                          setSelectedGate(gate.gate);
                          setActiveTab("input");
                        }}
                        className="border-b border-base-200 hover:bg-base-200/40 cursor-pointer"
                      >
                        <td>
                          <span className="px-2 py-0.5 rounded bg-base-200 text-[11px] font-bold">
                            {gate.group}
                          </span>
                        </td>
                        <td className="font-bold text-[color:var(--shift-label-color)]">{gate.gate}</td>
                        <td className="font-semibold">{gCfg.mcLines ?? "-"}</td>
                        <td className="font-semibold text-base-content/75">
                          {gCfg.manpower ?? "-"}
                        </td>
                        <td className="whitespace-nowrap">
                          {shiftLabel}
                          <div className={`text-[10px] ${gCfg.enabled ? "text-success" : "text-base-content/50"}`}>
                            {gCfg.enabled ? "Active" : "Off"}
                          </div>
                        </td>
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
                          {gCfg.enabled ? formatMinutes(norm) : "Off"}
                        </td>
                        <td className="font-bold text-amber-700">
                          {gCfg.enabled ? formatMinutes(withOt) : "Off"}
                        </td>
                        <td className="font-bold text-[color:var(--shift-label-color)]">
                          {formatMinutes(calcGateCapacityMin(gate))}
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
            {isDirty ? "Unsaved changes" : "No changes"} · MC can stay empty until it is known
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
              onClick={() => void handleSave()}
              disabled={!isDirty || isSaving}
              className="btn btn-sm h-8 px-4 btn-primary text-xs font-semibold rounded-lg cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};
