import { memo } from "react";
import { CheckCircle2, Clock, Factory, Package } from "lucide-react";
import dayjs from "dayjs";
import { KpiCard, KpiFooter, KpiHeader, KpiMetric, KpiRatioBar, KpiValue } from "@/components/KpiCard";
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

const PctPill = ({ value, className }: { value: number; className: string }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold leading-none tabular-nums ${className}`}>
    {value}%
  </span>
);

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

  const cardBorder = "border-base-content/12! [&_.border-t]:border-base-content/10";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {/* ── Total SO ── */}
      <KpiCard className={cardBorder}>
        <KpiHeader icon={Package} tone="blue" title="Total SO" />
        <KpiValue value={fmt(totalRows)} unit="SO lines" tone="blue" />
        <KpiFooter>
          <KpiMetric label="SO Balance" value={`${fmt(totalPo)} pcs`} />
          <KpiMetric label="Products" value={fmt(totalProducts)} align="right" />
        </KpiFooter>
      </KpiCard>

      {/* ── Ready ── */}
      <KpiCard className={cardBorder}>
        <KpiHeader
          icon={CheckCircle2}
          tone="green"
          title="Ready"
          right={<PctPill value={readyPct} className="bg-emerald-100 text-emerald-700" />}
        />
        <KpiValue value={fmt(readyRows)} unit="SO lines" tone="green" />
        <KpiRatioBar
          segments={[
            { value: readyRows, tone: "green", label: "Ready" },
            { value: totalRows - readyRows, tone: "neutral" },
          ]}
          className="[&>div:last-child]:bg-transparent"
        />
        <KpiFooter>
          <KpiMetric label="Ready" value={`${fmt(ready?.po_bal ?? 0)} pcs`} valueClass="text-emerald-600" />
          <KpiMetric
            label="W/H F/G"
            value={`${fmtMoney(ready?.wh_fg_amount ?? 0)} THB`}
            align="right"
            valueClass="text-emerald-600"
          />
        </KpiFooter>
      </KpiCard>

      {/* ── Production Plan ── */}
      <KpiCard className={cardBorder}>
        <KpiHeader
          icon={Factory}
          tone="red"
          title="Production Plan"
          right={<PctPill value={planPct} className="bg-rose-100 text-rose-700" />}
        />
        <KpiValue value={fmt(planRows)} unit="SO lines" tone="red" />
        <KpiRatioBar
          segments={[
            { value: planRows, tone: "red", label: "Production Plan" },
            { value: totalRows - planRows, tone: "neutral" },
          ]}
          className="[&>div:last-child]:bg-transparent"
        />
        <KpiFooter>
          <KpiMetric
            label="Net Req"
            value={`${fmt(plan?.net_required_pcs ?? 0)} pcs`}
            valueClass="text-rose-600"
          />
          <KpiMetric
            label="Output"
            value={`${fmtMoney(plan?.output_amount ?? 0)} THB`}
            align="right"
            valueClass="text-rose-600"
          />
        </KpiFooter>
      </KpiCard>

      {/* ── Last Calculated ── */}
      <KpiCard className={cardBorder}>
        <KpiHeader icon={Clock} tone="blue" title="Last Calculated" />
        <KpiValue value={hasUpdated ? updatedAt.slice(11, 16) : "-"} unit={hasUpdated ? "น." : undefined} />
        <KpiFooter>
          <KpiMetric label="Date" value={hasUpdated ? toDMY(updatedAt) : "No data yet"} />
          <KpiMetric
            label="Day"
            value={hasUpdated ? dayjs(updatedAt.slice(0, 10)).format("dddd") : "-"}
            align="right"
          />
        </KpiFooter>
      </KpiCard>
    </div>
  );
};

export default memo(SummaryCards);
