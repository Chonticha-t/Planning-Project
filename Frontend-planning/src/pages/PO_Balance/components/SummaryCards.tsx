import { CheckCircle2, Factory, Package, Clock } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { PlanningSummaryRow } from "../types";
import { toDMY } from "../utils";

interface SummaryCardsProps {
  summary: PlanningSummaryRow[];
  lastUpdatedAt?: string;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const SummaryCards = ({ summary, lastUpdatedAt }: SummaryCardsProps) => {
  const ready = summary.find((s) => s.status === "ready");
  const plan = summary.find((s) => s.status === "production plan");
  const totalRows = summary.reduce((sum, s) => sum + s.total_rows, 0);
  const totalPo = summary.reduce((sum, s) => sum + s.po_bal, 0);
  const updatedAt =
    summary
      .map((s) => s.updated_at)
      .filter(Boolean)
      .sort()
      .pop() ||
    lastUpdatedAt ||
    "-";

  const cards: {
    title: string;
    tooltip?: string;
    value: string;
    sub: ReactNode;
    icon: typeof Package;
    cardStyle: string;
    iconStyle: string;
    valueColor: string;
  }[] = [
    {
      title: "Total PO",
      tooltip: "Total Purchase Orders",
      value: fmt(totalRows),
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">PO Balance</span>
          <span className="font-bold text-info truncate">{fmt(totalPo)} pcs</span>
        </div>
      ),
      icon: Package,
      cardStyle: "border-info/35 bg-gradient-to-br from-info/[0.05] to-base-100 hover:border-info/70",
      iconStyle: "bg-info/15 text-info ring-1 ring-info/25",
      valueColor: "text-info",
    },
    {
      title: "Ready",
      tooltip: "Ready (Stock Sufficient)",
      value: fmt(ready?.total_rows ?? 0),
      sub: (
        <>
          <div className="flex items-center justify-between gap-2 text-base-content/70">
            <span className="shrink-0">Ready</span>
            <span className="font-bold text-success truncate">{fmt(ready?.po_bal ?? 0)} pcs</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-base-content/70" title={`W/H F/G ${fmtMoney(ready?.wh_fg_amount ?? 0)} THB`}>
            <span className="shrink-0">W/H F/G</span>
            <span className="font-bold text-success truncate text-right">{fmtMoney(ready?.wh_fg_amount ?? 0)} THB</span>
          </div>
        </>
      ),
      icon: CheckCircle2,
      cardStyle: "border-success/35 bg-gradient-to-br from-success/[0.05] to-base-100 hover:border-success/70",
      iconStyle: "bg-success/15 text-success ring-1 ring-success/25",
      valueColor: "text-success",
    },
    {
      title: "Production Plan",
      tooltip: "Production Plan (To Produce)",
      value: fmt(plan?.total_rows ?? 0),
      sub: (
        <>
          <div className="flex items-center justify-between gap-2 text-base-content/70">
            <span className="shrink-0">Net Req</span>
            <span className="font-bold text-error truncate">{fmt(plan?.net_required_pcs ?? 0)} pcs</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-base-content/70" title={`Output ${fmtMoney(plan?.output_amount ?? 0)} THB`}>
            <span className="shrink-0">Output</span>
            <span className="font-bold text-error truncate text-right">{fmtMoney(plan?.output_amount ?? 0)} THB</span>
          </div>
        </>
      ),
      icon: Factory,
      cardStyle: "border-error/35 bg-gradient-to-br from-error/[0.05] to-base-100 hover:border-error/70",
      iconStyle: "bg-error/15 text-error ring-1 ring-error/25",
      valueColor: "text-error",
    },
    {
      title: "Last Calculated",
      tooltip: "Last Calculated Time",
      value: updatedAt === "-" ? "-" : updatedAt.slice(11, 16),
      sub: (
        <div className="flex items-center justify-between gap-2 text-base-content/70">
          <span className="shrink-0">Date</span>
          <span className="font-semibold text-base-content truncate">{updatedAt === "-" ? "No data yet" : toDMY(updatedAt)}</span>
        </div>
      ),
      icon: Clock,
      cardStyle: "border-base-300 bg-base-100 hover:border-base-content/30",
      iconStyle: "bg-base-200 text-base-content/70 ring-1 ring-base-300",
      valueColor: "text-base-content",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 min-[960px]:grid-cols-4 gap-3 xl:gap-3.5">
      {cards.map(({ title, tooltip, value, sub, icon: Icon, cardStyle, iconStyle, valueColor }) => (
        <div
          key={title}
          className={`rounded-2xl border ${cardStyle} px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:shadow-md transition-all duration-200 flex flex-col`}
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className="text-xs xl:text-[13px] font-bold text-base-content/65 uppercase tracking-wider truncate"
              title={tooltip || title}
            >
              {title}
            </span>
            <div className={`p-1.5 rounded-xl ${iconStyle} shrink-0`}>
              <Icon className="w-4 h-4 xl:w-[18px] xl:h-[18px]" />
            </div>
          </div>

          <div className={`text-2xl xl:text-3xl font-extrabold tracking-tight leading-tight ${valueColor} mt-0.5 mb-1`}>
            {value}
          </div>

          <div className="mt-auto text-[13px] xl:text-sm leading-snug flex flex-col gap-0.5">
            {sub}
          </div>
        </div>
      ))}
    </div>
  );
};

export default memo(SummaryCards);
