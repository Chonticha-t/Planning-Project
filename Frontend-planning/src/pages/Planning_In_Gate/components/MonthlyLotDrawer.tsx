import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, Download, Moon, Search, Sun, X } from "lucide-react";
import { exportToExcel } from "@/utility/Service/xlxs/exportToExcel";
import type { MonthLot, MonthRow } from "../types";
import { buildCellLots } from "../mock/monthlyMockData";

export interface DrawerTarget {
  date: string;
  productCode: string | null; // null = whole day (all products)
}

interface MonthlyLotDrawerProps {
  target: DrawerTarget;
  gateName: string;
  seedKey: string;
  rows: MonthRow[];
  onClose: () => void;
}

type Filter = "all" | "D" | "N" | "late";

const PAGE_SIZE = 40;
const GROUP_PREVIEW = 11; // lots shown per shift before "+ N more"
const hm = (s: string) => dayjs(s).format("DD/MM HH:mm");
const hoursIn = (l: MonthLot) => `${Math.round(dayjs(l.scanOut).diff(dayjs(l.scanIn), "minute") / 60)} h`;

const SHIFT_INFO = {
  D: { label: "D/S · 08:00–20:00", Icon: Sun, badge: "bg-[#f5c542] text-[#3b2f00]" },
  N: { label: "N/S · 20:00–08:00", Icon: Moon, badge: "bg-[#6d4fd8] text-white" },
} as const;

export const MonthlyLotDrawer: React.FC<MonthlyLotDrawerProps> = ({ target, gateName, seedKey, rows, onClose }) => {
  const { date, productCode } = target;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState(false);

  // Slide in on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const picked = useMemo(
    () => (productCode ? rows.filter((r) => r.product.code === productCode) : rows).filter((r) => r.cells[date]),
    [rows, productCode, date]
  );
  const byProduct = !productCode;

  // Grouped by shift, each group sorted by scan out
  const lots = useMemo(() => {
    const all = picked.flatMap((r) => buildCellLots(seedKey, r.product, date, r.cells[date]));
    const sort = (s: "D" | "N") => all.filter((l) => l.shift === s).sort((a, b) => a.scanOut.localeCompare(b.scanOut));
    return [...sort("D"), ...sort("N")];
  }, [picked, seedKey, date]);

  const ds = lots.filter((l) => l.shift === "D").length;
  const ns = lots.length - ds;
  const late = lots.filter((l) => l.lateDays > 0).length;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      lots.filter(
        (l) =>
          (filter === "all" || (filter === "late" ? l.lateDays > 0 : l.shift === filter)) &&
          (!q || l.id.toLowerCase().includes(q) || l.po.includes(q) || l.product.toLowerCase().includes(q))
      ),
    [lots, filter, q]
  );

  useEffect(() => {
    setPage(0);
    setExpanded({});
  }, [filter, q]);

  // Collapse long shift groups only in the plain "All" view
  const collapsible = filter === "all" && !q;
  const visible = useMemo(() => {
    if (!collapsible) return filtered;
    const out: MonthLot[] = [];
    (["D", "N"] as const).forEach((s) => {
      const g = filtered.filter((l) => l.shift === s);
      out.push(...(expanded[s] ? g : g.slice(0, GROUP_PREVIEW)));
    });
    return out;
  }, [filtered, collapsible, expanded]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageRows = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const seq = new Map(filtered.map((l, i) => [l, i + 1]));

  const handleExcel = () =>
    exportToExcel({
      fileName: `InGate_Lots_${gateName.replace("/", "")}_${productCode ?? "ALL"}_${dayjs(date).format("YYYYMMDD")}`,
      data: filtered.map((l, i) => ({
        seq: i + 1,
        lot: l.id,
        product: l.product,
        shift: l.shift === "D" ? "D/S" : "N/S",
        scanIn: hm(l.scanIn),
        scanOut: hm(l.scanOut),
        hours: hoursIn(l),
        po: l.po,
        due: dayjs(l.due).format("DD/MM/YYYY"),
        status: l.lateDays ? `${l.lateDays} day${l.lateDays > 1 ? "s" : ""} late` : "On time",
      })),
      columns: [
        { header: "#", key: "seq", width: 6, align: "center" },
        { header: "Lot No", key: "lot", width: 14 },
        { header: "Product", key: "product", width: 16 },
        { header: "Shift", key: "shift", width: 8, align: "center" },
        { header: "Scan in", key: "scanIn", width: 14 },
        { header: "Scan out", key: "scanOut", width: 14 },
        { header: "Time in gate", key: "hours", width: 12, align: "right" },
        { header: "PO", key: "po", width: 12 },
        { header: "Due", key: "due", width: 12 },
        { header: "Status", key: "status", width: 12 },
      ],
    });

  const title = byProduct ? "All products" : `${picked[0]?.product.name ?? ""} · ${picked[0]?.product.code ?? ""}`;
  const FILTERS: { value: Filter; label: React.ReactNode }[] = [
    { value: "all", label: `All ${lots.length}` },
    { value: "D", label: <><Sun size={12} /> D/S {ds}</> },
    { value: "N", label: <><Moon size={12} /> N/S {ns}</> },
    { value: "late", label: `Late ${late}` },
  ];
  const colCount = byProduct ? 9 : 8;

  return createPortal(
    <div className="fixed inset-0 z-[1000] text-xs text-base-content" role="dialog" aria-modal aria-label={`${title} ${date}`}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col bg-base-100 shadow-2xl transition-transform duration-200 ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header + KPIs */}
        <div className="border-b border-base-300 px-4 pt-3 pb-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-base-content/50">
                {gateName} · {dayjs(date).format("ddd DD/MM/YYYY")} · scan out
              </div>
              <div className="truncate text-base font-bold">{title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg border border-base-300 p-1.5 text-base-content/60 hover:bg-base-200 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-base-300 px-4 py-2.5">
          <div className="inline-flex h-7 items-center gap-0.5 rounded-lg border border-base-300 bg-base-200/80 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`btn btn-xs h-full min-h-0 gap-1 rounded-md px-2 text-[11px] font-bold ${
                  filter === f.value ? "btn-primary shadow-xs" : "btn-ghost text-base-content/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[140px] flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={byProduct ? "Lot no. / product / PO" : "Lot no. / PO"}
              className="input input-xs input-bordered h-7 w-full rounded-lg bg-base-200/40 pl-8 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={handleExcel}
            className="btn btn-xs h-7 gap-1.5 rounded-lg border-[#4f46e5] bg-base-100 px-3 font-bold text-[#4f46e5] hover:bg-[#eef2ff]"
          >
            <Download size={13} /> Excel
          </button>
        </div>

        {/* Lot table */}
        <div className="flex-1 overflow-auto px-4">
          <table className="w-full tabular-nums">
            <thead className="sticky top-0 z-10 bg-base-100">
              <tr className="text-left text-[10px] uppercase tracking-wide text-base-content/50 whitespace-nowrap">
                <th className="py-1.5 pr-2 font-semibold">#</th>
                <th className="py-1.5 pr-2 font-semibold">Lot no</th>
                {byProduct && <th className="py-1.5 pr-2 font-semibold">Product</th>}
                <th className="py-1.5 pr-2 font-semibold">Shift</th>
                <th className="py-1.5 pr-2 font-semibold">Scan in</th>
                <th className="py-1.5 pr-2 font-semibold">Scan out</th>
                <th className="py-1.5 pr-2 font-semibold">Time in gate</th>
                <th className="py-1.5 pr-2 font-semibold">PO · Due</th>
                <th className="py-1.5 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((l, i) => {
                const prev = pageRows[i - 1];
                const groupStart = !prev || prev.shift !== l.shift;
                // Group really ends here (looking past the page boundary)
                const groupEnd = visible[page * PAGE_SIZE + i + 1]?.shift !== l.shift;
                const info = SHIFT_INFO[l.shift];
                const groupTotal = filtered.filter((x) => x.shift === l.shift).length;
                const hidden = collapsible && !expanded[l.shift] ? groupTotal - GROUP_PREVIEW : 0;
                return (
                  <React.Fragment key={`${l.id}-${l.shift}`}>
                    {groupStart && (
                      <tr>
                        <td colSpan={colCount} className="bg-base-200/60 px-2 py-1 text-[11px] font-bold text-base-content/70">
                          <span className="inline-flex items-center gap-1.5">
                            <info.Icon size={12} /> {info.label} · {groupTotal} lots
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-base-200">
                      <td className="py-1.5 pr-2 text-base-content/40">{seq.get(l)}</td>
                      <td className="py-1.5 pr-2 font-bold whitespace-nowrap">{l.id}</td>
                      {byProduct && <td className="py-1.5 pr-2 whitespace-nowrap">{l.product}</td>}
                      <td className="py-1.5 pr-2">
                        <span className={`rounded px-1.5 text-[10px] font-bold ${info.badge}`}>{l.shift}</span>
                      </td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{hm(l.scanIn)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{hm(l.scanOut)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{hoursIn(l)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap text-base-content/60">
                        {l.po} · {dayjs(l.due).format("DD/MM")}
                      </td>
                      <td className="py-1.5">
                        {l.lateDays ? (
                          <span className="whitespace-nowrap rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            {l.lateDays} day{l.lateDays > 1 ? "s" : ""} late
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            On time
                          </span>
                        )}
                      </td>
                    </tr>
                    {groupEnd && hidden > 0 && (
                      <tr>
                        <td colSpan={colCount} className="py-2">
                          <button
                            type="button"
                            onClick={() => setExpanded((e) => ({ ...e, [l.shift]: true }))}
                            className="font-semibold text-[#4f46e5] hover:underline cursor-pointer"
                          >
                            + {hidden} more in {l.shift === "D" ? "D/S" : "N/S"}
                          </button>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="py-10 text-center text-base-content/50">
                    {lots.length ? "No lot matches the filter" : "No lot scanned out yet"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-base-300 px-4 py-2 text-[11px] text-base-content/60">
          <span>Sorted by scan out · D/S 08:00–20:00 · N/S 20:00–08:00</span>
          <div className="flex items-center gap-1 tabular-nums">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="btn btn-xs btn-ghost px-1"
            >
              <ChevronLeft size={14} />
            </button>
            {page + 1} / {pages}
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="btn btn-xs btn-ghost px-1"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </aside>
    </div>,
    document.body
  );
};
