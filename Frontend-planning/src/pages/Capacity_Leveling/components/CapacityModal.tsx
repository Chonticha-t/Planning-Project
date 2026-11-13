import React, { useCallback, useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Table2,
  Folder,
  Users,
  Sun,
  Moon,
  Gauge,
  CalendarDays,
} from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import type { GateShiftConfig, Shift, ShiftConfig, SpecialDay } from "../types";
import { fetchCapacity, saveCapacity, toApiFailure } from "../hooks/api";
import { formatMinutes, shiftCapacityMin } from "../utils/levelingCalculations";
import type { EditingScope } from "../utils/editingPresence";

interface CapacityModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after settings were stored, so the page can recalculate Load % */
  onSaved: () => void;
  onEditingChange?: (scopes: EditingScope[]) => void;
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

type OverrideTarget = Shift | "both";
type SpecialAction = SpecialDay | "clear";

const OVERRIDE_TARGETS: { id: OverrideTarget; label: string }[] = [
  { id: "day", label: "Day Shift" },
  { id: "night", label: "Night Shift" },
  { id: "both", label: "Both Shifts" },
];

type GateScope = "gate" | "FPC" | "SMT" | "all";

const SPECIAL_LABEL: Record<SpecialDay, string> = { ot: "OT", work: "Normal", off: "Off" };

const shortCap = (value: number | null) => (value === null ? "Set MC" : `${value.toLocaleString()}m`);

export const CapacityModal: React.FC<CapacityModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  onEditingChange,
}) => {
  const { requirePlanner } = useAuth();
  const [selectedGate, setSelectedGate] = useState("FADL");
  const [activeTab, setActiveTab] = useState<"standard" | "special" | "table">("standard");
  const [selectedShift, setSelectedShift] = useState<Shift>("day");
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month
  const [configs, setConfigs] = useState<Record<string, GateShiftConfig> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [specialAction, setSpecialAction] = useState<SpecialAction>("ot");
  // Which shift(s) a date override is written to (independent of the settings tab)
  const [overrideTarget, setOverrideTarget] = useState<OverrideTarget>("day");
  // Which gate(s) a date override is written to: the selected gate, a whole group, or every gate
  const [gateScope, setGateScope] = useState<GateScope>("gate");
  // Click-and-drag painting on the calendar: "set" writes the action, "clear" removes it
  const paintModeRef = useRef<"set" | "clear" | null>(null);

  useEffect(() => {
    const stop = () => {
      paintModeRef.current = null;
    };
    window.addEventListener("mouseup", stop);
    return () => window.removeEventListener("mouseup", stop);
  }, []);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [originalConfigs, setOriginalConfigs] = useState<GateShiftConfig[]>([]);
  const [baseRevision, setBaseRevision] = useState("");
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    onEditingChange?.(isOpen && isDirty && configs
      ? originalConfigs.filter(gate => JSON.stringify(gate) !== JSON.stringify(configs[gate.gate]))
        .map(gate => ({ kind: "capacity", gate: gate.gate, date: null })) : []);
  }, [isOpen, isDirty, configs, originalConfigs, onEditingChange]);
  useEffect(() => () => onEditingChange?.([]), [onEditingChange]);

  const loadConfigs = useCallback(async (signal?: AbortSignal) => {
    setLoadError(null);
    try {
      const { gates, revision } = await fetchCapacity(signal);
      setOriginalConfigs(gates);
      setBaseRevision(revision);
      setConflict(false);
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

  const activeCapMin = calcGateCapacityMin(gateCfg);
  const shiftCapMin = shiftCapacityMin(cfg);

  // ---- Special days: pick an action, then click (or drag over) dates ----
  const targetShifts: Shift[] = overrideTarget === "both" ? ["day", "night"] : [overrideTarget];
  const targetGates: string[] =
    gateScope === "gate"
      ? [activeGate]
      : gateNames.filter((g) => gateScope === "all" || configs[g].group === gateScope);
  const isMultiGate = targetGates.length > 1;
  const scopeLabel =
    gateScope === "gate" ? activeGate : gateScope === "all" ? `All gates (${targetGates.length})` : `All ${gateScope} (${targetGates.length})`;

  // Capacity a shift would have on an override date. Uses enabled=true: an override opens
  // the shift on that date even when it is off by default (same rule as the backend).
  const overrideCapMin = (otOn: boolean): number | null => {
    const values = targetShifts.map((s) => shiftCapacityMin({ ...gateCfg.shifts[s], enabled: true }, otOn));
    return values.some((v) => v === null) ? null : values.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  };

  /** Override of a date for the current target: a value, undefined (none) or "mix" (shifts differ) */
  const overrideFor = (date: string): SpecialDay | undefined | "mix" => {
    const values = targetGates.flatMap((g) => targetShifts.map((s) => configs[g].shifts[s].specialDays[date]));
    return values.every((v) => v === values[0]) ? values[0] : "mix";
  };

  const writeOverride = (date: string, mode: "set" | "clear") => {
    setConfigs((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const g of targetGates) {
        const gate = next[g];
        const shifts = { ...gate.shifts };
        for (const s of targetShifts) {
          const special = { ...shifts[s].specialDays };
          if (mode === "clear") delete special[date];
          else if (specialAction !== "clear") special[date] = specialAction;
          shifts[s] = { ...shifts[s], specialDays: special };
        }
        next[g] = { ...gate, shifts };
      }
      return next;
    });
    setIsDirty(true);
  };

  // First date decides the mode: clicking a date that already has this action removes it
  const startPaint = (date: string) => {
    const already = specialAction !== "clear" && overrideFor(date) === specialAction;
    const mode = specialAction === "clear" || already ? "clear" : "set";
    paintModeRef.current = mode;
    writeOverride(date, mode);
  };

  const continuePaint = (date: string) => {
    if (paintModeRef.current) writeOverride(date, paintModeRef.current);
  };

  const monthOverrideCount = Array.from({ length: daysInMonth }, (_, i) =>
    overrideFor(currentMonth.date(i + 1).format("YYYY-MM-DD"))
  ).filter(Boolean).length;
  // "FADL Night", "W/H Night" … shifts that are off by default inside the current target
  const offTargets = targetGates.flatMap((g) =>
    targetShifts
      .filter((s) => !configs[g].shifts[s].enabled)
      .map((s) => (isMultiGate ? `${g} ${s === "day" ? "Day" : "Night"}` : s === "day" ? "Day Shift" : "Night Shift"))
  );

  // Settings and special days of every gate are stored together, in one transaction.
  const handleSave = async () => {
    if (isSaving) return;
    await requirePlanner(async () => {
      setIsSaving(true);
      try {
        await saveCapacity(Object.values(configs), baseRevision);
        toast.success("Capacity settings saved.");
        onSaved();
        onClose();
      } catch (error) {
        if (toApiFailure(error).code === "CAPACITY_VERSION_CONFLICT") setConflict(true);
        toast.error(toApiFailure(error).message, { duration: 6000 });
      } finally {
        setIsSaving(false);
      }
    });
  };

  // Tabs: one job per tab
  const TABS = [
    { id: "standard", step: "1", label: "Standard Capacity", Icon: Gauge },
    { id: "special", step: "2", label: "Special Days", Icon: CalendarDays },
    { id: "table", step: "", label: "All Gates Summary", Icon: Table2 },
  ] as const;

  const shiftSwitch = (
    <div role="group" aria-label="Shift selection" className="inline-flex items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/60 p-0.5">
      {SHIFTS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          aria-pressed={selectedShift === id}
          onClick={() => setSelectedShift(id)}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            selectedShift === id ? "bg-primary text-primary-content shadow-xs" : "text-base-content/65 hover:bg-base-100 hover:text-base-content"
          }`}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );

  const stepTitle = (n: string, title: string, hint?: string) => (
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#4f46e5] text-[10px] font-bold text-white">{n}</span>
      <span className="text-xs font-bold text-base-content">{title}</span>
      {hint && <span className="text-[11px] text-base-content/50">{hint}</span>}
    </div>
  );

  const segBtn = (active: boolean) =>
    `rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
      active ? "bg-[#4f46e5] text-white shadow-xs" : "text-base-content/70 hover:bg-base-200"
    }`;

  return (
    <div className="planning-summary-gate fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 overflow-y-auto">
      <div className="bg-base-100 rounded-2xl shadow-2xl border border-base-300 w-full max-w-[980px] flex flex-col max-h-[90vh] overflow-hidden text-base-content">
        {conflict && <div role="alert" className="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-5 py-3 text-xs text-amber-900">
          <span>มีผู้ใช้บันทึก Capacity ใหม่แล้ว กรุณาโหลดค่าล่าสุดและตรวจสอบก่อนแก้ไขอีกครั้ง</span>
          <button type="button" disabled={isSaving} className="btn btn-xs shrink-0" onClick={() => void loadConfigs()}>โหลดค่าล่าสุด (แทนที่ค่าที่ยังไม่บันทึก)</button>
        </div>}

        {/* Header: title + tabs + close */}
        <div className="flex items-center justify-between gap-3 px-5 pt-3.5 border-b border-base-300 bg-base-100">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#eef2ff] flex items-center justify-center text-[#4f46e5]">
                <Sliders size={16} />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-bold text-base-content">Capacity Configuration</div>
                <div className="text-[11px] text-base-content/50">Set normal capacity per gate, then mark special days</div>
              </div>
            </div>
            <div role="tablist" className="flex gap-1">
              {TABS.map(({ id, step, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  onClick={() => setActiveTab(id)}
                  className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2 pt-1 text-xs font-semibold transition-colors cursor-pointer ${
                    activeTab === id
                      ? "border-[#4f46e5] text-[#4f46e5]"
                      : "border-transparent text-base-content/55 hover:text-base-content"
                  }`}
                >
                  {step ? (
                    <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${activeTab === id ? "bg-[#4f46e5] text-white" : "bg-base-300 text-base-content/70"}`}>{step}</span>
                  ) : (
                    <Icon size={13} />
                  )}
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="self-start btn btn-xs btn-ghost btn-square h-8 w-8 rounded-lg text-base-content/60 hover:text-base-content cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* =========================================================
            TAB 1: STANDARD CAPACITY — one gate, one shift at a time
           ========================================================= */}
        {activeTab === "standard" && (
          <div className="flex flex-1 min-h-0 overflow-hidden bg-base-200/30" style={shiftTheme} data-capacity-shift={selectedShift}>
            {/* Gate list */}
            <div className="w-[170px] shrink-0 overflow-y-auto border-r border-base-300 bg-base-100 p-3 space-y-3">
              {(["FPC", "SMT"] as const).map((group) => (
                <div key={group}>
                  <div className="px-2 mb-1 text-[10px] font-bold uppercase tracking-wider text-base-content/45">{group} gates</div>
                  <div className="space-y-0.5">
                    {gateNames.filter((g) => configs[g].group === group).map((g) => {
                      const isActive = activeGate === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setSelectedGate(g)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            isActive ? "bg-primary text-primary-content shadow-xs" : "text-base-content/80 hover:bg-base-200"
                          }`}
                        >
                          <span>{g}</span>
                          <span className={`text-[10.5px] font-semibold ${isActive ? "text-primary-content/85" : "text-base-content/45"}`}>
                            {shortCap(calcGateCapacityMin(configs[g]))}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Settings */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 tabular-nums">
              {/* Gate header: name + shift + capacity */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="text-lg font-extrabold text-base-content">{activeGate}</div>
                  {shiftSwitch}
                </div>
                <div className="flex items-center gap-4 rounded-xl border border-[var(--shift-accent-border)] bg-[var(--shift-accent-soft)] px-4 py-2 text-right">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[color:var(--shift-accent-text)] opacity-80">{shiftLabel}</div>
                    <div className="text-sm font-extrabold text-[color:var(--shift-accent-text)]">{cfg.enabled ? formatMinutes(shiftCapMin) : "Off"}</div>
                  </div>
                  <div className="h-8 w-px bg-[var(--shift-accent-border)]" />
                  <div>
                    <div className="text-[10px] font-bold uppercase text-[color:var(--shift-accent-text)] opacity-80">Gate total / day</div>
                    <div className="text-base font-extrabold text-[color:var(--shift-accent-text)]">{formatMinutes(activeCapMin)}</div>
                  </div>
                </div>
              </div>

              {/* Section: Breaks */}
              <section className="rounded-2xl border border-base-300 bg-base-100 p-4">
                <div className="mb-3">
                  <div className="text-sm font-bold">Breaks</div>
                  <div className="text-[11px] text-base-content/50">Turned-on breaks are deducted from every shift</div>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <NumField
                    label="Break 1"
                    unit="min"
                    toggle={{ checked: cfg.break1, onChange: (c) => updateCurrentShift({ break1: c }) }}
                    value={cfg.break1Min}
                    onChange={(v) => updateCurrentShift({ break1Min: Number(v) })}
                  />
                  <NumField
                    label="Break 2"
                    unit="min"
                    toggle={{ checked: cfg.break2, onChange: (c) => updateCurrentShift({ break2: c }) }}
                    value={cfg.break2Min}
                    onChange={(v) => updateCurrentShift({ break2Min: Number(v) })}
                  />
                  <NumField
                    label="Lunch"
                    unit="min"
                    toggle={{ checked: cfg.lunch, onChange: (c) => updateCurrentShift({ lunch: c }) }}
                    value={cfg.lunchMin}
                    onChange={(v) => updateCurrentShift({ lunchMin: Number(v) })}
                  />
                </div>
              </section>

              {/* Section: Overtime */}
              <section className="rounded-2xl border border-base-300 bg-base-100 p-4">
                <div className="mb-3">
                  <div className="text-sm font-bold">Overtime (OT)</div>
                  <div className="text-[11px] text-base-content/50">
                    Default for every day · open OT on single dates in <button type="button" className="font-semibold text-[#4f46e5] underline-offset-2 hover:underline cursor-pointer" onClick={() => setActiveTab("special")}>② Special Days</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <NumField
                    label={cfg.otEnabled ? "OT open every day" : "OT closed by default"}
                    unit="min"
                    toggle={{ checked: cfg.otEnabled, onChange: (c) => updateCurrentShift({ otEnabled: c }) }}
                    value={cfg.otMinutes}
                    onChange={(v) => updateCurrentShift({ otMinutes: Number(v) })}
                  />
                </div>
              </section>

              {/* Section: Shift */}
              <section className="rounded-2xl border border-base-300 bg-base-100 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold">Shift</div>
                    <div className="text-[11px] text-base-content/50">Machines, people and working time of the {shiftLabel.toLowerCase()}</div>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold">
                    <input
                      type="checkbox"
                      aria-label="Enable selected shift"
                      checked={cfg.enabled}
                      onChange={(e) => updateCurrentShift({ enabled: e.target.checked })}
                      className="toggle toggle-sm toggle-primary"
                    />
                    {cfg.enabled ? "Shift active" : "Shift off"}
                  </label>
                </div>
                <div className={`grid grid-cols-1 gap-2.5 sm:grid-cols-3 ${cfg.enabled ? "" : "opacity-60"}`}>
                  <NumField
                    label="MC (lines)"
                    icon={<Folder size={13} />}
                    hint="Empty until known"
                    value={cfg.mcLines}
                    onChange={(v) => updateCurrentShift({ mcLines: optionalNumber(v) })}
                  />
                  <NumField
                    label="Manpower"
                    icon={<Users size={13} />}
                    value={cfg.manpower}
                    onChange={(v) => updateCurrentShift({ manpower: optionalNumber(v) })}
                  />
                  <NumField
                    label="Minutes / shift"
                    unit="min"
                    value={cfg.minPerShift}
                    onChange={(v) => updateCurrentShift({ minPerShift: Number(v) })}
                  />
                </div>
              </section>
            </div>
          </div>
        )}

        {/* =========================================================
            TAB 2: SPECIAL DAYS — gates → shifts → action → click dates
           ========================================================= */}
        {activeTab === "special" && (
          <div className="flex-1 min-h-0 overflow-y-auto bg-base-200/30 p-5 space-y-4 tabular-nums">
            {/* Steps 1–3 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <section className="rounded-2xl border border-base-300 bg-base-100 p-3.5">
                {stepTitle("1", "Gates")}
                <div role="group" aria-label="Override target gates" className="grid grid-cols-4 gap-0.5 rounded-lg border border-base-300 bg-base-200/50 p-0.5">
                  {(
                    [
                      { id: "gate", label: "One" },
                      { id: "FPC", label: "FPC" },
                      { id: "SMT", label: "SMT" },
                      { id: "all", label: "All" },
                    ] as const
                  ).map((t) => (
                    <button key={t.id} type="button" aria-pressed={gateScope === t.id} onClick={() => setGateScope(t.id)} className={segBtn(gateScope === t.id)}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {gateScope === "gate" ? (
                  <select
                    aria-label="Gate"
                    value={activeGate}
                    onChange={(e) => setSelectedGate(e.target.value)}
                    className="mt-2 h-8 w-full cursor-pointer rounded-lg border border-base-300 bg-base-100 px-2 text-xs font-semibold outline-none focus:border-[#4f46e5]"
                  >
                    {(["FPC", "SMT"] as const).map((group) => (
                      <optgroup key={group} label={`${group} gates`}>
                        {gateNames.filter((g) => configs[g].group === group).map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <div className="mt-2 text-[11px] leading-snug text-base-content/60">{targetGates.join(", ")}</div>
                )}
              </section>

              <section className="rounded-2xl border border-base-300 bg-base-100 p-3.5">
                {stepTitle("2", "Shifts")}
                <div role="group" aria-label="Override target shift" className="grid grid-cols-3 gap-0.5 rounded-lg border border-base-300 bg-base-200/50 p-0.5">
                  {OVERRIDE_TARGETS.map((t) => (
                    <button key={t.id} type="button" aria-pressed={overrideTarget === t.id} onClick={() => setOverrideTarget(t.id)} className={segBtn(overrideTarget === t.id)}>
                      {t.id === "both" ? "Both" : t.id === "day" ? "Day" : "Night"}
                    </button>
                  ))}
                </div>
                {offTargets.length > 0 && specialAction !== "off" && specialAction !== "clear" && (
                  <div className="mt-2 text-[11px] leading-snug text-amber-800">
                    {offTargets.join(", ")} {offTargets.length === 1 ? "is" : "are"} off by default — this opens it on the chosen dates only.
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-base-300 bg-base-100 p-3.5">
                {stepTitle("3", "Action")}
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { id: "ot", label: "Open OT", sub: isMultiGate ? `${targetGates.length} gates` : formatMinutes(overrideCapMin(true)), cls: "bg-amber-100 text-amber-900 border-amber-300" },
                      { id: "work", label: "Normal", sub: isMultiGate ? `${targetGates.length} gates` : formatMinutes(overrideCapMin(false)), cls: "bg-emerald-50 text-emerald-800 border-emerald-300" },
                      { id: "off", label: "Day Off", sub: "0 min", cls: "bg-slate-100 text-slate-500 border-slate-300" },
                      { id: "clear", label: "Clear", sub: "Back to normal", cls: "bg-base-100 text-base-content/70 border-base-300" },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={specialAction === item.id}
                      onClick={() => setSpecialAction(item.id)}
                      className={`rounded-lg border px-2.5 py-1.5 text-left transition-all cursor-pointer ${item.cls} ${
                        specialAction === item.id ? "ring-2 ring-[#4f46e5] ring-offset-1" : "opacity-75 hover:opacity-100"
                      }`}
                    >
                      <div className="text-xs font-bold">{item.label}</div>
                      <div className="text-[10px] opacity-75">{item.sub}</div>
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Step 4: calendar */}
            <section className="rounded-2xl border border-base-300 bg-base-100 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                {stepTitle("4", "Click dates", "click again to remove · hold and drag for several days")}
                <div className="flex items-center gap-1 rounded-lg border border-base-300 bg-base-200/50 px-1 py-0.5">
                  <button type="button" onClick={() => setMonthOffset((m) => m - 1)} title="Previous month" className="btn btn-xs btn-ghost btn-square h-6 w-6 rounded-md">
                    <ChevronLeft size={14} />
                  </button>
                  <span className="min-w-[110px] text-center text-xs font-bold">{currentMonth.format("MMMM YYYY")}</span>
                  <button type="button" onClick={() => setMonthOffset((m) => m + 1)} title="Next month" className="btn btn-xs btn-ghost btn-square h-6 w-6 rounded-md">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="select-none">
                <div className="grid grid-cols-7 gap-1.5 text-center text-[10.5px] font-bold text-base-content/45 mb-1.5">
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}
                  <span className="text-rose-500">Sun</span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 text-center text-xs" onMouseLeave={() => (paintModeRef.current = null)}>
                  {Array.from({ length: leadingEmptySlots }).map((_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const dateObj = currentMonth.date(d);
                    const date = dateObj.format("YYYY-MM-DD");
                    const isSun = dateObj.day() === 0;
                    const ov = overrideFor(date);
                    const dayOv = isMultiGate ? undefined : gateCfg.shifts.day.specialDays[date];
                    const nightOv = isMultiGate ? undefined : gateCfg.shifts.night.specialDays[date];
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-label={`${date}${ov ? ` · ${ov === "mix" ? "mixed" : SPECIAL_LABEL[ov]}` : ""}`}
                        title={isMultiGate ? dateObj.format("ddd DD/MM") : `${dateObj.format("ddd DD/MM")} · Day: ${dayOv ? SPECIAL_LABEL[dayOv] : "normal"} · Night: ${nightOv ? SPECIAL_LABEL[nightOv] : "normal"}`}
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          startPaint(date);
                        }}
                        onMouseEnter={() => continuePaint(date)}
                        onClick={(e) => {
                          // keyboard (Enter / Space) — mouse is handled by onMouseDown
                          if (e.detail === 0) startPaint(date);
                        }}
                        className={`h-12 rounded-lg font-bold text-xs transition-colors cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          ov === "ot"
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : ov === "work"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-300"
                            : ov === "off"
                            ? "bg-slate-100 text-slate-400 border border-slate-200"
                            : ov === "mix"
                            ? "bg-base-100 text-base-content border border-dashed border-base-content/40"
                            : isSun
                            ? "bg-rose-50/70 text-rose-500 hover:bg-rose-100/70"
                            : "bg-base-200/40 hover:bg-base-200 text-base-content"
                        }`}
                      >
                        <span className={ov === "off" ? "line-through" : ""}>{d}</span>
                        {ov && (
                          <span className="text-[9px] uppercase leading-none font-extrabold">
                            {ov === "mix" ? "mix" : SPECIAL_LABEL[ov]}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-base-content/55">
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-300" />OT</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-300" />Normal</span>
                  <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-300" />Off</span>
                  {(overrideTarget === "both" || isMultiGate) && (
                    <span><span className="mr-1 inline-block h-2 w-2 rounded-sm border border-dashed border-base-content/50" />Mix = {isMultiGate ? "gates / shifts" : "Day and Night"} differ</span>
                  )}
                </div>
                <span>
                  {scopeLabel} · {overrideTarget === "both" ? "both shifts" : `${overrideTarget} shift`} · {monthOverrideCount} special date(s) this month
                </span>
              </div>
            </section>
          </div>
        )}

        {/* =========================================================
            TAB 3: ALL GATES SUMMARY TABLE
           ========================================================= */}
        {activeTab === "table" && (
          <div className="flex-1 min-h-0 overflow-y-auto bg-base-200/30 p-5 tabular-nums space-y-3" style={shiftTheme} data-capacity-shift={selectedShift}>
            <div className="flex items-center justify-between gap-2">
              {shiftSwitch}
              <span className="text-[11px] text-base-content/50">Click a row to edit that gate</span>
            </div>
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
                          setActiveTab("standard");
                        }}
                        className="border-b border-base-200 hover:bg-base-200/40 cursor-pointer"
                      >
                        <td>
                          <span className="px-2 py-0.5 rounded bg-base-200 text-[11px] font-bold">{gate.group}</span>
                        </td>
                        <td className="font-bold text-[color:var(--shift-label-color)]">{gate.gate}</td>
                        <td className="font-semibold">{gCfg.mcLines ?? "-"}</td>
                        <td className="font-semibold text-base-content/75">{gCfg.manpower ?? "-"}</td>
                        <td className="whitespace-nowrap">
                          {shiftLabel}
                          <div className={`text-[10px] ${gCfg.enabled ? "text-success" : "text-base-content/50"}`}>
                            {gCfg.enabled ? "Active" : "Off"}
                          </div>
                        </td>
                        <td>{gCfg.minPerShift} min</td>
                        <td className="text-base-content/65">-{breaks} min</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${gCfg.otEnabled ? "bg-amber-100 text-amber-800" : "bg-base-200 text-base-content/50"}`}>
                            {gCfg.otEnabled ? `On (${gCfg.otMinutes}m)` : "Closed"}
                          </span>
                        </td>
                        <td className="font-bold text-base-content">{gCfg.enabled ? formatMinutes(norm) : "Off"}</td>
                        <td className="font-bold text-amber-700">{gCfg.enabled ? formatMinutes(withOt) : "Off"}</td>
                        <td className="font-bold text-[color:var(--shift-label-color)]">{formatMinutes(calcGateCapacityMin(gate))}</td>
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
          <span className={`text-xs ${isDirty ? "font-semibold text-amber-700" : "text-base-content/50"}`}>
            {isDirty ? "● Unsaved changes — Save stores standard capacity and special days together" : "No changes"}
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
              className="btn btn-sm h-8 px-5 border-0 bg-[#4f46e5] hover:bg-[#4338ca] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Compact setting tile: optional on/off toggle + number input with unit */
const NumField: React.FC<{
  label: string;
  value: number | null;
  onChange: (value: string) => void;
  unit?: string;
  hint?: string;
  icon?: React.ReactNode;
  toggle?: { checked: boolean; onChange: (checked: boolean) => void };
}> = ({ label, value, onChange, unit, hint, icon, toggle }) => {
  const off = toggle && !toggle.checked;
  return (
    <div className={`flex items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/40 px-3 py-2.5 ${off ? "opacity-60" : ""}`}>
      <div className="flex min-w-0 items-center gap-2">
        {toggle && (
          <input
            type="checkbox"
            aria-label={`Enable ${label}`}
            checked={toggle.checked}
            onChange={(e) => toggle.onChange(e.target.checked)}
            className="toggle toggle-xs toggle-primary"
          />
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 truncate text-xs font-bold text-base-content">
            {icon && <span className="text-base-content/50">{icon}</span>}
            {label}
          </div>
          {hint && <div className="text-[10.5px] text-base-content/45">{hint}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-base-300 bg-base-100 px-2 py-1">
        <input
          type="number"
          min={0}
          aria-label={label}
          placeholder="-"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-12 bg-transparent text-right text-xs font-bold focus:outline-none"
        />
        {unit && <span className="text-[10.5px] text-base-content/50">{unit}</span>}
      </div>
    </div>
  );
};
