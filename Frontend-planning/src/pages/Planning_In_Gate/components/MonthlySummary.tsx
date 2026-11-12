import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import type { CountUnit, GateGroup, MonthCell, MonthDay, MonthSummaryData, SavedPlanInfo } from "../types";
import type { InGateTab } from "../mock/inGateMockData";
import { buildMonthSummary, dayTotals, toUnit, UNIT_LABEL } from "../mock/monthlyMockData";
import { MonthlyChart, type ChartDay } from "./MonthlyChart";
import { MonthlyLotPopover, type PopoverTarget } from "./MonthlyLotPopover";
import { MonthlyLotDrawer, type DrawerTarget } from "./MonthlyLotDrawer";

const DS_CHIP = "bg-[#fdecb3] text-[#8a5a00]";
const NS_CHIP = "bg-[#e9e3fb] text-[#5a3fc0]";
// Thin line between days (not after the hatched week gap)
const daySep = (d: MonthDay, i: number) => (i > 0 && d.dow !== 1 ? "border-l border-base-content/10" : "");
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const fmt = (n: number) => n.toLocaleString();
const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

interface MonthlySummaryProps {
  tabs: InGateTab[];
  plans: Partial<Record<GateGroup, SavedPlanInfo>>;
  gateId: string;
  onGateChange: (id: string) => void;
  month: string; // YYYY-MM
  today: string;
  unit: CountUnit;
  search: string;
}

export const MonthlySummary: React.FC<MonthlySummaryProps> = ({
  tabs,
  plans,
  gateId,
  onGateChange,
  month,
  today,
  unit,
  search,
}) => {
  const [target, setTarget] = useState<PopoverTarget | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null);

  const dataByGate = useMemo(() => {
    const out: Record<string, MonthSummaryData> = {};
    tabs.forEach((t) => {
      const p = plans[t.group];
      if (p) out[t.gate.id] = buildMonthSummary(t.scope, t.gate, month, p.version, today);
    });
    return out;
  }, [tabs, plans, month, today]);

  const tab = tabs.find((t) => t.gate.id === gateId) ?? tabs[0];
  const data = dataByGate[tab.gate.id];
  const planVersion = plans[tab.group]?.version ?? 1;
  const seedKey = `${tab.scope}|${tab.gate.id}|${month}|v${planVersion}`;

  // Close the lot popover whenever the context changes
  useEffect(() => {
    setTarget(null);
    setDrawer(null);
  }, [gateId, month, unit, search]);

  const q = search.trim().toLowerCase();
  const rows = useMemo(
    () =>
      q
        ? data.rows.filter((r) => r.product.name.toLowerCase().includes(q) || r.product.code.toLowerCase().includes(q))
        : data.rows,
    [data, q]
  );

  const totals = useMemo(() => dayTotals(data, unit, rows), [data, unit, rows]);
  const workDays = data.days.filter((d) => !d.off);
  const u = UNIT_LABEL[unit];

  const kpi = useMemo(() => {
    let out = 0, planToDate = 0, planMonth = 0, ds = 0, ns = 0, outPast = 0, pastDays = 0, below = 0, daysLeft = 0;
    workDays.forEach((d) => {
      const t = totals[d.date];
      planMonth += t.plan;
      if (d.phase !== "past") daysLeft += 1;
      if (d.phase === "future") return;
      out += t.ds + t.ns;
      planToDate += t.plan;
      if (d.phase === "past") {
        pastDays += 1;
        ds += t.ds;
        ns += t.ns;
        outPast += t.ds + t.ns;
        if (t.ds + t.ns < t.plan) below += 1;
      }
    });
    return { out, planToDate, planMonth, ds, ns, outPast, pastDays, below, daysLeft };
  }, [workDays, totals]);

  const chartData: ChartDay[] = useMemo(
    () =>
      data.days.map((d) => {
        const t = totals[d.date];
        const actual = !d.off && t.hasActual;
        return {
          date: d.date,
          label: String(d.day),
          off: d.off,
          phase: d.phase,
          ds: actual ? t.ds : null,
          ns: actual ? t.ns : null,
          planFuture: !d.off && !t.hasActual && t.plan > 0 ? t.plan : null,
          plan: d.off || t.plan === 0 ? null : t.plan,
        };
      }),
    [data, totals]
  );

  const open = (date: string, productCode: string | null, el: Element) =>
    setTarget({ date, productCode, rect: el.getBoundingClientRect() });

  const monthLabel = dayjs(`${month}-01`).format("MMM");
  const avg = kpi.pastDays ? kpi.outPast / kpi.pastDays : 0;
  const planAvg = workDays.length ? kpi.planMonth / workDays.length : 0;
  const digits = unit === "lots" ? 1 : 0;
  const one = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  return (
    <div className="rounded-2xl bg-base-100 border border-base-300 shadow-xs overflow-hidden">
      {/* Gate tabs */}
      <div className="flex gap-1 overflow-x-auto bg-[#316be8] px-4 pt-3">
        {tabs.map(({ gate: g }) => {
          const active = g.id === tab.gate.id;
          const d = dataByGate[g.id];
          const total = d ? Object.values(dayTotals(d, unit)).reduce((s, t) => s + t.plan, 0) : 0;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => onGateChange(g.id)}
              className={`shrink-0 rounded-t-lg px-5 py-2 text-left cursor-pointer transition-colors ${
                active ? "bg-base-100 text-[#4f46e5]" : "text-white hover:bg-white/10"
              }`}
            >
              <div className="text-sm font-bold">{g.name}</div>
              <div className={`text-xs tabular-nums ${active ? "text-base-content/60" : "text-white/80"}`}>
                {fmt(total)} {u}
                {active && ` · ${monthLabel}`}
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider">Monthly summary</h2>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Kpi title="Out month-to-date" sub={`${kpi.planToDate ? Math.round((kpi.out / kpi.planToDate) * 100) : 0}% of plan to date`}>
            {fmt(kpi.out)} <Small>/ {fmt(kpi.planToDate)} {u}</Small>
          </Kpi>
          <Kpi title="Plan this month" sub={`${fmt(Math.max(0, kpi.planMonth - kpi.out))} ${u} to go · ${kpi.daysLeft} working days`}>
            {fmt(kpi.planMonth)} <Small>{u}</Small>
          </Kpi>
          <Kpi title="Daily average" sub={`plan avg ${one(planAvg)} ${u}/day`}>
            {one(avg)} <Small>{u}</Small>
          </Kpi>
          <Kpi
            title="By shift (to yesterday)"
            sub={`N/S = ${kpi.outPast ? Math.round((kpi.ns / kpi.outPast) * 100) : 0}% of output`}
          >
            <span className="text-[#c98a00]">{fmt(kpi.ds)}</span> <Small>D/S ·</Small>{" "}
            <span className="text-[#6d4fd8]">{fmt(kpi.ns)}</span> <Small>N/S</Small>
          </Kpi>
          <Kpi title="Days below plan" sub="Click a day to see which lots are missing">
            <span className={kpi.below ? "text-rose-600" : ""}>{kpi.below}</span> <Small>/ {kpi.pastDays} days</Small>
          </Kpi>
        </div>

        <MonthlyChart data={chartData} onPick={(date, el) => open(date, null, el)} />

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/70">
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#f5c542]" /> D/S actual</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm bg-[#6d4fd8]" /> N/S actual</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-sm border border-dashed border-base-content/40" /> Plan (future days)</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-5 bg-[#f97316]" /> Saved plan (Plan v{planVersion})</span>
          <span className="ml-auto">Click a bar or cell → see lots and scan in/out times</span>
        </div>

        {/* Product × day table */}
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-base-content/60">
                <th className="sticky left-0 z-10 bg-base-100 py-2 pr-4 text-left font-semibold uppercase tracking-wide border-b border-base-300 min-w-[170px]">
                  Product
                </th>
                {workDays.map((d, i) => (
                  <React.Fragment key={d.date}>
                    {d.dow === 1 && <WeekGap head />}
                    <th
                      className={`px-1 py-2 text-center font-normal border-b border-base-300 min-w-[88px] ${daySep(d, i)} ${
                        d.phase === "today" ? "bg-[#316be8] !text-white rounded-t-lg" : ""
                      }`}
                    >
                      <div>{DOW[d.dow]}</div>
                      <div className={`text-sm font-bold ${d.phase === "today" ? "" : "text-base-content"}`}>{d.day}</div>
                    </th>
                  </React.Fragment>
                ))}
                <th className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right font-semibold uppercase tracking-wide border-b border-base-300 min-w-[90px]">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                let actual = 0, planLeft = 0;
                workDays.forEach((d) => {
                  const c = r.cells[d.date];
                  if (!c) return;
                  if (c.ds === null) planLeft += toUnit(c.plan, r.product, unit);
                  else actual += toUnit(c.ds + (c.ns ?? 0), r.product, unit);
                });
                return (
                  <tr key={r.product.code}>
                    <td className="sticky left-0 z-10 bg-base-100 py-2 pr-4 border-b border-base-200">
                      <div className="font-bold">{r.product.name}</div>
                      <div className="text-xs text-base-content/50">{r.product.code}</div>
                    </td>
                    {workDays.map((d, i) => (
                      <React.Fragment key={d.date}>
                        {d.dow === 1 && <WeekGap />}
                        <td className={`px-1 py-1 border-b border-base-200 ${daySep(d, i)}`}>
                          <Cell
                            cell={r.cells[d.date]}
                            day={d}
                            value={(n) => toUnit(n, r.product, unit)}
                            unit={unit}
                            selected={target?.date === d.date && target.productCode === r.product.code}
                            onClick={(el) => open(d.date, r.product.code, el)}
                          />
                        </td>
                      </React.Fragment>
                    ))}
                    <td className="sticky right-0 z-10 bg-base-100 py-2 pl-3 text-right border-b border-base-200">
                      <div className="font-semibold text-base-content/80">{fmt(actual)}</div>
                      <div className="text-xs text-base-content/50">+ plan {fmt(planLeft)}</div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={99} className="py-10 text-center text-base-content/50">
                    No product matches “{search}”
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-base-100 py-3 pr-4 font-bold border-t-2 border-base-300">Total / Plan</td>
                  {workDays.map((d, i) => {
                    const t = totals[d.date];
                    const sum = t.ds + t.ns;
                    return (
                      <React.Fragment key={d.date}>
                        {d.dow === 1 && <WeekGap foot />}
                        <td
                          className={`py-3 text-center whitespace-nowrap border-t-2 border-base-300 ${daySep(d, i)}`}
                          title={`${fmt(sum)} / ${fmt(t.plan)} ${u}`}
                        >
                          {t.hasActual ? (
                            <>
                              <span className={`text-sm font-semibold ${d.phase === "past" && sum < t.plan ? "text-rose-500" : "text-base-content/85"}`}>
                                {unit === "lots" ? sum : compact(sum)}
                              </span>
                              <span className="ml-1 text-[11px] text-base-content/40">/ {unit === "lots" ? t.plan : compact(t.plan)}</span>
                            </>
                          ) : (
                            <span className="text-sm text-base-content/30">{unit === "lots" ? t.plan : compact(t.plan)}</span>
                          )}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="sticky right-0 z-10 bg-base-100 py-3 pl-3 text-right border-t-2 border-base-300">
                    <div className="font-semibold text-base-content/80">{fmt(kpi.out)}</div>
                    <div className="text-xs text-base-content/50">/ {fmt(kpi.planMonth)}</div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Cell legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-base-content/60">
          <span className="inline-flex items-center gap-1">
            <b className={`rounded px-1.5 ${DS_CHIP}`}>12</b>
            <b className={`rounded px-1.5 ${NS_CHIP}`}>8</b>
            <b className="ml-0.5 text-[13px] font-medium text-base-content/85">20</b>
          </span>
          <span>
            Last number = total (TTL) · <b className="text-[#c98a00]">yellow</b> = D/S · <b className="text-[#6d4fd8]">purple</b> = N/S
          </span>
          <span>
            <b className="text-rose-500">red</b> = below plan
          </span>
          <span>
            <span className="text-base-content/30">20</span> = plan (future days)
          </span>
        </div>
      </div>

      {target && (
        <MonthlyLotPopover
          target={target}
          gateName={tab.gate.name}
          seedKey={seedKey}
          rows={rows}
          day={data.days.find((d) => d.date === target.date)!}
          onClose={() => setTarget(null)}
          onViewAll={() => {
            setDrawer({ date: target.date, productCode: target.productCode });
            setTarget(null);
          }}
        />
      )}
      {drawer && (
        <MonthlyLotDrawer target={drawer} gateName={tab.gate.name} seedKey={seedKey} rows={rows} onClose={() => setDrawer(null)} />
      )}
    </div>
  );
};

const Small: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-sm font-semibold text-base-content/60">{children}</span>
);

const Kpi: React.FC<{ title: string; sub: string; children: React.ReactNode }> = ({ title, sub, children }) => (
  <div className="rounded-xl border border-base-300 px-4 py-3">
    <div className="text-[11px] font-bold uppercase tracking-wider text-base-content/60">{title}</div>
    <div className="mt-0.5 text-2xl font-extrabold tabular-nums leading-tight">{children}</div>
    <div className="text-xs text-base-content/60">{sub}</div>
  </div>
);

/** Hatched spacer between weeks (where the OFF Sunday is) */
const WeekGap: React.FC<{ head?: boolean; foot?: boolean }> = ({ head, foot }) => (
  <td
    aria-hidden
    className={`w-3 min-w-3 p-0 ${head ? "border-b border-base-300" : foot ? "border-t-2 border-base-300" : "border-b border-base-200"}`}
    style={
      head
        ? undefined
        : {
            backgroundImage:
              "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-base-content) 9%, transparent) 0 3px, transparent 3px 6px)",
          }
    }
  />
);

interface CellProps {
  cell: MonthCell | undefined;
  day: MonthDay;
  value: (lots: number) => number;
  unit: CountUnit;
  selected: boolean;
  onClick: (el: Element) => void;
}

const Cell: React.FC<CellProps> = ({ cell, day, value, unit, selected, onClick }) => {
  if (!cell) return null;
  const show = (n: number) => (unit === "lots" ? n : compact(value(n)));
  const base = `w-full rounded-md px-1 py-1.5 cursor-pointer transition-colors hover:bg-base-200/70 ${
    selected ? "ring-2 ring-[#f97316] bg-base-100" : ""
  }`;

  if (cell.ds === null) {
    return (
      <button type="button" onClick={(e) => onClick(e.currentTarget)} title="Plan (no scan out yet)" className={`${base} text-center`}>
        <span className="text-sm text-base-content/30">{show(cell.plan)}</span>
      </button>
    );
  }

  const total = cell.ds + (cell.ns ?? 0);
  const below = day.phase === "past" && total < cell.plan;
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.currentTarget)}
      title={`D/S ${show(cell.ds)} · N/S ${cell.ns === null ? "–" : show(cell.ns)} · plan ${show(cell.plan)}`}
      className={`${base} flex items-center justify-center gap-1 whitespace-nowrap`}
    >
      <span className={`min-w-5 rounded px-1 text-center text-[11px] font-semibold leading-5 ${DS_CHIP}`}>{show(cell.ds)}</span>
      <span
        className={`min-w-5 rounded px-1 text-center text-[11px] font-semibold leading-5 ${
          cell.ns === null ? "bg-base-200/60 text-base-content/30" : NS_CHIP
        }`}
      >
        {cell.ns === null ? "–" : show(cell.ns)}
      </span>
      <span className={`min-w-6 text-right text-[13px] font-medium ${below ? "text-rose-500" : "text-base-content/85"}`}>{show(total)}</span>
    </button>
  );
};
