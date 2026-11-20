import { memo } from "react";
import { Target, Cpu, Flame, Boxes, Activity } from "lucide-react";
import { BlueStatCard, CardStat, StatusBadge } from "@/components/BlueStatCard";
import type { PlanningSummaryKPI } from "../types";

interface SummaryCardsProps {
  kpi: PlanningSummaryKPI;
}

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const SummaryCards = ({ kpi }: SummaryCardsProps) => {
  const topCount = kpi.top_count ?? 0;
  const urgentCount = kpi.urgent_count ?? 0;
  const highCount = kpi.high_count ?? 0;
  const totalPriority = topCount + urgentCount + highCount;

  const wipCount = kpi.wip_count ?? 0;
  const pendingCount = kpi.pending_count ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {/* 1. Net Required */}
      <BlueStatCard icon={Target} tone="blue" title="Net Required" value={fmt(kpi.total_net_required)} unit="pcs">
        <CardStat label="Demand Plan" value={`${fmt(kpi.total_products)} products`} />
      </BlueStatCard>

      {/* 2. Net WIP Qty */}
      <BlueStatCard
        icon={Cpu}
        tone="green"
        title="Total Net WIP"
        badge={<StatusBadge tone="green" title="Lots in process">{fmt(kpi.total_lots)} lots</StatusBadge>}
        value={fmt(kpi.total_net_wip)}
        unit="pcs"
      >
        <CardStat label="In Process" value={`${fmt(kpi.total_lots)} lots`} />
      </BlueStatCard>

      {/* 3. Priority: Top / Urgent / High */}
      <BlueStatCard
        icon={Flame}
        tone="red"
        title="Priority Orders"
        badge={<StatusBadge tone="red" title="Urgent lines">{fmt(urgentCount)} urgent</StatusBadge>}
        value={fmt(totalPriority)}
        unit="lines"
      >
        <div className="grid grid-cols-3 gap-2">
          <CardStat label="Top" value={fmt(topCount)} />
          <CardStat label="Urgent" value={fmt(urgentCount)} />
          <CardStat label="High" value={fmt(highCount)} align="right" />
        </div>
      </BlueStatCard>

      {/* 4. Products & Lots */}
      <BlueStatCard icon={Boxes} title="Products & Lots" value={fmt(kpi.total_products)} unit="products">
        <CardStat label="Total Lines" value={`${fmt(kpi.total_rows)} lines`} />
      </BlueStatCard>

      {/* 5. Lot Status */}
      <BlueStatCard
        icon={Activity}
        title="Lot Status"
        value={fmt(wipCount)}
        unit="WIP"
      >
        <CardStat label="Pending" value={`${fmt(pendingCount)} lots`} />
      </BlueStatCard>
    </div>
  );
};

export default memo(SummaryCards);
