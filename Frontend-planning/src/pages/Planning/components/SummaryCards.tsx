import { CheckCircle2, Factory, Package, Clock } from "lucide-react";
import type { PlanningSummaryRow } from "../types";

interface SummaryCardsProps {
  summary: PlanningSummaryRow[];
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const SummaryCards = ({ summary }: SummaryCardsProps) => {
  const ready = summary.find((s) => s.status === "ready");
  const plan = summary.find((s) => s.status === "production plan");
  const totalRows = summary.reduce((sum, s) => sum + s.total_rows, 0);
  const totalPo = summary.reduce((sum, s) => sum + s.po_bal, 0);
  const updatedAt = summary.map((s) => s.updated_at).sort().pop() ?? "-";

  const cards = [
    {
      title: "Total PO",
      value: fmt(totalRows),
      sub: `PO Balance ${fmt(totalPo)} pcs`,
      icon: Package,
      color: "text-info",
    },
    {
      title: "Ready (Stock Sufficient)",
      value: fmt(ready?.total_rows ?? 0),
      sub: `${fmt(ready?.total_products ?? 0)} products`,
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      title: "Production Plan (To Produce)",
      value: fmt(plan?.total_rows ?? 0),
      sub: `Net Required ${fmt(plan?.net_required_pcs ?? 0)} pcs`,
      icon: Factory,
      color: "text-error",
    },
    {
      title: "Last Calculated",
      value: updatedAt === "-" ? "-" : updatedAt.slice(11, 16),
      sub: updatedAt === "-" ? "No data yet" : updatedAt.slice(0, 10),
      icon: Clock,
      color: "text-base-content/70",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(({ title, value, sub, icon: Icon, color }) => (
        <div key={title} className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body p-4 flex-row items-center gap-4">
            <div className={`p-3 rounded-box bg-base-200 ${color}`}>
              <Icon size={26} />
            </div>
            <div className="min-w-0">
              <div className="text-xs text-base-content/60 truncate">{title}</div>
              <div className={`text-2xl font-bold ${color}`}>{value}</div>
              <div className="text-xs text-base-content/60 truncate">{sub}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SummaryCards;
