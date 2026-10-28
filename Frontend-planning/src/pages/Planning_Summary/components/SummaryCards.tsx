import { memo, type ReactNode } from "react";
import {
  Package,
  Layers,
  ClipboardList,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import type { PlanningSummaryKPI } from "../types";

interface SummaryCardsProps {
  kpi: PlanningSummaryKPI;
}

const fmt = (n: number | null | undefined) =>
  Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

const SummaryCards = ({ kpi }: SummaryCardsProps) => {
  const cards: {
    title: string;
    value: string;
    unit: string;
    sub: ReactNode;
    icon: typeof Package;
    cardStyle: string;
    iconStyle: string;
    valueColor: string;
  }[] = [
    {
      title: "Total PO Balance",
      value: fmt(kpi.total_po_bal),
      unit: "pcs",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Total Lines</span>
          <span className="font-bold text-info truncate">
            {fmt(kpi.total_rows)} lines
          </span>
        </div>
      ),
      icon: Package,
      cardStyle:
        "border-base-200/90 bg-base-100 hover:border-info/50",
      iconStyle: "bg-info/15 text-info ring-1 ring-info/25",
      valueColor: "text-info",
    },
    {
      title: "Total Inventory",
      value: fmt(kpi.total_inventory),
      unit: "pcs",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">In Stock</span>
          <span className="font-bold text-primary truncate">
            {fmt(kpi.total_products)} items
          </span>
        </div>
      ),
      icon: Layers,
      cardStyle:
        "border-base-200/90 bg-base-100 hover:border-primary/50",
      iconStyle: "bg-primary/15 text-primary ring-1 ring-primary/25",
      valueColor: "text-primary",
    },
    {
      title: "Net Required",
      value: fmt(kpi.total_net_required),
      unit: "pcs",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Target Plan</span>
          <span className="font-bold text-amber-500 truncate">
            Active Demand
          </span>
        </div>
      ),
      icon: ClipboardList,
      cardStyle:
        "border-base-200/90 bg-base-100 hover:border-warning/50",
      iconStyle: "bg-warning/15 text-warning ring-1 ring-warning/25",
      valueColor: "text-amber-500",
    },
    {
      title: "Total WIP Qty",
      value: fmt(kpi.total_net_wip),
      unit: "pcs",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">In-Process</span>
          <span className="font-bold text-emerald-500 truncate">
            {fmt(kpi.total_lots)} lots
          </span>
        </div>
      ),
      icon: Cpu,
      cardStyle:
        "border-base-200/90 bg-base-100 hover:border-success/50",
      iconStyle: "bg-success/15 text-success ring-1 ring-success/25",
      valueColor: "text-emerald-500",
    },
    {
      title: "Hold / Issues",
      value: fmt(kpi.total_problems),
      unit: "lots",
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Attention</span>
          <span
            className={`font-bold truncate ${
              kpi.total_problems > 0 ? "text-error" : "text-base-content/50"
            }`}
          >
            {kpi.total_problems > 0 ? "Action Required" : "Normal"}
          </span>
        </div>
      ),
      icon: AlertTriangle,
      cardStyle:
        "border-base-200/90 bg-base-100 hover:border-error/50",
      iconStyle: "bg-error/15 text-error ring-1 ring-error/25",
      valueColor: "text-error",
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
