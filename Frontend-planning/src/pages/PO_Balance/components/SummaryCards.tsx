import { CheckCircle2, Factory, Package, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanningSummaryRow } from "../types";
import { toDMY } from "../utils";

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

  const cards: {
    title: string;
    value: string;
    sub: ReactNode;
    icon: typeof Package;
    color: string;
    borderColor: string;
  }[] = [
    {
      title: "Total PO",
      value: fmt(totalRows),
      sub: (
        <span>
          PO Balance <span className="font-semibold text-info">{fmt(totalPo)} pcs</span>
        </span>
      ),
      icon: Package,
      color: "text-info",
      borderColor: "border-info/60",
    },
    {
      title: "Ready (Stock Sufficient)",
      value: fmt(ready?.total_rows ?? 0),
      sub: (
        <span>
          <span className="font-semibold text-success">{fmt(ready?.total_products ?? 0)}</span> products
        </span>
      ),
      icon: CheckCircle2,
      color: "text-success",
      borderColor: "border-success/60",
    },
    {
      title: "Production Plan (To Produce)",
      value: fmt(plan?.total_rows ?? 0),
      sub: (
        <span>
          Net Required <span className="font-semibold text-error">{fmt(plan?.net_required_pcs ?? 0)} pcs</span>
        </span>
      ),
      icon: Factory,
      color: "text-error",
      borderColor: "border-error/60",
    },
    {
      title: "Last Calculated",
      value: updatedAt === "-" ? "-" : updatedAt.slice(11, 16),
      sub: <span>{updatedAt === "-" ? "No data yet" : toDMY(updatedAt)}</span>,
      icon: Clock,
      color: "text-base-content/70",
      borderColor: "border-base-content/50",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {cards.map(({ title, value, sub, icon: Icon, color, borderColor }) => (
        <div
          key={title}
          className={`card bg-base-100 border-[1.5px] ${borderColor} shadow-[0_1px_3px_rgba(0,0,0,0.04)]`}
        >
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
