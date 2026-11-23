import { memo, useMemo } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { OverviewDay, OverviewProduct } from "../types";
import { computeTotals, dayLabel, dayWindow, formatQty } from "../overviewView";

interface BalanceTableProps {
  rows: OverviewProduct[];
  days: OverviewDay[];
  windowStart: number;
  onWindowStartChange: (start: number) => void;
  totalProducts: number;
  loading: boolean;
  calendarFallback: boolean;
  hasData: boolean;
}

const headCell = "sticky z-20 bg-base-200 border-b border-base-300 text-[11px] font-bold uppercase tracking-wider text-base-content/70";
const groupStart = "border-l-2 border-l-base-300";
const dayBorder = "border-l border-l-base-200";
const bodyCell = "h-9 px-2.5 text-right whitespace-nowrap border-b border-base-200";

const BalanceTable = ({
  rows,
  days,
  windowStart,
  onWindowStartChange,
  totalProducts,
  loading,
  calendarFallback,
  hasData,
}: BalanceTableProps) => {
  const { from, indexes, maxStart } = dayWindow(days.length, windowStart);
  const n = indexes.length;
  const totals = useMemo(
    () => computeTotals(rows, dayWindow(days.length, windowStart).indexes),
    [rows, days.length, windowStart]
  );

  const first = days[indexes[0]];
  const last = days[indexes[n - 1]];
  const windowText = first && last ? `${dayLabel(first.date)} – ${dayLabel(last.date)} · ${n} working days` : "No working days";
  const colCount = 3 + n * 2;

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
    <section aria-label="PO balance versus B/L FG" className="rounded-2xl bg-base-100 border border-base-300 shadow-xs overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[13.5px] font-extrabold tracking-wide text-base-content">PO BALANCE VS B/L FG</h2>
          <span className="text-xs text-base-content/60">{windowText} · Piece</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-base-content/70">
          <span><b className="text-base-content">PO Balance</b> = PO still open up to that day</span>
          <span><b className="text-base-content">B/L FG</b> = FG stock + WIP − PO Balance</span>
          <span className="inline-flex items-center gap-1.5"><span className="po-open size-3 rounded border border-base-300" aria-hidden="true" />PO open</span>
          <span className="inline-flex items-center gap-1.5"><span className="bl-ok size-3 rounded border border-base-300" aria-hidden="true" />Enough</span>
          <span className="inline-flex items-center gap-1.5"><span className="bl-short size-3 rounded border border-base-300" aria-hidden="true" />Short</span>
        </div>
      </header>

      <div className={`overflow-auto max-h-[calc(100vh-330px)] min-h-[260px] border-t border-base-300 transition-opacity ${loading && hasData ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-[12.5px] tabular-nums">
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className={`${headCell} top-0 left-0 z-30 min-w-[190px] px-3 text-left shadow-[1px_0_0_var(--color-base-300)]`}>
                Product
              </th>
              <th rowSpan={2} scope="col" className={`${headCell} top-0 w-[96px] px-3 text-right`}>FG Stock</th>
              <th rowSpan={2} scope="col" className={`${headCell} top-0 w-[100px] px-3 text-right`}>
                WIP
                <div className="font-medium normal-case tracking-normal text-base-content/55">after yield</div>
              </th>
              <th colSpan={Math.max(n, 1)} scope="colgroup" className={`${headCell} top-0 h-[30px] px-2 text-center ${groupStart}`}>
                PO Balance <span className="font-medium normal-case tracking-normal text-base-content/55">· cumulative</span>
              </th>
              <th colSpan={Math.max(n, 1)} scope="colgroup" className={`${headCell} top-0 h-[30px] px-2 text-center ${groupStart}`}>
                B/L FG <span className="font-medium normal-case tracking-normal text-base-content/55">· after PO</span>
              </th>
            </tr>
            <tr>
              {indexes.map((d, j) => dayHead(days[d], j))}
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
                    "No open PO in this range."
                  ) : (
                    "No products match the filters."
                  )}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const available = r.fg_stock + r.wip_qty;
              return (
                <tr key={r.prd_name} className="group">
                  <th
                    scope="row"
                    title={r.first_short >= 0 ? `${r.prd_name} · short from ${dayLabel(days[r.first_short].date)}` : `${r.prd_name} · enough through the range`}
                    className="sticky left-0 z-10 h-9 px-3 text-left font-normal bg-base-100 group-hover:bg-base-200 border-b border-base-200 shadow-[1px_0_0_var(--color-base-300)]"
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-[13px] text-base-content whitespace-nowrap">{r.prd_name}</span>
                      {r.type && (
                        <span className="inline-flex items-center h-[18px] px-1.5 rounded-md text-[10px] font-bold tracking-wide bg-base-200 text-base-content/70 border border-base-300">
                          {r.type}
                        </span>
                      )}
                    </span>
                  </th>
                  <td
                    className={`${bodyCell} px-3 font-semibold text-base-content group-hover:bg-base-200/60`}
                    title={r.unmovement ? `F/G ${formatQty(r.f_g)} + Unmovement ${formatQty(r.unmovement)}` : undefined}
                  >
                    {formatQty(r.fg_stock)}
                  </td>
                  <td
                    className={`${bodyCell} px-3 font-semibold group-hover:bg-base-200/60 ${r.wip_qty ? "text-base-content" : "text-base-content/55"}`}
                    title={`${formatQty(r.wip_lots)} lots in WIP`}
                  >
                    <span className="inline-flex items-center justify-end gap-1">
                      {r.wip_lots_no_yield > 0 && (
                        <span
                          role="img"
                          aria-label={`${r.wip_lots_no_yield} lots have yield 0 and are not counted`}
                          title={`${r.wip_lots_no_yield} lots have yield 0 and are not counted`}
                          className="inline-flex text-warning"
                        >
                          <AlertTriangle size={12} aria-hidden="true" />
                        </span>
                      )}
                      {formatQty(r.wip_qty)}
                    </span>
                  </td>
                  {indexes.map((d, j) => {
                    const cum = r.po_cum[d] ?? 0;
                    const added = r.po_new[d] ?? 0;
                    const label = dayLabel(days[d].date);
                    return cum > 0 ? (
                      <td
                        key={`po-${d}`}
                        className={`${bodyCell} po-open ${added ? "font-extrabold" : "font-medium"} ${j === 0 ? groupStart : dayBorder}`}
                        title={`${r.prd_name} · ${label} · PO open ${formatQty(cum)}${added ? ` (new PO ${formatQty(added)})` : ""}`}
                      >
                        {formatQty(-cum)}
                      </td>
                    ) : (
                      <td key={`po-${d}`} className={`${bodyCell} text-base-content/50 ${j === 0 ? groupStart : dayBorder}`}>
                        0
                      </td>
                    );
                  })}
                  {indexes.map((d, j) => {
                    const bl = r.bl[d] ?? 0;
                    const added = r.po_new[d] ?? 0;
                    const tone = bl < 0 ? "bl-short font-bold" : bl > 0 ? `bl-ok ${added ? "font-bold" : "font-medium"}` : "text-base-content/70";
                    return (
                      <td
                        key={`bl-${d}`}
                        className={`${bodyCell} ${tone} ${j === 0 ? groupStart : dayBorder}`}
                        title={`${r.prd_name} · ${dayLabel(days[d].date)} · B/L FG ${formatQty(bl)} = ${formatQty(available)} − ${formatQty(r.po_cum[d] ?? 0)}`}
                      >
                        {formatQty(bl)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>

          {rows.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" className="sticky left-0 bottom-0 z-30 h-10 px-3 text-left bg-base-200 border-t-2 border-base-300 shadow-[1px_0_0_var(--color-base-300)] whitespace-nowrap">
                  <span className="font-extrabold text-[13px] text-base-content">Total</span>{" "}
                  <span className="text-[11px] font-normal text-base-content/60">(B/L FG = total short)</span>
                </th>
                <td className="sticky bottom-0 z-20 px-3 text-right font-extrabold bg-base-200 border-t-2 border-base-300">{formatQty(totals.fg)}</td>
                <td className="sticky bottom-0 z-20 px-3 text-right font-extrabold bg-base-200 border-t-2 border-base-300">{formatQty(totals.wip)}</td>
                {totals.po.map((v, j) => (
                  <td key={`tpo-${j}`} className={`sticky bottom-0 z-20 px-2.5 text-right font-extrabold bg-base-200 border-t-2 border-base-300 ${j === 0 ? groupStart : dayBorder} ${v ? "" : "text-base-content/50"}`}>
                    {formatQty(-v)}
                  </td>
                ))}
                {totals.short.map((v, j) => (
                  <td key={`tbl-${j}`} className={`sticky bottom-0 z-20 px-2.5 text-right font-extrabold bg-base-200 border-t-2 border-base-300 ${j === 0 ? groupStart : dayBorder} ${v < 0 ? "text-short" : "text-enough"}`}>
                    {formatQty(v)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 border-t border-base-300 text-xs text-base-content/60">
        <span>
          Showing {formatQty(rows.length)} of {formatQty(totalProducts)} products · products that go short first are on top ·{" "}
          <b className="text-base-content">bold</b> = new PO that day · hover a cell for details
          {calendarFallback && " · working-day calendar unavailable, Sundays hidden"}
        </span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Days {n ? from + 1 : 0}–{from + n} of {days.length}
          </span>
          <button
            type="button"
            aria-label="Earlier days"
            className="btn btn-xs btn-square btn-outline border-base-300 h-8 w-8"
            disabled={from === 0}
            onClick={() => onWindowStartChange(Math.max(0, from - n))}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Later days"
            className="btn btn-xs btn-square btn-outline border-base-300 h-8 w-8"
            disabled={from >= maxStart}
            onClick={() => onWindowStartChange(Math.min(maxStart, from + n))}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </footer>
    </section>
  );
};

export default memo(BalanceTable);
