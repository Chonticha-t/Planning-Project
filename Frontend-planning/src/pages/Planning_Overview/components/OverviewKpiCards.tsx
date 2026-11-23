import { memo, type ReactNode } from "react";
import { formatQty, type OverviewKpi } from "../overviewView";

const Card = ({
  label,
  value,
  sub,
  valueClass = "text-base-content",
  dot,
}: {
  label: string;
  value: string;
  sub: ReactNode;
  valueClass?: string;
  dot?: string;
}) => (
  <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-base-100 border border-base-300 shadow-xs px-4 py-3">
    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-base-content/70">
      {dot && <span className={`size-2 rounded-full ${dot}`} aria-hidden="true" />}
      {label}
    </span>
    <span className={`text-2xl font-extrabold tabular-nums leading-tight ${valueClass}`}>{value}</span>
    <span className="truncate text-xs text-base-content/60">{sub}</span>
  </div>
);

interface OverviewKpiCardsProps {
  kpi: OverviewKpi;
  horizon: number;
  rangeText: string;
  endText: string;
}

const OverviewKpiCards = ({ kpi, horizon, rangeText, endText }: OverviewKpiCardsProps) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
    <Card
      label="Products"
      value={formatQty(kpi.products)}
      sub={`${formatQty(kpi.lots)} lots in WIP${kpi.lotsNoYield ? ` · ${formatQty(kpi.lotsNoYield)} with yield 0` : ""}`}
    />
    <Card
      label={`Ordered (PO) · ${horizon} days`}
      value={formatQty(kpi.po)}
      sub={`pcs due ${rangeText}`}
    />
    <Card
      label="Stock + WIP (after yield)"
      value={formatQty(kpi.fgStock + kpi.wip)}
      sub={`stock ${formatQty(kpi.fgStock)} · WIP ${formatQty(kpi.wip)}`}
    />
    <Card
      label="Enough"
      dot="bg-success"
      value={formatQty(kpi.enough)}
      valueClass="text-enough"
      sub={`products covered to ${endText}`}
    />
    <Card
      label="Short"
      dot="bg-error"
      value={formatQty(kpi.short)}
      valueClass="text-short"
      sub={`${formatQty(kpi.shortPcs)} pcs short in total`}
    />
  </div>
);

export default memo(OverviewKpiCards);
