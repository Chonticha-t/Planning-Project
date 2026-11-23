import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { OverviewDay, OverviewProduct } from "../types";
import { dayLabel, formatQty } from "../overviewView";

const ROW_HEIGHT = 36; // matches h-9 (2.25rem)
const OVERSCAN = 10;

interface BalanceTableProps {
  rows: OverviewProduct[];
  days: OverviewDay[];
  totalProducts: number;
  loading: boolean;
  calendarFallback: boolean;
  hasData: boolean;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  headerControls?: ReactNode;
}

const headCell = "sticky z-20 bg-base-200 border-b border-base-300 text-[11px] font-bold uppercase tracking-wider text-base-content/70";
const groupStart = "border-l-2 border-l-base-300";
const dayBorder = "border-l border-l-base-200";
const bodyCell = "h-9 px-2.5 text-right whitespace-nowrap border-b border-base-200";

const BalanceTable = ({
  rows,
  days,
  totalProducts,
  loading,
  calendarFallback,
  hasData,
  isFullscreen,
  onToggleFullscreen,
  headerControls,
}: BalanceTableProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight || 600);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [isFullscreen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    setScrollTop(0);
  }, [rows]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const indexes = useMemo(() => days.map((_, i) => i), [days]);
  const n = indexes.length;
  const colCount = 3 + Math.max(n, 1);

  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = rows.slice(startIdx, endIdx);
  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = (rows.length - endIdx) * ROW_HEIGHT;

  const dayHead = (d: OverviewDay, j: number) => (
    <th
      key={d.date}
      scope="col"
      className={`${headCell} top-[30px] h-[46px] px-2.5 text-right normal-case tracking-normal whitespace-nowrap ${
        j === 0 ? groupStart : dayBorder
      } ${d.is_today ? "today-head" : "text-base-content"}`}
    >
      <div className="text-xs font-bold">{dayLabel(d.date)}</div>
      <div className={`text-[10px] font-semibold ${d.is_today ? "" : "text-base-content/55"}`}>
        {d.is_today ? "TODAY" : d.dow}
      </div>
    </th>
  );

  return (
    <section
      aria-label="Inventory vs Net Required"
      className={`rounded-2xl bg-base-100 border border-base-300 shadow-xs overflow-hidden ${
        isFullscreen ? "flex-1 min-h-0 flex flex-col" : ""
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[13.5px] font-extrabold tracking-wide text-base-content shrink-0">SO BALANCE OVERVIEW</h2>
          {headerControls}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-base-content/70">
          <span className="inline-flex items-center gap-1.5 font-semibold text-base-content/80"><span className="size-3 rounded bg-emerald-500" aria-hidden="true" />Ready</span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-base-content/80"><span className="size-3 rounded bg-rose-500" aria-hidden="true" />Net Req</span>
          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Expand table to fullscreen"}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              isFullscreen
                ? "bg-[#4f46e5] border-[#4f46e5] text-white hover:bg-[#4338ca]"
                : "bg-base-100 border-base-300 text-base-content hover:border-[#4f46e5] hover:text-[#4f46e5]"
            }`}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? "Exit" : "Full"}</span>
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`overflow-auto border-t border-base-300 transition-opacity ${
          isFullscreen ? "flex-1 min-h-0" : "max-h-[calc(100vh-330px)] min-h-[260px]"
        } ${loading && hasData ? "opacity-60" : ""}`}
      >
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-[12.5px] tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className={`${headCell} top-0 left-0 z-30 min-w-[160px] px-3 text-left shadow-[1px_0_0_var(--color-base-300)]`}>
                Product
              </th>
              <th rowSpan={2} scope="col" className={`${headCell} top-0 w-[68px] px-2 text-center`}>Type</th>
              <th rowSpan={2} scope="col" className={`${headCell} top-0 w-[104px] px-3 text-right`}>Inventory</th>
              <th colSpan={Math.max(n, 1)} scope="colgroup" className={`${headCell} top-0 h-[30px] px-2 text-center ${groupStart}`}>
                SO Balance <span className="font-medium normal-case tracking-normal text-base-content/55">· Ready / Net Req</span>
              </th>
            </tr>
            <tr>
              {indexes.map((d, j) => dayHead(days[d], j))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="h-40 text-center text-sm text-base-content/60">
                  {loading && !hasData ? (
                    <span className="inline-flex items-center gap-2"><span className="loading loading-spinner loading-sm" />Loading planning overview…</span>
                  ) : totalProducts === 0 ? (
                    "No open SO in this range."
                  ) : (
                    "No products match the filters."
                  )}
                </td>
              </tr>
            )}
            {topPad > 0 && (
              <tr aria-hidden="true">
                <td colSpan={colCount} style={{ height: topPad, padding: 0, border: 0 }} />
              </tr>
            )}
            {visibleRows.map((r) => (
              <tr key={r.prd_name} className="group">
                <th
                  scope="row"
                  title={r.first_short >= 0 ? `${r.prd_name} · Net Req from ${dayLabel(days[r.first_short].date)}` : `${r.prd_name} · Ready through the range`}
                  className="sticky left-0 z-10 h-9 px-3 text-left font-normal bg-base-100 group-hover:bg-base-200 border-b border-base-200 shadow-[1px_0_0_var(--color-base-300)]"
                >
                  <span className="font-bold text-[13px] text-base-content whitespace-nowrap">{r.prd_name}</span>
                </th>
                <td className="h-9 px-2 text-center whitespace-nowrap border-b border-base-200 group-hover:bg-base-200/60">
                  {r.type ? (
                    <span className="inline-flex items-center h-[18px] px-1.5 rounded-md text-[10px] font-bold tracking-wide bg-base-200 text-base-content/75 border border-base-300">
                      {r.type}
                    </span>
                  ) : (
                    <span className="text-base-content/40">-</span>
                  )}
                </td>
                <td
                  className={`${bodyCell} px-3 font-semibold text-base-content group-hover:bg-base-200/60`}
                  title={r.unmovement ? `F/G ${formatQty(r.f_g)} + Unmovement ${formatQty(r.unmovement)}` : undefined}
                >
                  {formatQty(r.fg_stock)}
                </td>
                {indexes.map((d, j) => {
                  const bl = r.bl[d] ?? 0;
                  const added = r.po_new[d] ?? 0;
                  const tone = bl < 0 ? "bl-short font-bold" : bl > 0 ? `bl-ok ${added ? "font-bold" : "font-medium"}` : "text-base-content/70";
                  return (
                    <td
                      key={`bl-${d}`}
                      className={`${bodyCell} ${tone} ${j === 0 ? groupStart : dayBorder}`}
                      title={`${r.prd_name} · ${dayLabel(days[d].date)} · ${bl < 0 ? "Net Req" : "Ready"} ${formatQty(bl)} = Inventory ${formatQty(r.fg_stock)} − SO ${formatQty(r.po_cum[d] ?? 0)}`}
                    >
                      {formatQty(bl)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {bottomPad > 0 && (
              <tr aria-hidden="true">
                <td colSpan={colCount} style={{ height: bottomPad, padding: 0, border: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 border-t border-base-300 text-xs text-base-content/60 shrink-0">
        <span>
          Showing {formatQty(rows.length)} of {formatQty(totalProducts)} products
          {calendarFallback && " · working-day calendar unavailable, Sundays hidden"}
        </span>
      </footer>
    </section>
  );
};

export default memo(BalanceTable);
