import { memo, type ReactNode } from "react";
import { Target, Cpu, Flame, Boxes, Activity } from "lucide-react";
import { KpiCard, KpiFooter, KpiHeader, KpiMetric, KpiRatioBar, KpiValue } from "@/components/KpiCard";
import type { PlanningSummaryKPI } from "../types";

interface SummaryCardsProps {
  kpi: PlanningSummaryKPI;
}

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const Pill = ({ className, children }: { className: string; children: ReactNode }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold leading-none ${className}`}>{children}</span>
);

const SummaryCards = ({ kpi }: SummaryCardsProps) => {
  const topCount = kpi.top_count ?? 0;
  const urgentCount = kpi.urgent_count ?? 0;
  const highCount = kpi.high_count ?? 0;
  const totalPriority = topCount + urgentCount + highCount;

  const wipCount = kpi.wip_count ?? 0;
  const pendingCount = kpi.pending_count ?? 0;

  const cardBorder = "border-base-content/9! [&_.border-t]:border-base-content/8";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {/* 1. Net Required */}
      <KpiCard className={cardBorder}>
        <KpiHeader icon={Target} tone="blue" title="Net Required" />
        <KpiValue value={fmt(kpi.total_net_required)} unit="pcs" tone="blue" />
        <KpiFooter cols={1}>
          <KpiMetric label="Demand Plan" value={`${fmt(kpi.total_products)} products`} />
        </KpiFooter>
      </KpiCard>

      {/* 2. Net WIP */}
      <KpiCard className={cardBorder}>
        <KpiHeader icon={Cpu} tone="green" title="Total Net WIP" />
        <KpiValue value={fmt(kpi.total_net_wip)} unit="pcs" tone="green" />
        <KpiFooter cols={1}>
          <KpiMetric label="In Process" value={`${fmt(kpi.total_lots)} lots`} />
        </KpiFooter>
      </KpiCard>

      {/* 3. Priority: Top / Urgent / High */}
      <KpiCard className={cardBorder}>
        <KpiHeader
          icon={Flame}
          tone="red"
          title="Priority Orders"
          right={
            urgentCount > 0 ? <Pill className="bg-rose-100 text-rose-700">{fmt(urgentCount)} urgent</Pill> : undefined
          }
        />
        <KpiValue value={fmt(totalPriority)} unit="lines" tone="red" />
        <KpiRatioBar
          segments={[
            { value: topCount, tone: "red", label: "Top" },
            { value: urgentCount, tone: "amber", label: "Urgent" },
            { value: highCount, tone: "blue", label: "High" },
          ]}
        />
        <KpiFooter cols={3}>
          <KpiMetric label="Top" value={fmt(topCount)} valueClass="text-rose-600" />
          <KpiMetric label="Urgent" value={fmt(urgentCount)} align="center" valueClass="text-amber-600" />
          <KpiMetric label="High" value={fmt(highCount)} align="right" valueClass="text-blue-600" />
        </KpiFooter>
      </KpiCard>

      {/* 4. Products & Lines */}
      <KpiCard className={cardBorder}>
        <KpiHeader icon={Boxes} tone="blue" title="Products & Lots" />
        <KpiValue value={fmt(kpi.total_products)} unit="products" />
        <KpiFooter cols={1}>
          <KpiMetric label="Total Lines" value={`${fmt(kpi.total_rows)} lines`} />
        </KpiFooter>
      </KpiCard>

      {/* 5. Lot Status: WIP vs Pending */}
      <KpiCard className={cardBorder}>
        <KpiHeader icon={Activity} tone="blue" title="Lot Status" />
        <KpiValue value={fmt(wipCount + pendingCount)} unit="lots" />
        <KpiRatioBar
          segments={[
            { value: wipCount, tone: "green", label: "WIP" },
            { value: pendingCount, tone: "amber", label: "Pending" },
          ]}
        />
        <KpiFooter>
          <KpiMetric label="WIP" value={`${fmt(wipCount)} lots`} valueClass="text-emerald-600" />
          <KpiMetric label="Pending" value={`${fmt(pendingCount)} lots`} align="right" valueClass="text-amber-600" />
        </KpiFooter>
      </KpiCard>
    </div>
  );
};

export default memo(SummaryCards);
