import { memo, type ReactNode } from "react";
import {
  Target,
  Cpu,
  Flame,
  Boxes,
  Activity,
  type LucideIcon,
} from "lucide-react";
import type { PlanningSummaryKPI } from "../types";

interface SummaryCardsProps {
  kpi: PlanningSummaryKPI;
}

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const SummaryCards = ({ kpi }: SummaryCardsProps) => {
  const urgentCount = kpi.urgent_count ?? 0;
  const highCount = kpi.high_count ?? 0;
  const totalPriority = urgentCount + highCount;

  const wipCount = kpi.wip_count ?? 0;
  const pendingCount = kpi.pending_count ?? 0;

  const cards: {
    title: string;
    value: string;
    unit: string;
    sub: ReactNode;
    icon: LucideIcon;
    cardStyle: string;
    iconStyle: string;
    valueColor: string;
  }[] = [
    // 1. Net Required
    {
      title: "Net Required",
      value: fmt(kpi.total_net_required),
      unit: "pcs",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Demand Plan</span>
          <span className="font-bold text-amber-500 truncate">
            {fmt(kpi.total_products)} products
          </span>
        </div>
      ),
      icon: Target,
      cardStyle: "border-base-200/90 bg-base-100 hover:border-amber-500/50",
      iconStyle: "bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/25",
      valueColor: "text-amber-500",
    },

    // 2. Net WIP Qty
    {
      title: "Total Net WIP",
      value: fmt(kpi.total_net_wip),
      unit: "pcs",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">In Process</span>
          <span className="font-bold text-emerald-500 truncate">
            {fmt(kpi.total_lots)} lots
          </span>
        </div>
      ),
      icon: Cpu,
      cardStyle: "border-base-200/90 bg-base-100 hover:border-emerald-500/50",
      iconStyle: "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25",
      valueColor: "text-emerald-500",
    },

    // 3. Priority: Urgent / High
    {
      title: "Priority Orders",
      value: fmt(totalPriority),
      unit: "lines",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0 font-medium text-rose-600">
            Urgent: <span className="font-bold">{fmt(urgentCount)}</span>
          </span>
          <span className="shrink-0 font-medium text-amber-600 dark:text-amber-400">
            High: <span className="font-bold">{fmt(highCount)}</span>
          </span>
        </div>
      ),
      icon: Flame,
      cardStyle: "border-base-200/90 bg-base-100 hover:border-rose-500/50",
      iconStyle: "bg-rose-500/15 text-rose-600 ring-1 ring-rose-500/25",
      valueColor: "text-rose-600",
    },

    // 4. Products & Lots
    {
      title: "Products & Lots",
      value: fmt(kpi.total_products),
      unit: "products",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Total Lines</span>
          <span className="font-bold text-primary truncate">
            {fmt(kpi.total_rows)} lines
          </span>
        </div>
      ),
      icon: Boxes,
      cardStyle: "border-base-200/90 bg-base-100 hover:border-primary/50",
      iconStyle: "bg-primary/15 text-primary ring-1 ring-primary/25",
      valueColor: "text-primary",
    },

    // 5. Lot Status
    {
      title: "Lot Status",
      value: fmt(wipCount),
      unit: "WIP",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Pending</span>
          <span className="font-bold text-amber-600 dark:text-amber-400 truncate">
            {fmt(pendingCount)} lots
          </span>
        </div>
      ),
      icon: Activity,
      cardStyle: "border-base-200/90 bg-base-100 hover:border-info/50",
      iconStyle: "bg-info/15 text-info ring-1 ring-info/25",
      valueColor: "text-info",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 xl:gap-3.5">
      {cards.map(
        ({
          title,
          value,
          unit,
          sub,
          icon: Icon,
          cardStyle,
          iconStyle,
          valueColor,
        }) => (
          <div
            key={title}
            className={`rounded-2xl border ${cardStyle} px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col`}
          >
            {/* Top row: Label + Icon */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs xl:text-[13px] font-bold text-base-content/65 uppercase tracking-wider truncate">
                {title}
              </span>
              <div className={`p-1.5 rounded-xl ${iconStyle} shrink-0`}>
                <Icon className="w-4 h-4 xl:w-[18px] xl:h-[18px]" />
              </div>
            </div>

            {/* Big Number + Unit */}
            <div className="flex items-baseline gap-1 mt-0.5 mb-1">
              <span
                className={`text-lg xl:text-xl font-bold tracking-tight leading-tight ${valueColor} tabular-nums`}
              >
                {value}
              </span>
              <span
                className={`text-[11px] font-medium lowercase ${valueColor} opacity-70`}
              >
                {unit}
              </span>
            </div>

            {/* Bottom Row */}
            <div className="mt-auto text-[13px] xl:text-sm leading-snug pt-1.5 border-t border-base-200/60">
              {sub}
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default memo(SummaryCards);
