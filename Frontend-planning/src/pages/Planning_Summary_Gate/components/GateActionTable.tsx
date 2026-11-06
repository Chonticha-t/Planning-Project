import React, { useState, useEffect, useMemo, useRef, useId, memo } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  Check,
} from "lucide-react";
import type { GridSortDirection, GridSortModel } from "@mui/x-data-grid";
import type { GateStatusFilter, PlanningSummaryGateRow } from "../types";
import { formatGateName } from "../gatePresentation";

interface GateActionTableProps {
  todayStr: string;
  gateName: string;
  rows: PlanningSummaryGateRow[];
  allRows?: PlanningSummaryGateRow[];
  actionTab: "all" | "today" | "in_gate" | "need_wip";
  onTabChange: (tab: "all" | "today" | "in_gate" | "need_wip") => void;
  statusFilter: GateStatusFilter;
  onStatusFilterChange: (status: GateStatusFilter) => void;
  currentProcessFilter: string;
  onCurrentProcessFilterChange: (process: string) => void;
  availableCurrentProcesses: string[];
  stats: {
    inGateLots: number;
    comingLots: number;
    needWipLots: number;
    lateLots?: number;
    totalLots: number;
    totalPcs: number;
  };
}

const formatGateState = (state?: string | null): string => {
  switch (state) {
    case "in_gate": return "In gate";
    case "coming": return "Coming";
    case "need_wip": return "Need WIP";
    case "passed": return "Passed";
    default: return state?.trim() || "-";
  }
};

const getGateStateClass = (state?: string | null): string => {
  switch (state) {
    case "in_gate": return "bg-blue-50 text-blue-700 border-blue-200";
    case "coming": return "bg-sky-100 text-sky-700 border-sky-300";
    case "need_wip": return "bg-orange-50 text-orange-800 border-orange-200";
    default: return "bg-base-200 text-base-content/70 border-base-300";
  }
};

// Ultra-fast string slice date formatters (avoids thousands of dayjs allocations per render)
const formatDateShort = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  return `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}/${dtStr.slice(2, 4)}`;
};

const formatDateFull = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  return `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}/${dtStr.slice(0, 4)}`;
};

// Compare calendar dates only; reject missing or invalid dates instead of showing zero.
const calendarDayNumber = (value?: string | null): number | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp / 86400000;
};

const getGateArrivalPresentation = (row: PlanningSummaryGateRow, todayStr: string) => {
  const gate = formatGateName(row.gate_name);
  if (row.gate_state === "in_gate" || row.gate_state === "passed") {
    return {
      label: null,
      colors: "text-[#40916C]",
      description: `${gate} · ${row.gate_state === "passed" ? "ผ่าน Gate แล้ว" : "อยู่ใน Gate แล้ว"}`,
    };
  }
  if (row.gate_state !== "coming" && row.gate_state !== "need_wip") {
    return {
      label: "—",
      colors: "text-slate-500",
      description: `${gate} · ${formatGateState(row.gate_state)} · ยังไม่มี Lot ที่กำลังเดินทางเข้า Gate`,
    };
  }
  const target = calendarDayNumber(row.arrive_by);
  const today = calendarDayNumber(todayStr);
  const days = target !== null && today !== null ? target - today : null;
  return {
    label: days === null ? "—" : days === 0 ? "Today" : `${days < 0 ? "−" : ""}${Math.abs(days)}d`,
    colors: days === null ? "text-slate-500"
      : days < 0 ? "text-[#9F0202]"
      : days === 0 ? "text-[#DA4848]"
      : days === 1 ? "text-[#EB5E28]"
      : days === 2 ? "text-[#F27F34]"
      : days === 3 ? "text-[#F9A03F]"
      : days === 4 ? "text-[#FFA62B]"
      : "text-[#2E5AA7]",
    description: days === null
      ? `ยังไม่มีวันที่เข้า ${gate} ตามแผนที่ใช้คำนวณได้`
      : `กำหนดเข้า ${gate}: ${formatDateFull(row.arrive_by)} · ${days < 0 ? `เลยกำหนด ${Math.abs(days)} วัน` : days === 0 ? "ถึงกำหนดวันนี้" : `เหลือ ${days} วันปฏิทิน`}`,
  };
};

const formatScanTime = (dtStr?: string | null) => {
  if (!dtStr || dtStr.length < 10) return "-";
  const datePart = `${dtStr.slice(8, 10)}/${dtStr.slice(5, 7)}/${dtStr.slice(2, 4)}`;
  const time = dtStr.length >= 16 ? dtStr.slice(11, 16) : "";
  return time ? `${datePart} ${time}` : datePart;
};

const addDaysIso = (isoDate: string, deltaDays: number): string => {
  const ms = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Date(ms + deltaDays * 86400000).toISOString().slice(0, 10);
};

interface RouteStepNode {
  gateRaw: string;
  gateLabel: string;
  dateFull: string;
  leadDays: number | null;
  isCurrentGate: boolean;
  isSelectedGate: boolean;
}

const buildLotRouteSteps = (
  row: PlanningSummaryGateRow,
  sourcePool: PlanningSummaryGateRow[],
  selectedGateName: string
): RouteStepNode[] => {
  const isNeedWip =
    row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip";
  const lotTrimmed = row.lot_no?.trim() ?? "";

  let candidates: PlanningSummaryGateRow[] = [];

  if (!isNeedWip && lotTrimmed) {
    // Match all gate stages for this lot across the entire unfiltered dataset
    candidates = sourcePool.filter(
      (r) => r.prd_name === row.prd_name && (r.lot_no?.trim() ?? "") === lotTrimmed
    );
  } else {
    // For NEED WIP, match all gate stages of this product + due_date
    candidates = sourcePool.filter(
      (r) =>
        r.prd_name === row.prd_name &&
        (r.lot_no === "NEED WIP" || r.gate_state === "need_wip" || r.status === "need wip") &&
        r.due_date === row.due_date
    );
  }

  if (candidates.length === 0) {
    candidates = [row];
  }

  // Deduplicate by gate_name, preferring matching due_date & qty, then closest pri
  const byGate = new Map<string, PlanningSummaryGateRow>();
  for (const c of candidates) {
    const existing = byGate.get(c.gate_name);
    if (!existing) {
      byGate.set(c.gate_name, c);
      continue;
    }
    const cSameDue = c.due_date === row.due_date ? 1 : 0;
    const exSameDue = existing.due_date === row.due_date ? 1 : 0;
    if (cSameDue !== exSameDue) {
      if (cSameDue > exSameDue) byGate.set(c.gate_name, c);
      continue;
    }
    const cSameQty = c.qty === row.qty ? 1 : 0;
    const exSameQty = existing.qty === row.qty ? 1 : 0;
    if (cSameQty !== exSameQty) {
      if (cSameQty > exSameQty) byGate.set(c.gate_name, c);
      continue;
    }
    if (Math.abs((c.pri || 0) - (row.pri || 0)) < Math.abs((existing.pri || 0) - (row.pri || 0))) {
      byGate.set(c.gate_name, c);
    }
  }

  // If this lot is already mid-route and earlier/later gates of the same product routing exist in sourcePool,
  // include those stages so the timeline always shows the complete stage sequence.
  const productRouteRows = sourcePool.filter(
    (r) =>
      r.prd_name === row.prd_name &&
      (!row.routing_case || !r.routing_case || r.routing_case === row.routing_case)
  );
  const templateByGate = new Map<string, PlanningSummaryGateRow>();
  for (const pr of productRouteRows) {
    const ex = templateByGate.get(pr.gate_name);
    if (!ex || (pr.gate_order || 999) < (ex.gate_order || 999)) {
      templateByGate.set(pr.gate_name, pr);
    }
  }

  // Merge any missing stages from the product's route template
  for (const [gName, tmpl] of templateByGate.entries()) {
    if (!byGate.has(gName)) {
      byGate.set(gName, {
        ...row,
        gate_name: gName,
        gate_order: tmpl.gate_order,
        next_gate: tmpl.next_gate,
        lead_days: tmpl.lead_days,
        arrive_by: gName === row.first_gate ? (row.start_by ?? null) : null,
        start_by: gName === row.first_gate ? (row.start_by ?? null) : null,
        must_out: "",
      });
    }
  }

  const sortedGates = Array.from(byGate.values()).sort(
    (a, b) => (a.gate_order || 0) - (b.gate_order || 0)
  );

  // Extract raw ISO dates per stage and back-fill / forward-fill any missing stage dates using lead_days
  const rawDates: (string | null)[] = sortedGates.map(
    (g) => g.arrive_by || g.start_by || g.must_out || null
  );

  // Back-fill earlier stages if an upstream stage was reconstructed from template
  for (let i = rawDates.length - 2; i >= 0; i--) {
    if (!rawDates[i] && rawDates[i + 1]) {
      const lead = Number(sortedGates[i].lead_days) || 0;
      rawDates[i] = addDaysIso(rawDates[i + 1]!, -lead);
    }
  }
  // Forward-fill later stages if needed
  for (let i = 1; i < rawDates.length; i++) {
    if (!rawDates[i] && rawDates[i - 1]) {
      const lead = Number(sortedGates[i - 1].lead_days) || 0;
      rawDates[i] = addDaysIso(rawDates[i - 1]!, lead);
    }
  }

  return sortedGates.map((g, idx) => ({
    gateRaw: g.gate_name,
    gateLabel: formatGateName(g.gate_name) || g.gate_name,
    dateFull: formatDateFull(rawDates[idx]),
    leadDays: g.lead_days != null ? Number(g.lead_days) : null,
    isCurrentGate: !isNeedWip && Boolean(row.current_gate && row.current_gate === g.gate_name),
    isSelectedGate: g.gate_name === selectedGateName,
  }));
};

const PAGE_SIZE = 50;

const SORT_OPTIONS = [
  { key: "default", label: "Default (Priority)" },
  { key: "prd_name", label: "PRODUCT NAME" },
  { key: "due_date", label: "PO DUE DATE" },
  { key: "lot_no", label: "LOT NO" },
  { key: "cal_net_required", label: "NET REQUIRED" },
  { key: "net_wip_qty", label: "NET WIP" },
  { key: "proc_disp", label: "CURRENT PROCESS" },
  { key: "scan_in", label: "SCAN-IN TIME" },
] as const;

type SortKey = typeof SORT_OPTIONS[number]["key"];
const textCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// Match displayed values; missing values always sort last in either direction.
const getSortValue = (row: PlanningSummaryGateRow, key: Exclude<SortKey, "default">): string | number | null => {
  if (key === "cal_net_required" || key === "net_wip_qty") {
    const raw = row[key];
    if (raw == null || String(raw).trim() === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  const isNeedWip = row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip";
  if (key === "lot_no" && isNeedWip) return "NEED WIP";
  if (key === "proc_disp") {
    if (isNeedWip) return null;
    return [row.proc_disp?.trim(), row.current_gate?.trim()].filter(Boolean).join(" ") || null;
  }
  return row[key]?.trim() || null;
};

const GATE_SORT_OPTIONS = SORT_OPTIONS.filter((option) => option.key !== "default")
  .map((option) => ({ field: option.key, label: option.label }));

const GateSortByDropdown = ({
  sortModel,
  onSortModelChange,
}: {
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const activeField = sortModel[0]?.field ?? "";
  const activeDir: NonNullable<GridSortDirection> = sortModel[0]?.sort ?? "desc";

  const [draftField, setDraftField] = useState<string>(activeField);
  const [draftDir, setDraftDir] = useState<"asc" | "desc">(activeDir);

  useEffect(() => {
    setDraftField(activeField);
    setDraftDir(activeDir);
  }, [activeField, activeDir, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeLabel = GATE_SORT_OPTIONS.find((o) => o.field === activeField)?.label;

  const handleClear = () => {
    setDraftField("");
    setDraftDir("desc");
    onSortModelChange([]);
  };

  const handleConfirm = () => {
    if (draftField) {
      onSortModelChange([{ field: draftField, sort: draftDir }]);
    } else {
      onSortModelChange([]);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative" onKeyDown={(event) => {
      if (event.key === "Escape") {
        setOpen(false);
        wrapRef.current?.querySelector("button")?.focus();
      }
    }}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((prev) => !prev)}
        className={`btn btn-sm bg-base-100 text-base-content text-[13px] gap-1.5 font-medium shadow-none hover:bg-base-200/60 rounded-lg focus:outline-none transition-colors border whitespace-nowrap ${
          open
            ? "border-primary bg-primary/5 text-primary"
            : activeField
            ? "border-primary/50 text-primary bg-primary/5"
            : "border-base-content/20 hover:border-base-content/30"
        }`}
      >
        {activeField ? (
          activeDir === "asc" ? (
            <ArrowUp size={14} className="text-primary" />
          ) : (
            <ArrowDown size={14} className="text-primary" />
          )
        ) : (
          <ArrowUpDown size={14} className="opacity-50" />
        )}
        <span>{activeLabel ? `Sort: ${activeLabel}` : "Sort by"}</span>
        <ChevronDown
          size={13}
          className={`opacity-50 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div role="dialog" aria-label="Sort lots" className="absolute left-0 z-50 mt-1.5 w-60 rounded-xl border border-base-200 bg-base-100 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-base-200 bg-base-200/30">
            <span className="text-[12px] font-semibold text-base-content/70 uppercase tracking-wider">
              Sort by
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-medium text-error hover:opacity-80 cursor-pointer"
            >
              Clear
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto px-2 py-1.5 flex flex-col gap-0.5">
            {GATE_SORT_OPTIONS.map((opt) => {
              const checked = draftField === opt.field;
              return (
                <button
                  key={opt.field}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => setDraftField(checked ? "" : opt.field)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg hover:bg-base-200/70 text-left transition-colors cursor-pointer"
                >
                  <span
                    className={`flex size-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      checked
                        ? "border-primary bg-primary text-primary-content"
                        : "border-base-300 bg-transparent"
                    }`}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span
                    className={`text-[13px] ${
                      checked
                        ? "font-semibold text-primary"
                        : "text-base-content/80 font-medium"
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-base-200 px-2.5 py-2 flex flex-col gap-1 bg-base-200/20">
            <button
              type="button"
              aria-pressed={draftDir === "asc"}
              onClick={() => setDraftDir("asc")}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
                draftDir === "asc"
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-transparent text-base-content/70 hover:bg-base-200 font-medium"
              }`}
            >
              <ArrowUp size={14} />
              <span>Ascending</span>
            </button>

            <button
              type="button"
              aria-pressed={draftDir === "desc"}
              onClick={() => setDraftDir("desc")}
              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer border ${
                draftDir === "desc"
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-transparent text-base-content/70 hover:bg-base-200 font-medium"
              }`}
            >
              <ArrowDown size={14} />
              <span>Descending</span>
            </button>
          </div>

          <div className="p-2.5 pt-1.5 border-t border-base-200">
            <button
              type="button"
              onClick={handleConfirm}
              className="btn btn-sm btn-primary w-full rounded-lg font-medium text-xs shadow-xs cursor-pointer"
            >
              Apply Sort
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const GateFilterDropdown = ({ label, value, options, active, width, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  active: boolean;
  width: string;
  onChange: (value: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    wrapperRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus({ preventScroll: true });
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div ref={wrapperRef} className={`relative ${width}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          buttonRef.current?.focus();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!open) { setOpen(true); return; }
          const items = Array.from(wrapperRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') || []);
          if (!items.length) return;
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus({ preventScroll: true });
        }
      }}
    >
      <button ref={buttonRef} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={`btn btn-sm h-8 min-h-0 w-full justify-between rounded-lg border bg-base-100 text-[13px] font-medium shadow-none hover:bg-base-200 focus-visible:outline-primary ${open ? "border-primary text-primary" : active ? "border-primary/50 text-primary" : "border-base-content/20 hover:border-base-content/30 text-base-content"}`}
      >
        <span className="truncate">{options.find((option) => option.value === value)?.label || value}</span>
        <ChevronDown size={13} className={`shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label}
          className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full min-w-max overflow-y-auto rounded-lg border border-base-300 bg-base-100 p-1 shadow-lg"
          style={{ backgroundColor: "var(--color-base-100, #ffffff)", opacity: 1 }}
        >
          {options.map((option) => (
            <button key={option.value} type="button" role="menuitemradio" aria-checked={option.value === value}
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-[13px] hover:bg-base-200 focus:bg-base-200 focus:outline-none ${option.value === value ? "font-semibold text-primary" : "text-base-content"}`}
              onClick={() => { onChange(option.value); setOpen(false); buttonRef.current?.focus(); }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const GateActionTable: React.FC<GateActionTableProps> = memo(({
  todayStr,
  gateName,
  rows,
  allRows,
  actionTab,
  onTabChange,
  statusFilter,
  onStatusFilterChange,
  currentProcessFilter,
  onCurrentProcessFilterChange,
  availableCurrentProcesses,
  stats,
}) => {
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [activePopover, setActivePopover] = useState<{
    rowKey: string;
    row: PlanningSummaryGateRow;
    top: number;
    right: number;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Reset to page 1 when gate, tab, or row count changes
  useEffect(() => {
    setPage(1);
    setActivePopover(null);
  }, [gateName, actionTab, statusFilter, currentProcessFilter, rows.length]);

  // Close floating popover on outside click, Escape, scroll, or resize
  useEffect(() => {
    if (!activePopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (popoverRef.current?.contains(target as Node)) return;
      if (target?.closest("[data-gate-stage-btn]")) return;
      setActivePopover(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActivePopover(null);
    };
    const handleClose = () => setActivePopover(null);

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [activePopover]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const sortedRows = useMemo(() => {
    if (sortKey === "default") return rows;
    const direction = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const left = getSortValue(a, sortKey);
      const right = getSortValue(b, sortKey);
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      return direction * (typeof left === "number" && typeof right === "number"
        ? left - right
        : textCollator.compare(String(left), String(right)));
    });
  }, [rows, sortKey, sortDirection]);

  const visibleRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page]);

  const totalFilteredPcs = useMemo(() => {
    let sum = 0;
    for (let i = 0; i < rows.length; i++) {
      sum += Number(rows[i].qty) || 0;
    }
    return sum;
  }, [rows]);

  const sourcePool = allRows && allRows.length > 0 ? allRows : rows;

  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Table Header: Section title, action tabs, total lots badge, and pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-200 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">
              Gate Lot Details • <span className="text-primary">{gateName}</span>
            </h3>
          </div>

          {/* Sub-filter tabs */}
          <div className="inline-flex h-8 items-center gap-0.5 bg-base-200/80 p-0.5 rounded-lg border border-base-300 text-xs">
            <button
              type="button"
              onClick={() => onTabChange("today")}
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold transition-all ${
                actionTab === "today"
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              Arriving today
            </button>
            <button
              type="button"
              onClick={() => onTabChange("all")}
              className={`btn btn-xs h-full min-h-0 rounded-md px-2.5 font-semibold transition-all ${
                actionTab === "all"
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              All + overdue
            </button>
          </div>

          {/* Match Planning Summary's draft selection and Apply/Clear controls. */}
          <GateSortByDropdown
            sortModel={sortKey === "default" ? [] : [{ field: sortKey, sort: sortDirection }]}
            onSortModelChange={(model) => {
              const selected = model[0];
              const option = SORT_OPTIONS.find((item) => item.key === selected?.field);
              setSortKey(option?.key ?? "default");
              setSortDirection(selected?.sort === "asc" ? "asc" : "desc");
              setPage(1);
            }}
          />

            <GateFilterDropdown
              label="Filter by status"
              width="w-36"
              active={statusFilter !== "all"}
              value={statusFilter}
              options={[
                { value: "all", label: "All statuses" },
                { value: "in_gate", label: "In gate" },
                { value: "coming", label: "Coming" },
                { value: "need_wip", label: "Need WIP" },
              ]}
              onChange={(value) => {
                if (value === "all" || value === "in_gate" || value === "coming" || value === "need_wip") {
                  setPage(1);
                  setActivePopover(null);
                  onStatusFilterChange(value);
                }
              }}
            />

          <GateFilterDropdown
            label="Filter by current process"
            width="w-48"
            active={Boolean(currentProcessFilter)}
            value={currentProcessFilter}
            options={[
              { value: "", label: "All current processes" },
              ...(currentProcessFilter && !availableCurrentProcesses.includes(currentProcessFilter)
                ? [{ value: currentProcessFilter, label: currentProcessFilter }] : []),
              ...availableCurrentProcesses.map((process) => ({ value: process, label: process })),
            ]}
            onChange={(value) => {
              if (value === "" || availableCurrentProcesses.includes(value)) {
                setPage(1);
                setActivePopover(null);
                onCurrentProcessFilterChange(value);
              }
            }}
          />

          {/* Total Counter Badge */}
          <div className="badge badge-sm badge-ghost font-bold text-xs tabular-nums text-base-content/80">
            {rows.length.toLocaleString()} lots • {totalFilteredPcs.toLocaleString()} pcs
          </div>
        </div>

        {/* Fast Page Switcher */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base-content/60 font-medium tabular-nums">
              Page {page} of {totalPages}
            </span>
            <div className="join border border-base-300 rounded-lg">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="table table-sm table-fixed w-full min-w-[1240px] text-center border-collapse [&_th]:text-center [&_td]:text-center [&_td:first-child:not([colspan])]:text-left [&_th]:px-3 [&_th]:py-3 [&_th]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_td]:break-words [&_th:not(:last-child)]:border-r [&_th:not(:last-child)]:border-base-300 [&_td:not(:last-child)]:border-r [&_td:not(:last-child)]:border-base-300/60">
          <colgroup>
            <col style={{ width: 176 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 164 }} />
            <col style={{ width: 121 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 154 }} />
            <col style={{ width: 121 }} />
            <col style={{ width: 88 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr className="bg-base-200/70 border-b border-base-300 text-[12.5px] font-bold tracking-[0.04em] text-base-content">
              <th className="px-2 py-2">PRODUCT NAME</th>
              <th className="px-2 py-2">PO DUE DATE</th>
              <th className="px-2 py-2">LOT NO</th>
              <th className="px-2 py-2">NET REQUIRED</th>
              <th className="px-2 py-2">NET WIP</th>
              <th className="px-2 py-2 whitespace-nowrap">CURRENT PROCESS</th>
              <th className="px-2 py-2">SCAN-IN TIME</th>
              <th className="px-2 py-2">STATUS</th>
              <th className="px-2 py-2">GATE ARRIVAL</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-10 text-base-content/50 text-sm">
                  No lots found for the selected gate and criteria.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, rIdx) => {
                const isNeedWip =
                  row.lot_no === "NEED WIP" || row.gate_state === "need_wip" || row.status === "need wip";
                const currentProcess = row.proc_disp?.trim() ?? "";
                const currentGate = row.current_gate?.trim() ?? "";
                const lotStatus = row.lot_status?.trim() ?? "";
                const netRequired = row.cal_net_required == null
                  ? null
                  : Number(row.cal_net_required);
                const netWip = row.net_wip_qty == null ? null : Number(row.net_wip_qty);

                const rowKey = `${row.pri}-${row.lot_no}-${row.gate_name}-${rIdx}`;
                const isExpanded = activePopover?.rowKey === rowKey;
                const arrival = getGateArrivalPresentation(row, todayStr);
                const toggleTimeline = (event: React.MouseEvent<HTMLButtonElement>) => {
                  if (isExpanded) {
                    setActivePopover(null);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  const top = Math.max(40, Math.min(window.innerHeight - 40, rect.top + rect.height / 2));
                  const right = Math.max(12, window.innerWidth - rect.left + 10);
                  setActivePopover({ rowKey, row, top, right });
                };

                return (
                  <tr
                    key={rowKey}
                    className={`border-b border-base-300/50 hover:bg-base-200/40 text-[14px] leading-5 transition-colors ${
                      isExpanded ? "bg-[#eef2ff]/50" : ""
                    }`}
                  >
                    {/* PRODUCT NAME */}
                    <td className="px-2 py-2">
                      <span className="font-semibold text-[15px] text-base-content">{row.prd_name}</span>
                    </td>

                    {/* PO DUE DATE */}
                    <td className="font-medium text-[13.5px] text-base-content tabular-nums px-2 py-2">
                      {formatDateShort(row.due_date)}
                    </td>

                    {/* LOT NO */}
                    <td className="px-2 py-2">
                      {isNeedWip ? (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                          NEED WIP
                        </span>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          <span className="font-mono font-bold text-[15px] tracking-wide tabular-nums text-base-content select-all">
                            {row.lot_no}
                          </span>
                          {lotStatus && (
                            <span className="inline-flex items-center shrink-0 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-600 text-[10.5px] font-semibold tracking-wide uppercase leading-none">
                              {lotStatus}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Use the same Net Required field as Planning Summary. */}
                    <td className="tabular-nums px-2 py-2">
                      <span className={`text-[14px] ${netRequired !== null && Number.isFinite(netRequired) ? "font-bold text-error" : "text-base-content/25"}`}>
                        {netRequired !== null && Number.isFinite(netRequired)
                          ? netRequired.toLocaleString("en-US", { maximumFractionDigits: 0 })
                          : "-"}
                      </span>
                    </td>

                    {/* Net WIP from the gate API, including zero quantities. */}
                    <td className="tabular-nums px-2 py-2">
                      <span className={`text-[14px] ${netWip !== null && Number.isFinite(netWip) ? "font-semibold text-emerald-600" : "text-base-content/25"}`}>
                        {netWip !== null && Number.isFinite(netWip)
                          ? netWip.toLocaleString("en-US", { maximumFractionDigits: 0 })
                          : "-"}
                      </span>
                    </td>

                    {/* Current lot location is independent of this row's planned transition. */}
                    <td className="px-2 py-2">
                      {isNeedWip ? (
                        <span className="text-base-content/25">-</span>
                      ) : currentProcess || currentGate ? (
                        <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                          {currentProcess && (
                            <span className="font-semibold text-[13.5px] text-base-content">
                              {currentProcess}
                            </span>
                          )}
                          {currentGate && (
                            <span className="inline-flex items-center shrink-0 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/80 text-slate-600 text-[10.5px] font-semibold tracking-wide uppercase leading-none">
                              {currentGate}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-base-content/25">-</span>
                      )}
                    </td>

                    {/* SCAN-IN TIME */}
                    <td className="font-medium text-[13.5px] text-base-content/85 tabular-nums px-2 py-2">
                      {formatScanTime(row.scan_in)}
                    </td>

                    {/* STATUS from this gate stage, independent of the lot's general status. */}
                    <td className="font-semibold text-[13px] text-base-content/85 whitespace-nowrap px-2 py-2">
                      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[12px] font-semibold leading-none ${getGateStateClass(row.gate_state)}`}>
                        {formatGateState(row.gate_state)}
                      </span>
                    </td>

                    {/* GATE ARRIVAL: ticket opens the same timeline as the stage button. */}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center">
                          <button
                            type="button"
                            data-gate-stage-btn="true"
                            onClick={toggleTimeline}
                            aria-label={`${arrival.description} · ดู Gate Timeline`}
                            aria-expanded={isExpanded}
                            className={`inline-flex h-6 w-[88px] items-stretch overflow-hidden rounded-md border border-current/20 bg-current/5 shadow-xs transition-[filter,box-shadow] hover:brightness-95 hover:shadow-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${arrival.colors} ${isExpanded ? "ring-2 ring-indigo-400/50 ring-offset-1" : ""}`}
                          >
                            <span className="inline-flex w-10 shrink-0 items-center justify-center bg-current px-1">
                              <span className="truncate text-[10px] font-bold tracking-wide text-white">{formatGateName(row.gate_name) || "—"}</span>
                            </span>
                            <span className="inline-flex min-w-0 flex-1 items-center justify-center px-1 text-[11px] font-bold tabular-nums whitespace-nowrap">
                              {arrival.label === null ? <Check size={12} aria-hidden="true" /> : arrival.label}
                            </span>
                          </button>
                      </div>
                    </td>

                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Summary Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* In Gate Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0" />
            <span className="font-semibold text-base-content/70">IN GATE (Ready):</span>
            <strong className="text-sm font-black text-blue-600 tabular-nums">
              {stats.inGateLots} lots
            </strong>
          </div>

          {/* Coming Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-600 shrink-0" />
            <span className="font-semibold text-base-content/70">COMING (Upstream Gate):</span>
            <strong className="text-sm font-black text-cyan-600 tabular-nums">
              {stats.comingLots} lots
            </strong>
          </div>

          {/* Need WIP Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-base-300 bg-base-100 shadow-2xs text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-600 shrink-0" />
            <span className="font-semibold text-base-content/70">NEED WIP (Unreleased):</span>
            <strong className="text-sm font-black text-amber-600 tabular-nums">
              {stats.needWipLots} lots
            </strong>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-base-content/60 font-medium tabular-nums">
              Showing {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <div className="join border border-base-300 rounded-lg">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-xs btn-ghost join-item px-2"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Popover for Step Gate Line */}
      {activePopover &&
        typeof document !== "undefined" &&
        createPortal(
          (() => {
            const routeSteps = buildLotRouteSteps(activePopover.row, sourcePool, gateName);
            return (
              <div
                ref={popoverRef}
                role="dialog"
                aria-label="Gate stage timeline"
                style={{
                  position: "fixed",
                  top: activePopover.top,
                  right: activePopover.right,
                  transform: "translateY(-50%)",
                }}
                className="z-[9999] rounded-xl bg-white border border-slate-200/90 shadow-xl px-3.5 py-2.5 max-w-[calc(100vw-32px)]"
              >
                {/* Right-pointing Caret Arrow to the Button */}
                <div className="w-2.5 h-2.5 bg-white border-t border-r border-slate-200/90 rotate-45 absolute -right-[6px] top-1/2 -translate-y-1/2" />

                <div className="flex items-center overflow-x-auto overflow-y-hidden">
                  <div className="inline-flex items-start">
                    {routeSteps.map((step, sIdx) => {
                      const isFirst = sIdx === 0;
                      const isLast = sIdx === routeSteps.length - 1;
                      const isHighlighted = step.isCurrentGate || step.isSelectedGate;

                      return (
                        <div key={`${step.gateRaw}-${sIdx}`} className="inline-flex items-start">
                          {/* Compact Gate Node Column */}
                          <div className="flex flex-col items-center w-[64px]">
                            {/* Top Track (h-5) with continuous horizontal line behind Gate Pill */}
                            <div className="relative flex items-center justify-center w-full h-5">
                              {!isFirst && (
                                <div className="absolute left-0 right-1/2 top-1/2 -translate-y-1/2 h-[1.5px] bg-slate-300" />
                              )}
                              {!isLast && (
                                <div className="absolute left-1/2 right-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-slate-300" />
                              )}
                              <span
                                className={`relative z-10 inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold tracking-wide leading-none border transition-all ${
                                  step.isCurrentGate
                                    ? "bg-[#4f46e5] border-[#4f46e5] text-white shadow-2xs"
                                    : isHighlighted
                                      ? "bg-[#eef2ff] border-indigo-300 text-[#4f46e5]"
                                      : "bg-white border-slate-200 text-slate-700"
                                }`}
                              >
                                {step.gateLabel}
                              </span>
                            </div>

                            {/* Target Date (DD/MM/YYYY) */}
                            <div
                              className={`mt-1 text-[10px] tabular-nums leading-none tracking-tight ${
                                isHighlighted
                                  ? "text-[#4f46e5] font-bold"
                                  : "text-slate-600 font-medium"
                              }`}
                            >
                              {step.dateFull}
                            </div>
                          </div>

                          {/* Unbroken Connector Line */}
                          {!isLast && (
                            <div className="relative flex items-center justify-center w-4 h-5 shrink-0">
                              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1.5px] bg-slate-300" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
});
