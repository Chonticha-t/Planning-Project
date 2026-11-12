import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { Check, GripVertical } from "lucide-react";
import type {
  CountUnit,
  FinishedTodaySummary,
  InGateGate,
  InGateLot,
  OrderBy,
  WorkMode,
} from "../types";
import { GATE_SUBSTEPS, PCS_PER_SHEET } from "../mock/inGateMockData";
import { computeQueueEtas, moveItem, splitByCapacity } from "../utils";
import { GateRoutePopover } from "./GateRoutePopover";

// Same shift chip palette as MonthlySummary.tsx
const DS_CHIP = "bg-[#fdecb3] text-[#8a5a00]";
const NS_CHIP = "bg-[#e9e3fb] text-[#5a3fc0]";

type TableFilter = "all" | "queue" | "finished";

interface WorkListTableProps {
  planOrder: InGateLot[]; // committed (draft) order
  capacityMin: number;
  orderBy: OrderBy;
  search: string;
  onMove: (lotId: string, toIndex: number) => void;
  currentGate: InGateGate;
  routeGates: InGateGate[];
  finishedToday: FinishedTodaySummary;
  workMode: WorkMode;
  unit: CountUnit;
}

export const WorkListTable: React.FC<WorkListTableProps> = ({
  planOrder,
  capacityMin,
  orderBy,
  search,
  onMove,
  currentGate,
  routeGates,
  finishedToday,
  workMode,
  unit,
}) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [tableFilter, setTableFilter] = useState<TableFilter>("queue");

  // Keep the route process detail popover closed by default until clicked
  const [openRouteLotId, setOpenRouteLotId] = useState<string | null>(null);

  useEffect(() => {
    setOpenRouteLotId(null);
  }, [currentGate.id]);

  const q = search.trim().toLowerCase();
  const canReorder =
    workMode === "edit" &&
    orderBy === "plan" &&
    !q &&
    tableFilter !== "finished";

  // Convert finishedToday summary lots into full InGateLot rows so they render in the full 9-column table
  const finishedFullLots = useMemo<InGateLot[]>(() => {
    const defs = GATE_SUBSTEPS[currentGate.id] ?? [
      { code: `${currentGate.name}-01`, name: "Preparation" },
      { code: `${currentGate.name}-02`, name: "Main process" },
      { code: `${currentGate.name}-03`, name: "Inspection" },
    ];
    const gIdx = routeGates.findIndex((g) => g.id === currentGate.id);
    const nextGate =
      gIdx >= 0 && gIdx < routeGates.length - 1
        ? routeGates[gIdx + 1].name
        : "FG Ship";
    const mustOutDate = planOrder[0]?.mustOut
      ? dayjs(planOrder[0].mustOut).subtract(1, "day").format("YYYY-MM-DD")
      : dayjs().format("YYYY-MM-DD");

    const dsRaw = finishedToday.lots.filter((l) => l.shift === "D/S");
    const nsRaw = finishedToday.lots.filter((l) => l.shift === "N/S");
    const dsTargetTotalMin = 608;
    const nsTargetTotalMin = 216;

    let dsAcc = 0;
    const dsMapped: InGateLot[] = dsRaw.map((fl, i) => {
      const isLast = i === dsRaw.length - 1;
      const each = Math.round(dsTargetTotalMin / Math.max(1, dsRaw.length));
      const min = isLast ? Math.max(30, dsTargetTotalMin - dsAcc) : each;
      dsAcc += min;
      const sheet = Math.ceil(fl.qty / PCS_PER_SHEET);
      return {
        id: fl.id,
        product: fl.product,
        qty: fl.qty,
        sheet,
        outputPcs: fl.qty,
        outputSheet: sheet,
        minutes: min,
        mustOut: mustOutDate,
        status: "done",
        shiftSection: "day",
        outAt: fl.outAt,
        stepNow: defs.length,
        stepTotal: defs.length,
        fromGate: currentGate.name,
        nextGate,
        currentProcCode: defs[defs.length - 1]?.code,
        currentProcName: defs[defs.length - 1]?.name,
        gateSteps: defs.map((d) => ({
          code: d.code,
          name: d.name,
          status: "done" as const,
        })),
      };
    });

    let nsAcc = 0;
    const nsMapped: InGateLot[] = nsRaw.map((fl, i) => {
      const isLast = i === nsRaw.length - 1;
      const each = Math.round(nsTargetTotalMin / Math.max(1, nsRaw.length));
      const min = isLast ? Math.max(30, nsTargetTotalMin - nsAcc) : each;
      nsAcc += min;
      const sheet = Math.ceil(fl.qty / PCS_PER_SHEET);
      return {
        id: fl.id,
        product: fl.product,
        qty: fl.qty,
        sheet,
        outputPcs: fl.qty,
        outputSheet: sheet,
        minutes: min,
        mustOut: mustOutDate,
        status: "done",
        shiftSection: "night",
        outAt: fl.outAt,
        stepNow: defs.length,
        stepTotal: defs.length,
        fromGate: currentGate.name,
        nextGate,
        currentProcCode: defs[defs.length - 1]?.code,
        currentProcName: defs[defs.length - 1]?.name,
        gateSteps: defs.map((d) => ({
          code: d.code,
          name: d.name,
          status: "done" as const,
        })),
      };
    });

    return [...dsMapped, ...nsMapped];
  }, [currentGate.id, currentGate.name, finishedToday.lots, planOrder, routeGates]);

  // Order shown while dragging (dragged lot sits at the hover position as a drop slot)
  const previewOrder = useMemo(() => {
    if (!dragId || overIndex === null) return planOrder;
    return moveItem(
      planOrder,
      planOrder.findIndex((l) => l.id === dragId),
      overIndex
    );
  }, [planOrder, dragId, overIndex]);

  const planIndexById = useMemo(
    () => new Map(previewOrder.map((l, i) => [l.id, i])),
    [previewOrder]
  );

  const combinedOrder = useMemo(
    () => [...finishedFullLots, ...previewOrder],
    [finishedFullLots, previewOrder]
  );

  const { fit, over } = useMemo(
    () => splitByCapacity(previewOrder, capacityMin),
    [previewOrder, capacityMin]
  );
  const overIds = useMemo(() => new Set(over.map((l) => l.id)), [over]);

  const { byLotId: etaByLot, totalActiveMin } = useMemo(
    () => computeQueueEtas(combinedOrder, capacityMin),
    [combinedOrder, capacityMin]
  );

  const sourceForSearch = useMemo(() => {
    if (tableFilter === "finished") return finishedFullLots;
    if (tableFilter === "queue") return previewOrder;
    return combinedOrder;
  }, [combinedOrder, finishedFullLots, previewOrder, tableFilter]);

  // Rows for the non-reorder views (search / other sort)
  const listRows = useMemo(() => {
    if (orderBy === "plan" && !q) return [];
    const rows = q
      ? sourceForSearch.filter(
          (l) =>
            l.id.toLowerCase().includes(q) ||
            l.product.toLowerCase().includes(q)
        )
      : sourceForSearch.slice();
    if (orderBy === "mustOut")
      rows.sort((a, b) => a.mustOut.localeCompare(b.mustOut));
    else if (orderBy === "lot") rows.sort((a, b) => a.id.localeCompare(b.id));
    else if (orderBy === "qty") rows.sort((a, b) => b.qty - a.qty);
    return rows;
  }, [orderBy, q, sourceForSearch]);

  const resetDrag = () => {
    setDragId(null);
    setOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId && overIndex !== null) onMove(dragId, overIndex);
    resetDrag();
  };

  // Day shift rows: finished D/S lots + D/S hold lots
  const dayDoneLots = useMemo(
    () => finishedFullLots.filter((l) => l.shiftSection === "day"),
    [finishedFullLots]
  );
  const dayHoldLots = useMemo(
    () => fit.filter((l) => l.shiftSection === "day" && l.status === "hold"),
    [fit]
  );
  const dayShiftLots = useMemo(() => {
    if (tableFilter === "finished") return dayDoneLots;
    if (tableFilter === "queue") return dayHoldLots;
    return [...dayDoneLots, ...dayHoldLots];
  }, [dayDoneLots, dayHoldLots, tableFilter]);

  // Night shift rows: finished N/S lots + N/S active lots
  const nightDoneLots = useMemo(
    () => finishedFullLots.filter((l) => l.shiftSection === "night"),
    [finishedFullLots]
  );
  const nightQueueFitLots = useMemo(
    () => fit.filter((l) => !(l.shiftSection === "day" && l.status === "hold")),
    [fit]
  );
  const nightFitLots = useMemo(() => {
    if (tableFilter === "finished") return nightDoneLots;
    if (tableFilter === "queue") return nightQueueFitLots;
    return [...nightDoneLots, ...nightQueueFitLots];
  }, [nightDoneLots, nightQueueFitLots, tableFilter]);

  const visibleOverLots = useMemo(
    () => (tableFilter === "finished" ? [] : over),
    [over, tableFilter]
  );

  // Sequential display row numbers for the currently visible rows
  const displayRowNumbers = useMemo(() => {
    const map = new Map<string, number>();
    const ordered =
      orderBy === "plan" && !q
        ? [...dayShiftLots, ...nightFitLots, ...visibleOverLots]
        : listRows;
    ordered.forEach((l, i) => map.set(l.id, i + 1));
    return map;
  }, [dayShiftLots, listRows, nightFitLots, orderBy, q, visibleOverLots]);

  const lastFitNightLot = nightQueueFitLots[nightQueueFitLots.length - 1];
  const fitsUntilEta = lastFitNightLot
    ? etaByLot.get(lastFitNightLot.id)?.eta ?? "07:15"
    : "08:00";

  const otHoursNeeded = Math.max(
    1,
    Math.ceil(Math.max(0, totalActiveMin - capacityMin) / 60)
  );

  const finishedSheets = Math.ceil(finishedToday.totalPcs / PCS_PER_SHEET);

  const renderRouteDots = (lot: InGateLot, isPopoverOpen: boolean) => {
    const steps = lot.gateSteps ?? [];
    const stepTotal = lot.stepTotal ?? Math.max(1, steps.length);
    const stepNow = Math.min(stepTotal, Math.max(1, lot.stepNow ?? 1));
    const isLotDone = lot.status === "done";

    return (
      <div className="relative inline-flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpenRouteLotId((prev) => (prev === lot.id ? null : lot.id));
          }}
          title="Click to inspect gate route and process steps"
          className={`inline-flex items-center gap-2 rounded-full transition-all cursor-pointer ${
            isPopoverOpen
              ? "border border-[#316be8] bg-base-100 px-3 py-1 shadow-xs ring-2 ring-blue-200/70"
              : "border border-base-300/80 bg-base-100 px-3 py-1 hover:border-[#316be8]/50 hover:bg-base-200/60"
          }`}
        >
          {/* Process step dots (clean single-hue blue palette) */}
          <span className="inline-flex items-center">
            {Array.from({ length: stepTotal }, (_, i) => {
              const pIdx = i + 1;
              const isDone = isLotDone || pIdx < stepNow;
              const isCurrent = !isLotDone && pIdx === stepNow;
              return (
                <React.Fragment key={pIdx}>
                  {i > 0 && (
                    <span
                      className={`h-[1.5px] w-2.5 ${
                        isLotDone || pIdx <= stepNow
                          ? "bg-[#316be8]/50"
                          : "bg-base-300"
                      }`}
                    />
                  )}
                  <span
                    className={`rounded-full ${
                      isDone
                        ? "h-2 w-2 bg-[#316be8]/65"
                        : isCurrent
                          ? "h-2.5 w-2.5 bg-[#316be8] ring-3 ring-blue-200"
                          : "h-2 w-2 bg-base-300"
                    }`}
                  />
                </React.Fragment>
              );
            })}
          </span>

          {/* Process X/N label */}
          <span className="rounded bg-base-200/80 px-1.5 py-0.5 text-[11px] font-extrabold text-base-content/85 tabular-nums whitespace-nowrap">
            Proc {stepNow}/{stepTotal}
          </span>
        </button>

        {isPopoverOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full z-50 mt-2">
            <GateRoutePopover
              lot={lot}
              currentGate={currentGate}
              routeGates={routeGates}
              onClose={() => setOpenRouteLotId(null)}
            />
          </div>
        )}
      </div>
    );
  };

  const renderStatusBadge = (lot: InGateLot, isOver: boolean) => {
    if (lot.status === "done") {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-base-200 px-2.5 py-0.5 text-xs font-bold text-base-content/70">
          Done
        </span>
      );
    }
    if (lot.status === "hold") {
      return (
        <span
          className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-extrabold ${DS_CHIP}`}
        >
          HOLD
        </span>
      );
    }
    if (lot.status === "running") {
      return (
        <span className="inline-flex items-center rounded-md bg-[#316be8] px-2.5 py-0.5 text-xs font-bold text-white shadow-2xs">
          Running
        </span>
      );
    }
    if (isOver) {
      return (
        <span className="inline-flex items-center rounded-md bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
          Next shift
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-md bg-base-200 px-2.5 py-0.5 text-xs font-semibold text-base-content/70">
        Waiting
      </span>
    );
  };

  const renderRow = (lot: InGateLot) => {
    const isDone = lot.status === "done";
    const rowNo = displayRowNumbers.get(lot.id) ?? 0;
    const planIdx = planIndexById.get(lot.id) ?? -1;
    const isRowDraggable = canReorder && !isDone && planIdx >= 0;
    const isOver = !isDone && overIds.has(lot.id);
    const isRunning = lot.status === "running";
    const isDayShift = lot.shiftSection === "day";
    const etaInfo = etaByLot.get(lot.id);
    const isPopoverOpen = openRouteLotId === lot.id;

    if (isRowDraggable && lot.id === dragId) {
      return (
        <tr
          key={lot.id}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={resetDrag}
          className="h-14"
        >
          <td colSpan={17} className="p-0">
            <div className="mx-3 flex h-11 items-center justify-center rounded-xl border-2 border-dashed border-[#316be8] bg-[#e6f0fd]/70 text-xs font-bold text-[#316be8]">
              Drop {lot.id} here → becomes #{rowNo}
            </div>
          </td>
        </tr>
      );
    }

    const leftBarColor = isDayShift ? "#f59e0b" : "#6d4fd8";

    return (
      <tr
        key={lot.id}
        draggable={isRowDraggable}
        onDragStart={(e) => {
          if (!isRowDraggable) return;
          setOpenRouteLotId(null);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", lot.id);
          requestAnimationFrame(() => {
            setDragId(lot.id);
            setOverIndex(planIdx);
          });
        }}
        onDragEnd={resetDrag}
        onDragOver={(e) => {
          if (!dragId || !isRowDraggable) return;
          e.preventDefault();
          if (overIndex !== planIdx) setOverIndex(planIdx);
        }}
        className={`h-14 border-b border-base-300 transition-colors ${
          isRunning
            ? "bg-[#e6f0fd]/55"
            : "bg-base-100 hover:bg-base-200/60"
        }`}
        style={{
          boxShadow: `inset 4px 0 0 ${leftBarColor}`,
        }}
      >
        {/* 1) NO */}
        <td
          className="px-2 text-center whitespace-nowrap border-r border-base-200"
          style={{
            boxShadow: `inset 4px 0 0 ${leftBarColor}`,
          }}
        >
          <div className="inline-flex items-center justify-center gap-1">
            {isDone ? (
              <Check size={13} className="text-base-content/35" />
            ) : (
              <GripVertical
                size={14}
                className={
                  isRowDraggable
                    ? "text-base-content/35 hover:text-base-content/70 cursor-grab"
                    : "text-base-content/15"
                }
              />
            )}
            <span
              className={`w-5 text-center text-xs font-extrabold tabular-nums ${
                isRunning ? "text-[#316be8]" : "text-base-content/70"
              }`}
            >
              {rowNo}
            </span>
          </div>
        </td>

        {/* 2) PRODUCT (with Lot No below Product name) */}
        <td className="px-3 py-1.5 whitespace-nowrap border-r border-base-200">
          <div className="font-bold text-sm text-base-content leading-tight">
            {lot.product}
          </div>
          <div className="mt-0.5 text-xs font-semibold text-base-content/55 tabular-nums leading-tight">
            {lot.id}
          </div>
        </td>

        {/* 3) STATUS */}
        <td className="px-2.5 text-center whitespace-nowrap border-r border-base-200">
          {renderStatusBadge(lot, isOver)}
        </td>

        {/* 3) SHEET/LOT */}
        <td className="px-2.5 text-right font-bold text-xs tabular-nums whitespace-nowrap text-base-content/85 border-r border-base-200">
          {lot.sheet.toLocaleString()}
        </td>

        {/* 4) PCS/LOT */}
        <td className="px-2.5 text-right font-bold text-xs tabular-nums whitespace-nowrap text-base-content/85 border-r border-base-200">
          {lot.qty.toLocaleString()}
        </td>

        {/* 6) ROUTE · WHERE NOW */}
        <td className="px-3 text-center whitespace-nowrap border-r border-base-200">
          {renderRouteDots(lot, isPopoverOpen)}
        </td>

        {/* 7) PLAN (Lot) */}
        <td className="px-2.5 text-center font-extrabold text-xs tabular-nums text-base-content border-r border-base-200">
          1
        </td>

        {/* 8) PLAN (min) */}
        <td className="px-2.5 text-right text-xs font-bold tabular-nums whitespace-nowrap text-base-content/80 border-r border-base-200">
          {lot.minutes}
        </td>

        {/* 9) CAPACITY USED — follows D/S (amber) and N/S (purple from Month view) shift colors with target tick */}
        <td className="px-3 whitespace-nowrap tabular-nums">
          {(() => {
            const pct = etaInfo?.shiftPct ?? 0;
            const usedMin = etaInfo?.shiftUsedMin ?? 0;
            const fillPct = Math.min(100, Math.max(4, pct));
            const barColor = isDayShift ? "bg-[#f59e0b]" : "bg-[#6d4fd8]";
            const textColor = isDayShift ? "text-[#8a5a00]" : "text-[#5a3fc0]";

            return (
              <div className="flex items-center gap-2">
                <div className="relative flex h-2 w-18 shrink-0 items-center rounded-full bg-slate-200/80">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${fillPct}%` }}
                  />
                  <span className="absolute -right-[1px] top-1/2 h-3 w-[1.5px] -translate-y-1/2 bg-slate-600" />
                </div>
                <span className={`text-xs font-extrabold ${textColor}`}>
                  {pct}%
                </span>
                <span className="text-[11px] font-medium text-base-content/50">
                  {usedMin}m
                </span>
              </div>
            );
          })()}
        </td>
      </tr>
    );
  };

  // Aggregate metrics for Total, D/S, N/S, Output, and Plan Min woven into the 16 columns
  const allDayLots = useMemo(
    () => [...dayDoneLots, ...dayHoldLots],
    [dayDoneLots, dayHoldLots]
  );
  const allNightLots = useMemo(
    () => [...nightDoneLots, ...nightQueueFitLots, ...over],
    [nightDoneLots, nightQueueFitLots, over]
  );

  const dsPlanLotsCount = allDayLots.length;
  const dsOpLotsCount = dayDoneLots.length;
  const nsPlanLotsCount = allNightLots.length;
  const nsOpLotsCount = nightDoneLots.length;
  const totalPlanLotsCount = dsPlanLotsCount + nsPlanLotsCount;
  const totalOpLotsCount = dsOpLotsCount + nsOpLotsCount;

  const dsPlanSheet = allDayLots.reduce((s, l) => s + l.sheet, 0);
  const dsPlanPcs = allDayLots.reduce((s, l) => s + l.qty, 0);
  const nsPlanSheet = allNightLots.reduce((s, l) => s + l.sheet, 0);
  const nsPlanPcs = allNightLots.reduce((s, l) => s + l.qty, 0);
  const totalPlanSheet = dsPlanSheet + nsPlanSheet;
  const totalPlanPcs = dsPlanPcs + nsPlanPcs;

  const dsOutputPcs = dayDoneLots.reduce((s, l) => s + l.outputPcs, 0);
  const dsOutputSheet = dayDoneLots.reduce((s, l) => s + l.outputSheet, 0);
  const nsOutputPcs =
    nightDoneLots.reduce((s, l) => s + l.outputPcs, 0) +
    nightQueueFitLots.reduce((s, l) => s + l.outputPcs, 0);
  const nsOutputSheet =
    nightDoneLots.reduce((s, l) => s + l.outputSheet, 0) +
    nightQueueFitLots.reduce((s, l) => s + l.outputSheet, 0);

  const totalOutputPcs = dsOutputPcs + nsOutputPcs;
  const totalOutputSheet = dsOutputSheet + nsOutputSheet;

  const planDsMin = allDayLots.reduce((s, l) => s + l.minutes, 0);
  const capCheckDsPct = Math.round((planDsMin / 655) * 100);
  const planNsMin = [...nightDoneLots, ...nightQueueFitLots].reduce(
    (s, l) => s + l.minutes,
    0
  );
  const capCheckNsPct = Math.round((planNsMin / 655) * 100);
  const planTotalMin = planDsMin + planNsMin;
  const capCheckTotalPct = Math.round((planTotalMin / 1310) * 100);

  let body: React.ReactNode[] = [];

  if (orderBy === "plan" && !q) {
    // 0) Pinned TOTAL SUMMARY row inside the table aligned with all 9 columns
    body.push(
      <tr
        key="__total_summary_row"
        className="h-10 bg-slate-50 border-b border-base-300 text-xs"
      >
        <td
          colSpan={3}
          className="px-3 font-extrabold uppercase tracking-wider text-slate-700 border-r border-base-200 whitespace-nowrap"
        >
          TOTAL SUMMARY
        </td>
        <td className="px-2.5 text-right font-bold text-slate-700 border-r border-base-200 whitespace-nowrap">
          {totalPlanSheet.toLocaleString()}
        </td>
        <td className="px-2.5 text-right font-bold text-slate-700 border-r border-base-200 whitespace-nowrap">
          {totalPlanPcs.toLocaleString()}
        </td>
        <td className="px-3 text-center text-base-content/40 border-r border-base-200 whitespace-nowrap">
          —
        </td>
        <td className="px-2.5 text-center font-extrabold text-sm text-base-content border-r border-base-200">
          {totalPlanLotsCount}
        </td>
        <td className="px-2.5 text-right font-extrabold text-xs text-base-content border-r border-base-200 whitespace-nowrap">
          {planTotalMin.toLocaleString()}
        </td>
        <td className="px-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
            <div className="relative flex h-2 w-18 shrink-0 items-center rounded-full bg-slate-200/85">
              <div
                className="h-full rounded-full bg-[#316be8]"
                style={{ width: `${Math.min(100, Math.max(4, capCheckTotalPct))}%` }}
              />
              <span className="absolute -right-[1px] top-1/2 h-3 w-[1.5px] -translate-y-1/2 bg-slate-700" />
            </div>
            <span className="text-xs font-extrabold text-[#316be8]">
              {capCheckTotalPct}%
            </span>
          </div>
        </td>
      </tr>
    );

    // 1) DAY SHIFT section — aligned with all 9 columns
    if (dayShiftLots.length > 0) {
      const dsHoldCount = dayShiftLots.filter((l) => l.status === "hold").length;
      body.push(
        <tr
          key="__day_shift_hdr"
          className="h-9 bg-[#fef3c7] border-y border-[#f5c542]"
        >
          <td colSpan={3} className="px-3 py-1.5 border-r border-[#f5c542]/50 whitespace-nowrap">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[#8a5a00]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-xs bg-[#f59e0b]" />
              <span>
                DAY SHIFT · 08:00–20:00
                {dsHoldCount > 0 ? ` (${dsHoldCount} HOLD)` : ""}
              </span>
            </div>
          </td>
          <td className="px-2.5 text-right text-xs font-extrabold text-[#8a5a00] border-r border-[#f5c542]/50">
            {dsPlanSheet.toLocaleString()}
          </td>
          <td className="px-2.5 text-right text-xs font-extrabold text-[#8a5a00] border-r border-[#f5c542]/50">
            {dsPlanPcs.toLocaleString()}
          </td>
          <td className="px-3 text-center text-xs font-bold text-[#8a5a00]/60 border-r border-[#f5c542]/50">
            D/S Summary
          </td>
          <td className="px-2.5 text-center text-xs font-extrabold text-[#8a5a00] border-r border-[#f5c542]/50">
            {dsPlanLotsCount}
          </td>
          <td className="px-2.5 text-right text-xs font-extrabold text-[#8a5a00] border-r border-[#f5c542]/50">
            {planDsMin}
          </td>
          <td className="px-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-18 shrink-0 items-center rounded-full bg-[#f5c542]/45">
                <div
                  className="h-full rounded-full bg-[#f59e0b]"
                  style={{ width: `${Math.min(100, Math.max(4, capCheckDsPct))}%` }}
                />
                <span className="absolute -right-[1px] top-1/2 h-3 w-[1.5px] -translate-y-1/2 bg-[#8a5a00]" />
              </div>
              <span className="text-xs font-extrabold text-[#8a5a00]">
                {capCheckDsPct}%
              </span>
            </div>
          </td>
        </tr>,
        ...dayShiftLots.map(renderRow)
      );
    }

    // 2) NIGHT SHIFT section — aligned with all 9 columns (purple palette matching Month view)
    if (nightFitLots.length > 0 || visibleOverLots.length > 0) {
      const nsLeftCount = nightFitLots.filter((l) => l.status !== "done").length;
      body.push(
        <tr
          key="__night_shift_hdr"
          className="h-9 bg-[#e9e3fb] border-y border-[#c4b5fd]"
        >
          <td colSpan={3} className="px-3 py-1.5 border-r border-[#c4b5fd]/60 whitespace-nowrap">
            <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-[#5a3fc0]">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#6d4fd8]" />
              <span>
                NIGHT SHIFT · 20:00–08:00
                {nsLeftCount > 0 ? ` (${nsLeftCount} left)` : ""}
              </span>
            </div>
          </td>
          <td className="px-2.5 text-right text-xs font-extrabold text-[#5a3fc0] border-r border-[#c4b5fd]/60">
            {nsPlanSheet.toLocaleString()}
          </td>
          <td className="px-2.5 text-right text-xs font-extrabold text-[#5a3fc0] border-r border-[#c4b5fd]/60">
            {nsPlanPcs.toLocaleString()}
          </td>
          <td className="px-3 text-center text-xs font-bold text-[#5a3fc0]/65 border-r border-[#c4b5fd]/60">
            N/S Summary
          </td>
          <td className="px-2.5 text-center text-xs font-extrabold text-[#5a3fc0] border-r border-[#c4b5fd]/60">
            {nsPlanLotsCount}
          </td>
          <td className="px-2.5 text-right text-xs font-extrabold text-[#5a3fc0] border-r border-[#c4b5fd]/60">
            {planNsMin}
          </td>
          <td className="px-3">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-18 shrink-0 items-center rounded-full bg-[#c4b5fd]/55">
                <div
                  className="h-full rounded-full bg-[#6d4fd8]"
                  style={{ width: `${Math.min(100, Math.max(4, capCheckNsPct))}%` }}
                />
                <span className="absolute -right-[1px] top-1/2 h-3 w-[1.5px] -translate-y-1/2 bg-[#5a3fc0]" />
              </div>
              <span className="text-xs font-extrabold text-[#5a3fc0]">
                {capCheckNsPct}%
              </span>
            </div>
          </td>
        </tr>,
        ...nightFitLots.map(renderRow)
      );
    }

    // 3) Capacity cutoff line + overflow lots
    if (visibleOverLots.length > 0) {
      body.push(
        <tr
          key="__capacity_line"
          className="bg-base-100 border-y border-base-300"
        >
          <td
            colSpan={9}
            className="py-2 px-4 text-center text-xs font-extrabold text-rose-600"
          >
            Shift full at 08:00 · {visibleOverLots.length}{" "}
            {visibleOverLots.length === 1 ? "lot" : "lots"} below move to
            tomorrow D/S or open OT {otHoursNeeded} h
          </td>
        </tr>,
        ...visibleOverLots.map(renderRow)
      );
    }
  } else {
    body = listRows.map(renderRow);
    if (listRows.length === 0) {
      body.push(
        <tr key="__empty">
          <td colSpan={9} className="py-10 text-center text-base-content/50">
            No lots match “{search}”
          </td>
        </tr>
      );
    }
  }

  return (
    <div
      className="flex flex-col gap-3"
      onClick={() => openRouteLotId && setOpenRouteLotId(null)}
    >
      {/* Full-table view filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base-300 bg-base-200/45 px-3 py-2">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-base-200 p-1">
          <button
            type="button"
            onClick={() => setTableFilter("all")}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
              tableFilter === "all"
                ? "bg-base-100 text-[#316be8] shadow-2xs"
                : "text-base-content/65 hover:text-base-content"
            }`}
          >
            All lots ({combinedOrder.length})
          </button>
          <button
            type="button"
            onClick={() => setTableFilter("queue")}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
              tableFilter === "queue"
                ? "bg-base-100 text-[#316be8] shadow-2xs"
                : "text-base-content/65 hover:text-base-content"
            }`}
          >
            In queue ({previewOrder.length})
          </button>
          <button
            type="button"
            onClick={() => setTableFilter("finished")}
            className={`rounded-md px-3 py-1 text-xs font-bold transition-colors cursor-pointer ${
              tableFilter === "finished"
                ? "bg-base-100 text-[#316be8] shadow-2xs"
                : "text-base-content/65 hover:text-base-content"
            }`}
          >
            Finished today ({finishedToday.totalLots})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/70 tabular-nums">
          <span>
            Finished today:{" "}
            <b className="font-bold text-base-content">
              {finishedToday.totalLots} lots
            </b>{" "}
            (
            {unit === "sheets"
              ? `${finishedSheets.toLocaleString()} sheets`
              : `${finishedToday.totalPcs.toLocaleString()} pcs`}
            )
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold ${DS_CHIP}`}
          >
            <span className="h-2 w-2 rounded-xs bg-[#f59e0b]" />
            D/S {finishedToday.dsLots}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-bold ${NS_CHIP}`}
          >
            <span className="h-2 w-2 rounded-full bg-[#6d4fd8]" />
            N/S {finishedToday.nsLots}
          </span>
        </div>
      </div>

      {/* Bordered table with 9 clean columns */}
      <div className="overflow-x-auto rounded-xl border border-base-300">
        <table className="w-full min-w-[900px] table-fixed text-sm text-base-content tabular-nums">
          <colgroup>
            <col className="w-[6%]" />
            <col className="w-[13%]" />
            <col className="w-[10%]" />
            <col className="w-[9.5%]" />
            <col className="w-[9.5%]" />
            <col className="w-[19%]" />
            <col className="w-[8.5%]" />
            <col className="w-[8.5%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="whitespace-nowrap bg-slate-100 border-b border-base-300 text-[11px] font-extrabold tracking-wide text-slate-700 uppercase">
              <th className="px-2 py-2.5 text-center border-r border-base-300">
                NO
              </th>
              <th className="px-3 py-2.5 text-left border-r border-base-300">
                <div>PRODUCT</div>
                <div className="text-[10px] font-semibold normal-case text-slate-500">
                  Lot No
                </div>
              </th>
              <th className="px-2.5 py-2.5 text-center border-r border-base-300">
                STATUS
              </th>
              <th className="px-2.5 py-2.5 text-right border-r border-base-300">
                <div>SHEET</div>
                <div className="text-[10px] font-semibold normal-case text-slate-500">
                  / lot
                </div>
              </th>
              <th className="px-2.5 py-2.5 text-right border-r border-base-300">
                <div>PCS</div>
                <div className="text-[10px] font-semibold normal-case text-slate-500">
                  / lot
                </div>
              </th>
              <th className="px-3 py-2.5 text-center border-r border-base-300">
                ROUTE · WHERE NOW
              </th>
              <th className="px-2.5 py-2.5 text-center border-r border-base-300">
                <div>PLAN</div>
                <div className="text-[10px] font-semibold normal-case text-slate-500">
                  (Lot)
                </div>
              </th>
              <th className="px-2.5 py-2.5 text-right border-r border-base-300">
                <div>PLAN</div>
                <div className="text-[10px] font-semibold normal-case text-slate-500">
                  (min)
                </div>
              </th>
              <th className="px-3 py-2.5 text-left">
                CAPACITY USED
              </th>
            </tr>
          </thead>
          <tbody
            onDrop={handleDrop}
            onDragOver={(e) => dragId && e.preventDefault()}
          >
            {body}
          </tbody>
        </table>
      </div>
    </div>
  );
};
