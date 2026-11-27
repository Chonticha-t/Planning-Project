import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import type { OverviewDay, OverviewProduct } from "../types";
import { dayLabel, formatQty } from "../overviewView";

const ROW_HEIGHT = 36; // matches h-9 (2.25rem)
const OVERSCAN = 14;
const SCROLL_STEP = 4; // only shift virtual window every 4 rows to avoid per-pixel churn

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

const headCell = "bg-base-200 border-b border-base-content/9 text-[11px] font-bold uppercase tracking-wider text-base-content/70";
const groupStart = "border-l-2 border-l-base-content/9";
const dayBorder = "border-l border-l-base-content/9";
const bodyCell = "h-9 px-2.5 text-right whitespace-nowrap border-b border-base-content/9 overflow-hidden";

interface BalanceRowProps {
  r: OverviewProduct;
  days: OverviewDay[];
  indexes: number[];
}

const BalanceRow = memo(({ r, days, indexes }: BalanceRowProps) => (
  <tr className="group" style={{ height: ROW_HEIGHT }}>
    <th
      scope="row"
      title={r.first_short >= 0 ? `${r.prd_name} · Net Req from ${dayLabel(days[r.first_short].date)}` : `${r.prd_name} · Ready through the range`}
      className="sticky left-0 z-10 h-9 px-3 text-left font-normal bg-base-100 group-hover:bg-base-200 border-b border-base-content/9 shadow-[1px_0_0_color-mix(in_oklab,var(--color-base-content)_9%,transparent)] overflow-hidden text-ellipsis whitespace-nowrap"
    >
      <span className="font-bold text-[13px] text-base-content whitespace-nowrap">{r.prd_name}</span>
    </th>
    <td className="h-9 px-2 text-center whitespace-nowrap border-b border-base-content/9 group-hover:bg-base-200/60 overflow-hidden">
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
));

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
  const scrollRafRef = useRef<number>(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [scrollAnchorRow, setScrollAnchorRow] = useState(0);

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
    setScrollAnchorRow(0);
  }, [rows]);

  useEffect(() => () => {
    if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const docked = dockedScrollbarRef.current;
    if (docked && docked.style.display !== "none" && Math.abs(docked.scrollLeft - el.scrollLeft) > 0.5) {
      docked.scrollLeft = el.scrollLeft;
    }
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const node = scrollRef.current;
      if (!node) return;
      const bucket = Math.floor(node.scrollTop / (ROW_HEIGHT * SCROLL_STEP)) * SCROLL_STEP;
      setScrollAnchorRow((prev) => (prev === bucket ? prev : bucket));
    });
  }, []);

  // Docked horizontal scrollbar (same behavior as Planning Summary): when the table's own
  // x-scrollbar is below the viewport, show a fixed copy at the bottom of the screen.
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const dockedScrollbarRef = useRef<HTMLDivElement>(null);
  const dockedScrollContentRef = useRef<HTMLDivElement>(null);

  const handleDockedScroll = useCallback(() => {
    const docked = dockedScrollbarRef.current;
    const el = scrollRef.current;
    if (docked && docked.clientWidth > 0 && el && Math.abs(el.scrollLeft - docked.scrollLeft) > 0.5) {
      el.scrollLeft = docked.scrollLeft;
    }
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const head = theadRef.current;
    const table = tableRef.current;
    const docked = dockedScrollbarRef.current;
    const content = dockedScrollContentRef.current;
    if (!el || !head || !table || !docked || !content) return;
    let frame = 0;

    const updateScrollbar = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportBottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 1;
      const hasOverflow = el.scrollWidth > el.clientWidth;
      const shouldDock = hasOverflow && rect.bottom > viewportBottom &&
        head.getBoundingClientRect().bottom < viewportBottom - 24;
      docked.style.display = shouldDock ? "block" : "none";
      if (!shouldDock) return;

      // Match the native scrollbar's range so scrollLeft maps 1:1.
      const barHeight = Math.max(el.offsetHeight - el.clientHeight - el.clientTop, 17);
      docked.style.left = `${rect.left + el.clientLeft}px`;
      docked.style.top = `${viewportBottom - barHeight}px`;
      docked.style.width = `${el.clientWidth}px`;
      docked.style.height = `${barHeight}px`;
      content.style.width = `${el.scrollWidth}px`;
      if (Math.abs(docked.scrollLeft - el.scrollLeft) > 0.5) {
        docked.scrollLeft = el.scrollLeft;
      }
    };

    const scheduleUpdate = (event?: Event) => {
      if (event?.target === docked || event?.target === el) return;
      if (!frame) frame = window.requestAnimationFrame(updateScrollbar);
    };
    const resizeObserver = new ResizeObserver(() => scheduleUpdate());
    resizeObserver.observe(el);
    resizeObserver.observe(table);
    const pageRoot = el.closest(".planning-overview") ?? el.parentElement;
    if (pageRoot) resizeObserver.observe(pageRoot);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    window.visualViewport?.addEventListener("scroll", scheduleUpdate);
    updateScrollbar();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
      window.visualViewport?.removeEventListener("scroll", scheduleUpdate);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const indexes = useMemo(() => days.map((_, i) => i), [days]);
  const n = indexes.length;
  const colCount = 3 + Math.max(n, 1);

  const dailyShort = useMemo(
    () =>
      indexes.map((d) => {
        let products = 0;
        let pcs = 0;
        for (const r of rows) {
          const bl = r.bl[d] ?? 0;
          if (bl < 0) {
            products += 1;
            pcs += bl;
          }
        }
        return { products, pcs };
      }),
    [rows, indexes]
  );

  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + SCROLL_STEP;
  const startIdx = Math.max(0, scrollAnchorRow - OVERSCAN);
  const endIdx = Math.min(rows.length, scrollAnchorRow + visibleCount + OVERSCAN);
  const visibleRows = useMemo(() => rows.slice(startIdx, endIdx), [rows, startIdx, endIdx]);
  const topPad = startIdx * ROW_HEIGHT;
  const bottomPad = (rows.length - endIdx) * ROW_HEIGHT;

  const dayHead = (d: OverviewDay, j: number) => (
    <th
      key={d.date}
      scope="col"
      className={`${headCell} h-[46px] px-2.5 text-right normal-case tracking-normal whitespace-nowrap ${
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
      className={`rounded-2xl bg-base-100 border border-base-content/9 shadow-xs overflow-hidden ${
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
                : "bg-base-100 border-base-content/9 text-base-content hover:border-[#4f46e5] hover:text-[#4f46e5]"
            }`}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            <span>{isFullscreen ? "Exit" : "Full"}</span>
          </button>
        </div>
      </header>

      {/* Fixed-position copy of the x-scrollbar, rendered in body so ancestors can't clip it. */}
      {createPortal(
        <div
          ref={dockedScrollbarRef}
          role="region"
          aria-label="SO Balance Overview horizontal scroll"
          tabIndex={0}
          onScroll={handleDockedScroll}
          style={{
            display: "none",
            position: "fixed",
            overflowX: "scroll",
            overflowY: "hidden",
            boxSizing: "content-box",
            zIndex: 40,
            borderTop: "1px solid var(--color-base-300)",
            backgroundColor: "var(--color-base-100)",
          }}
        >
          <div ref={dockedScrollContentRef} style={{ height: 1 }} />
        </div>,
        document.body
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ overflowAnchor: "none" }}
        className={`overflow-auto border-t border-base-content/9 transition-opacity ${
          isFullscreen ? "flex-1 min-h-0" : "max-h-[calc(100vh-330px)] min-h-[260px]"
        } ${loading && hasData ? "opacity-60" : ""}`}
      >
        <table
          ref={tableRef}
          className="table-fixed border-separate border-spacing-0 text-[12.5px] tabular-nums"
          style={{ width: Math.max(1100, 185 + 68 + 104 + Math.max(n, 1) * 84) }}
        >
          <colgroup>
            <col style={{ width: 185 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 104 }} />
            {indexes.map((d) => (
              <col key={`col-${d}`} style={{ width: 84 }} />
            ))}
          </colgroup>
          <thead ref={theadRef} className="sticky -top-px z-20 bg-base-200">
            <tr>
              <th rowSpan={2} scope="col" className={`${headCell} sticky left-0 z-30 px-3 text-left shadow-[1px_0_0_var(--color-base-300),0_-3px_0_var(--color-base-200)]`}>
                Product
              </th>
              <th rowSpan={2} scope="col" className={`${headCell} px-2 text-center shadow-[0_-3px_0_var(--color-base-200)]`}>Type</th>
              <th rowSpan={2} scope="col" className={`${headCell} px-3 text-right shadow-[0_-3px_0_var(--color-base-200)]`}>Inventory</th>
              <th colSpan={Math.max(n, 1)} scope="colgroup" className={`${headCell} h-[30px] px-2 text-center shadow-[0_-3px_0_var(--color-base-200)] ${groupStart}`}>
                SO Balance <span className="font-medium normal-case tracking-normal text-base-content/55">· Ready / Net Req</span>
              </th>
            </tr>
            <tr>
              {indexes.map((d, j) => dayHead(days[d], j))}
            </tr>
            {n > 0 && (
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-30 h-[48px] px-3 text-left bg-base-100 border-b-2 border-b-base-content/9 shadow-[1px_0_0_color-mix(in_oklab,var(--color-base-content)_9%,transparent)] whitespace-nowrap"
                >
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-base-content/80">
                    <span className="size-2 rounded-full bg-rose-500 shrink-0" aria-hidden="true" />
                    <span>Daily Short</span>
                  </div>
                </th>
                <th aria-hidden="true" className="h-[48px] bg-base-100 border-b-2 border-b-base-content/9" />
                <th aria-hidden="true" className="h-[48px] bg-base-100 border-b-2 border-b-base-content/9" />
                {indexes.map((d, j) => {
                  const s = dailyShort[j];
                  const hasShort = s.products > 0;
                  return (
                    <th
                      key={`short-${d}`}
                      title={
                        hasShort
                          ? `${dayLabel(days[d].date)} · ${formatQty(s.products)} products short (${formatQty(s.pcs)} pcs)`
                          : `${dayLabel(days[d].date)} · No short products`
                      }
                      className={`h-[48px] px-2.5 text-right whitespace-nowrap bg-base-100 border-b-2 border-b-base-content/9 ${
                        j === 0 ? groupStart : dayBorder
                      } ${hasShort ? "" : "text-base-content/30"}`}
                    >
                      {hasShort ? (
                        <>
                          <div className="text-[12px] font-bold leading-tight text-rose-600">
                            {formatQty(s.pcs)}
                          </div>
                          <div className="leading-tight mt-0.5 text-base-content/70">
                            <span className="text-[12px] font-semibold">{formatQty(s.products)}</span>{" "}
                            <span className="text-[10.5px] font-semibold">prd</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium">-</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
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
              <tr aria-hidden="true" style={{ height: topPad }}>
                <td colSpan={colCount} style={{ height: topPad, padding: 0, border: 0, fontSize: 0, lineHeight: 0 }} />
              </tr>
            )}
            {visibleRows.map((r) => (
              <BalanceRow key={r.prd_name} r={r} days={days} indexes={indexes} />
            ))}
            {bottomPad > 0 && (
              <tr aria-hidden="true" style={{ height: bottomPad }}>
                <td colSpan={colCount} style={{ height: bottomPad, padding: 0, border: 0, fontSize: 0, lineHeight: 0 }} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 border-t border-base-content/9 text-xs text-base-content/60 shrink-0">
        <span>
          Showing {formatQty(rows.length)} of {formatQty(totalProducts)} products
          {calendarFallback && " · working-day calendar unavailable, Sundays hidden"}
        </span>
      </footer>
    </section>
  );
};

export default memo(BalanceTable);
