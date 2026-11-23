import { memo, type ReactNode } from "react";
import { formatQty, type OverviewKpi } from "../overviewView";

const Card = ({
  label,
  value,
  sub,
  valueClass = "text-[#2563eb]",
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
      sub="products with open SO"
    />
    <Card
      label={`SO Balance · ${horizon} days`}
      value={formatQty(kpi.po)}
      sub={`pcs due ${rangeText}`}
    />
    <Card
      label="Inventory (FG)"
      value={formatQty(kpi.fgStock)}
      sub="F/G + Unmovement"
    />
    <Card
      label="Ready"
      dot="bg-success"
      value={formatQty(kpi.enough)}
      valueClass="text-enough"
      sub={`products covered to ${endText}`}
    />
    <Card
      label="Net Req"
      dot="bg-error"
      value={formatQty(kpi.short)}
      valueClass="text-short"
      sub={`${formatQty(kpi.shortPcs)} pcs net req in total`}
    />
  </div>
);

export default memo(OverviewKpiCards);
