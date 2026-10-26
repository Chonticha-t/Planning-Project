import { CheckCircle2, Factory, Package, Clock } from "lucide-react";
import { memo, type ReactNode } from "react";
import type { PlanningSummaryRow } from "../types";
import { toDMY } from "../utils";

interface SummaryCardsProps {
  summary: PlanningSummaryRow[];
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const SummaryCards = ({ summary }: SummaryCardsProps) => {
  const ready = summary.find((s) => s.status === "ready");
  const plan = summary.find((s) => s.status === "production plan");
  const totalRows = summary.reduce((sum, s) => sum + s.total_rows, 0);
  const totalPo = summary.reduce((sum, s) => sum + s.po_bal, 0);
  const updatedAt = summary.map((s) => s.updated_at).sort().pop() ?? "-";

  const cards: {
    title: string;
    tooltip?: string;
    value: string;
    sub: ReactNode;
    icon: typeof Package;
    color: string;
    borderColor: string;
  }[] = [
    {
      title: "Total PO",
      tooltip: "Total Purchase Orders",
      value: fmt(totalRows),
      sub: (
        <div className="truncate">
          PO Balance <span className="font-semibold text-info">{fmt(totalPo)}</span> pcs
        </div>
      ),
      icon: Package,
      color: "text-info",
      borderColor: "border-info/60",
    },
    {
      title: "Ready",
      tooltip: "Ready (Stock Sufficient)",
      value: fmt(ready?.total_rows ?? 0),
      sub: (
        <>
          <div className="truncate">
            <span className="font-semibold text-success">{fmt(ready?.po_bal ?? 0)}</span> pcs
          </div>
          <div className="truncate" title={`W/H F/G ${fmtMoney(ready?.wh_fg_amount ?? 0)} THB`}>
            W/H F/G <span className="font-semibold text-success">{fmtMoney(ready?.wh_fg_amount ?? 0)}</span> THB
          </div>
        </>
      ),
      icon: CheckCircle2,
      color: "text-success",
      borderColor: "border-success/60",
    },
    {
      title: "Production Plan",
      tooltip: "Production Plan (To Produce)",
      value: fmt(plan?.total_rows ?? 0),
      sub: (
        <>
          <div className="truncate">
            Net Req <span className="font-semibold text-error">{fmt(plan?.net_required_pcs ?? 0)}</span> pcs
          </div>
          <div className="truncate" title={`Output ${fmtMoney(plan?.output_amount ?? 0)} THB`}>
            Output <span className="font-semibold text-error">{fmtMoney(plan?.output_amount ?? 0)}</span> THB
          </div>
        </>
      ),
      icon: Factory,
      color: "text-error",
      borderColor: "border-error/60",
    },
    {
      title: "Last Calculated",
      tooltip: "Last Calculated Time",
      value: updatedAt === "-" ? "-" : updatedAt.slice(11, 16),
      sub: <div className="truncate">{updatedAt === "-" ? "No data yet" : toDMY(updatedAt)}</div>,
      icon: Clock,
      color: "text-base-content/70",
      borderColor: "border-base-content/50",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 min-[960px]:grid-cols-4 gap-2.5 xl:gap-3.5">
      {cards.map(({ title, tooltip, value, sub, icon: Icon, color, borderColor }) => (
        <div
          key={title}
          className={`card bg-base-100 border-[1.5px] ${borderColor} shadow-xs hover:shadow-sm transition-all`}
        >
          {/* ปรับขนาด responsive: ตอน zoom 150% จะเป็นขนาดกะทัดรัด (p-3) และตอน zoom 100% จอใหญ่จะขยายขึ้นอัตโนมัติ (xl:p-4) */}
          <div className="card-body p-3 xl:p-4 flex-row items-center gap-3 xl:gap-3.5">
            <div className={`p-2.5 xl:p-3 rounded-xl bg-base-200 shrink-0 ${color}`}>
              <Icon className="w-[22px] h-[22px] xl:w-[26px] xl:h-[26px]" />
            </div>

            <div className="min-w-0 flex-1">
              <div
                className="text-[12px] xl:text-[13px] font-medium text-base-content/70 truncate"
                title={tooltip || title}
              >
                {title}
              </div>
              <div className={`text-xl xl:text-2xl 2xl:text-[26px] font-bold ${color} leading-snug my-0.5`}>
                {value}
              </div>
              <div className="text-[11px] xl:text-xs text-base-content/60 flex flex-col gap-0.5 mt-0.5">
                {sub}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default memo(SummaryCards);
