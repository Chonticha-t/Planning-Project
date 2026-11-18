import { memo } from "react";
import { CheckCircle2, Clock, Factory, Package } from "lucide-react";
import dayjs from "dayjs";
import { BlueStatCard, CardStat, StatusBadge } from "@/components/BlueStatCard";
import type { PlanningSummaryRow } from "../types";
import { toDMY } from "../utils";

interface SummaryCardsProps {
  summary: PlanningSummaryRow[];
  lastUpdatedAt?: string;
  /** Distinct products in the current rows */
  productCount?: number;
}

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const SummaryCards = ({ summary, lastUpdatedAt, productCount }: SummaryCardsProps) => {
  const ready = summary.find((s) => s.status === "ready");
  const plan = summary.find((s) => s.status === "production plan");
  const totalRows = summary.reduce((sum, s) => sum + s.total_rows, 0);
  const totalPo = summary.reduce((sum, s) => sum + s.po_bal, 0);
  const totalProducts = productCount ?? Math.max(0, ...summary.map((s) => s.total_products));
  const readyRows = ready?.total_rows ?? 0;
  const planRows = plan?.total_rows ?? 0;
  const readyPct = pct(readyRows, totalRows);
  const planPct = totalRows > 0 ? 100 - readyPct : 0;
  const updatedAt =
    summary
      .map((s) => s.updated_at)
      .filter(Boolean)
      .sort()
      .pop() ||
    lastUpdatedAt ||
    "-";
  const hasUpdated = updatedAt !== "-";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <BlueStatCard icon={Package} title="Total SO" value={fmt(totalRows)} unit="SO lines">
        <div className="grid grid-cols-2 gap-2">
          <CardStat label="SO Balance" value={`${fmt(totalPo)} pcs`} />
          <CardStat label="Products" value={fmt(totalProducts)} align="right" />
        </div>
      </BlueStatCard>

      <BlueStatCard
        icon={CheckCircle2}
        tone="green"
        filled
        title="Ready"
        badge={<StatusBadge tone="green" inverted title="Share of SO lines that are Ready">{readyPct}%</StatusBadge>}
        value={fmt(readyRows)}
        unit="SO lines"
      >
        <div className="grid grid-cols-2 gap-2">
          <CardStat label="Ready" value={`${fmt(ready?.po_bal ?? 0)} pcs`} />
          <CardStat label="W/H F/G" value={`${fmtMoney(ready?.wh_fg_amount ?? 0)} THB`} align="right" />
        </div>
      </BlueStatCard>

      <BlueStatCard
        icon={Factory}
        tone="red"
        filled
        title="Production Plan"
        badge={<StatusBadge tone="red" inverted title="Share of SO lines that need production">{planPct}%</StatusBadge>}
        value={fmt(planRows)}
        unit="SO lines"
      >
        <div className="grid grid-cols-2 gap-2">
          <CardStat label="Net Req" value={`${fmt(plan?.net_required_pcs ?? 0)} pcs`} />
          <CardStat label="Output" value={`${fmtMoney(plan?.output_amount ?? 0)} THB`} align="right" />
        </div>
      </BlueStatCard>

      <BlueStatCard icon={Clock} title="Last Calculated" value={hasUpdated ? updatedAt.slice(11, 16) : "-"}>
        <div className="grid grid-cols-2 gap-2">
          <CardStat label="Date" value={hasUpdated ? toDMY(updatedAt) : "No data yet"} />
          <CardStat label="Day" value={hasUpdated ? dayjs(updatedAt.slice(0, 10)).format("dddd") : "-"} align="right" />
        </div>
      </BlueStatCard>
    </div>
  );
};

export default memo(SummaryCards);
