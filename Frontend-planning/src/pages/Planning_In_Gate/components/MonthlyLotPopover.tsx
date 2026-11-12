import React, { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import dayjs from "dayjs";
import { X } from "lucide-react";
import type { MonthDay, MonthRow } from "../types";
import { buildCellLots } from "../mock/monthlyMockData";

export interface PopoverTarget {
  date: string;
  productCode: string | null; // null = whole day (clicked a chart bar)
  rect: DOMRect;
}

interface MonthlyLotPopoverProps {
  target: PopoverTarget;
  gateName: string;
  seedKey: string;
  rows: MonthRow[];
  day: MonthDay;
  onClose: () => void;
  onViewAll: () => void;
}

const WIDTH = 480;
const PREVIEW = 5;
const hm = (s: string) => dayjs(s).format("DD/MM HH:mm");

export const MonthlyLotPopover: React.FC<MonthlyLotPopoverProps> = ({ target, gateName, seedKey, rows, day, onClose, onViewAll }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { date, productCode, rect } = target;

  // Close on Esc / click outside / page scroll (the anchor moves away)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onScroll = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const picked = useMemo(
    () => (productCode ? rows.filter((r) => r.product.code === productCode) : rows).filter((r) => r.cells[date]),
    [rows, productCode, date]
  );

  const lots = useMemo(
    () =>
      picked
        .flatMap((r) => buildCellLots(seedKey, r.product, date, r.cells[date]))
        .sort((a, b) => a.scanOut.localeCompare(b.scanOut)),
    [picked, seedKey, date]
  );

  const plan = picked.reduce((s, r) => s + r.cells[date].plan, 0);
  const dsCount = lots.filter((l) => l.shift === "D").length;
  const nsCount = lots.length - dsCount;
  const late = lots.filter((l) => l.lateDays > 0).length;
  const isFuture = day.phase === "future";
  const byProduct = !productCode;

  // Show one lot of each shift first so both are visible in the preview
  const shown = [...lots.filter((l) => l.shift === "D").slice(0, Math.ceil(PREVIEW / 2)), ...lots.filter((l) => l.shift === "N").slice(0, Math.floor(PREVIEW / 2))];

  // Beside the clicked cell, flipped / clamped to stay on screen
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - 16);
  let left = rect.right + 10;
  if (left + width > vw - 8) left = rect.left - width - 10;
  if (left < 8) left = Math.max(8, Math.min(vw - width - 8, rect.left + rect.width / 2 - width / 2));
  const top = Math.max(8, Math.min(rect.top - 20, vh - 440));

  const title = byProduct ? "All products" : picked[0]?.product.name ?? "";

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${title} ${date}`}
      className="fixed z-[1000] rounded-xl border border-base-300 bg-base-100 p-4 shadow-2xl text-xs text-base-content"
      style={{ left, top, width, maxHeight: vh - top - 8 }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 rounded-md p-1 text-base-content/50 hover:bg-base-200 cursor-pointer"
      >
        <X size={15} />
      </button>
      <div className="pr-8 text-sm font-bold">
        {title} · {dayjs(date).format("ddd DD/MM")} · {gateName}
      </div>
      <div className="text-base-content/60">
        {isFuture
          ? `Plan ${plan} lots · no scan out yet`
          : `Out ${lots.length} lots · plan ${plan} lots · scan out from WIP${late ? ` · ${late} late` : ""}`}
      </div>

      {isFuture ? (
        <div className="mt-3 flex flex-col divide-y divide-base-200">
          {picked.map((r) => (
            <div key={r.product.code} className="flex justify-between py-1.5 tabular-nums">
              <span className="font-semibold">{r.product.name}</span>
              <span className="text-base-content/70">plan {r.cells[date].plan} lots</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2 font-bold">
            <div className="rounded-md bg-[#fdecb3] px-2.5 py-1 text-[#8a5a00]">Day shift · {dsCount} lots</div>
            <div className="rounded-md bg-[#e9e3fb] px-2.5 py-1 text-[#5a3fc0]">Night shift · {nsCount} lots</div>
          </div>

          <div className="mt-3">
            <table className="w-full tabular-nums">
              <thead className="sticky top-0 bg-base-100">
                <tr className="text-left text-[10px] uppercase tracking-wide text-base-content/50">
                  <th className="py-1.5 font-semibold">Lot</th>
                  {byProduct && <th className="py-1.5 font-semibold">Product</th>}
                  <th className="py-1.5 font-semibold">Scan in</th>
                  <th className="py-1.5 font-semibold">Scan out</th>
                  <th className="py-1.5 font-semibold">Shift</th>
                  <th className="py-1.5 font-semibold">Due</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l, i) => (
                  <tr key={`${l.id}-${i}`} className="border-t border-base-200">
                    <td className="py-1.5 font-bold">{l.id}</td>
                    {byProduct && <td className="py-1.5">{l.product}</td>}
                    <td className="py-1.5">{hm(l.scanIn)}</td>
                    <td className="py-1.5">{hm(l.scanOut)}</td>
                    <td className="py-1.5">{l.shift}</td>
                    <td className="py-1.5">
                      {l.lateDays ? (
                        <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          {l.lateDays} day{l.lateDays > 1 ? "s" : ""} late
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">On time</span>
                      )}
                    </td>
                  </tr>
                ))}
                {lots.length === 0 && (
                  <tr className="border-t border-base-200">
                    <td colSpan={6} className="py-4 text-center text-base-content/50">
                      No lot scanned out yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {lots.length > shown.length && (
            <button type="button" onClick={onViewAll} className="mt-2 font-semibold text-[#4f46e5] hover:underline cursor-pointer">
              + {lots.length - shown.length} more lots · view all →
            </button>
          )}
          <div className="mt-2 text-[10px] text-base-content/50">
            Shift is taken from scan-out time · D/S 08:00–20:00 · N/S 20:00–08:00
          </div>
        </>
      )}
    </div>,
    document.body
  );
};
