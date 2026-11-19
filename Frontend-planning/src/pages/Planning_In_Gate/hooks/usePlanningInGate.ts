import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import { formatGateQuantity } from "../../Planning_Summary_Gate/gateUnits";
import { allocateBoardShifts } from "../../Capacity_Leveling/utils/boardShiftAllocation";
import type { CountUnit, InGateCategory, InGateView, WorkMode } from "../types";
import { planStatus, savedPlanGates, savedPlanRows, savedViewRows } from "../savedPlan";
import { useSavedPlan } from "./useSavedPlan";
import { useFinishedToday } from "./useFinishedToday";
import { useMonthlyOutput } from "./useMonthlyOutput";

const CATEGORIES: InGateCategory[] = ["ALL", "EFPC_GEN", "EFPC_AUTO", "SMT"];
const DEFAULT_FPC_GATES = ["FVAC", "FADL", "FIN"];
const DEFAULT_SMT_GATES = ["MMOT", "MBLK", "MFIN"];
const TV_REFRESH_MS = 60000;

export default function usePlanningInGate() {
  const [params, setParams] = useSearchParams();
  const rawCategory = params.get("cat") ?? (params.get("group") === "SMT" ? "SMT" : "EFPC_GEN");
  const category = CATEGORIES.includes(rawCategory as InGateCategory) ? rawCategory as InGateCategory : "EFPC_GEN";
  const today = dayjs().format("YYYY-MM-DD");
  const [date, setDate] = useState(today);
  const [selectedGate, setSelectedGate] = useState("FVAC");
  const [month, setMonth] = useState(today.slice(0, 7));
  const view: InGateView = params.get("view") === "month" ? "month" : "day";
  const [workMode, setWorkMode] = useState<WorkMode>("edit");
  const [unit, setUnit] = useState<CountUnit>("lots");
  const [search, setSearch] = useState("");
  const [tvMode, setTvMode] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { saved, loading, error, reload, revalidate: revalidatePlan } = useSavedPlan();
  const finished = useFinishedToday(date, view === "day");
  const monthly = useMonthlyOutput(month, category, search, view === "month");
  const { loading: observedLoading, revalidate: revalidateObserved } = view === "day" ? finished : monthly;

  useEffect(() => {
    if (!tvMode || loading || observedLoading) return;
    let dueAt = performance.now() + TV_REFRESH_MS;
    let timer: number | undefined;
    function schedule() {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      const now = performance.now();
      if (now >= dueAt) {
        dueAt = now + TV_REFRESH_MS;
        revalidatePlan();
        revalidateObserved();
      }
      timer = window.setTimeout(schedule, dueAt - now);
    }

    schedule();
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("online", schedule);
    window.addEventListener("offline", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
      window.removeEventListener("online", schedule);
      window.removeEventListener("offline", schedule);
    };
  }, [tvMode, loading, observedLoading, revalidatePlan, revalidateObserved]);

  const savedPlanLots = useMemo(() => saved ? savedPlanRows(saved.snapshot, "ALL") : [], [saved]);
  const rows = useMemo(() => saved ? savedPlanRows(saved.snapshot, category) : [], [saved, category]);
  const allocations = useMemo(() => saved ? allocateBoardShifts(saved.snapshot, rows, { excludePassed: true }) : new Map(), [saved, rows]);
  const gates = useMemo(() => {
    if (saved) return savedPlanGates(saved.snapshot, category);
    const list = category === "ALL" ? [...DEFAULT_FPC_GATES, ...DEFAULT_SMT_GATES] : category === "SMT" ? DEFAULT_SMT_GATES : DEFAULT_FPC_GATES;
    return list.map(gate => ({ gate }));
  }, [saved, category]);
  const gate = gates.find(item => item.gate === selectedGate)?.gate ?? gates[0]?.gate ?? "";
  const finishedRows = useMemo(() => finished.rows.filter(row => row.gate === gate && (category === "ALL" || row.processGroup === category)), [finished.rows, gate, category]);
  const gateRows = useMemo(() => rows.filter(row => row.gate === gate), [rows, gate]);
  const dayRows = useMemo(() => savedViewRows(rows, view, view === "month" ? month : date), [rows, date, month, view]);
  const dayPlanLots = useMemo(() => rows.filter(row => row.plannedDate === date && row.gate === gate), [rows, date, gate]);
  const scheduledDates = useMemo(() => [...new Set(gateRows.map(row => row.plannedDate))].sort(), [gateRows]);
  const queue = useMemo(() => dayRows.filter(row => row.gate === gate).map((lot, index) => ({ lot, sequence: index + 1 })), [dayRows, gate]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return queue.filter(({ lot }) => !query || [lot.label, lot.product, lot.item].some(value => value?.toLowerCase().includes(query)));
  }, [queue, search]);

  const changeCategory = (nextCategory: InGateCategory) => {
    const next = new URLSearchParams(params);
    next.delete("group");
    next.set("cat", nextCategory);
    setParams(next, { replace: true });
  };
  const changeView = (nextView: InGateView) => {
    const next = new URLSearchParams(params);
    if (nextView === "month") next.set("view", "month");
    else next.delete("view");
    setParams(next, { replace: true });
  };
  const countText = (gateName: string) => {
    const query = search.trim().toLowerCase();
    const items = dayRows.filter(row => row.gate === gateName && (view !== "month" || !query
      || row.product.toLowerCase().includes(query) || row.label.toLowerCase().includes(query)));
    const needs = items.filter(row => row.kind === "need").length;
    const unknown = items.filter(row => row.kind === "unidentified").length;
    const value = unit === "lots" ? items.filter(row => row.kind === "lot").length
      : items.reduce<number | null>((total, row) => {
        const amount = unit === "pcs" ? row.qty : row.sheets;
        return total === null || amount === null ? null : total + amount;
      }, 0);
    return `${formatGateQuantity(value, unit === "lots" ? "lot" : unit === "pcs" ? "piece" : "sheet")} ${unit}${needs ? ` · ${needs} need` : ""}${unknown ? ` · ${unknown} no ID` : ""}`;
  };
  const refresh = () => {
    reload();
    if (view === "day") finished.reload();
    else monthly.reload();
  };
  const exportPlan = async () => {
    if (!saved || loading || error || exporting || !visible.length) return;
    setExporting(true);
    try {
      await exportToExcel({
        fileName: `InGate_Plan_v${saved.plan.version}_${gate}_${view === "month" ? month : date}`.replace(/[^a-zA-Z0-9_-]/g, "_"),
        data: visible.map(({ lot, sequence }) => ({
          planId: saved.plan.planId, version: saved.plan.version, savedAt: saved.plan.savedAt,
          savedBy: saved.plan.savedBy, sequence, gate, plannedDate: lot.plannedDate,
          product: lot.product, lot: lot.kind === "unidentified" ? "No lot identity" : lot.label, kind: lot.kind, pcs: lot.qty ?? "N/A",
          sheets: lot.sheets === null ? "N/A" : Math.ceil(lot.sheets),
          mustOut: lot.mustOut, capturedStatus: planStatus(lot),
        })),
        columns: [
          { header: "Plan ID", key: "planId", width: 38 },
          { header: "Version", key: "version", width: 10 },
          { header: "Saved at", key: "savedAt", width: 22 },
          { header: "Saved by", key: "savedBy", width: 20 },
          { header: "Plan order", key: "sequence", width: 12 },
          { header: "Gate", key: "gate", width: 12 },
          { header: "Planned arrival", key: "plannedDate", width: 18 },
          { header: "Product", key: "product", width: 25 },
          { header: "Lot / Need WIP", key: "lot", width: 24 },
          { header: "Type", key: "kind", width: 16 },
          { header: "Pcs", key: "pcs", width: 14 },
          { header: "Sheets", key: "sheets", width: 14 },
          { header: "Source must out", key: "mustOut", width: 18 },
          { header: "Status at save", key: "capturedStatus", width: 22 },
        ],
      });
    } catch {
      toast.error("Unable to export the saved plan. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return {
    today, category, view, date, setDate, month, setMonth, unit, setUnit, search, setSearch,
    workMode, setWorkMode, tvMode, setTvMode, exporting,
    saved, loading, error, reload, finished, monthly,
    gates, gate, setSelectedGate, gateRows, dayPlanLots, savedPlanLots, scheduledDates, queue, visible,
    allocations, finishedRows,
    changeCategory, changeView, countText, refresh, exportPlan,
  };
}
