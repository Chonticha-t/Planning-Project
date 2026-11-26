import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** สีหลักของการ์ด KPI (ใช้กับไอคอน/ตัวเลข) */
export type KpiTone = "blue" | "green" | "red" | "amber" | "neutral";

export const KPI_TONE: Record<KpiTone, { text: string; icon: string; bar: string }> = {
  blue: { text: "text-blue-600", icon: "bg-blue-600 text-white", bar: "bg-blue-500" },
  green: { text: "text-emerald-600", icon: "bg-emerald-600 text-white", bar: "bg-emerald-500" },
  red: { text: "text-rose-600", icon: "bg-rose-600 text-white", bar: "bg-rose-500" },
  amber: { text: "text-amber-600", icon: "bg-amber-500 text-white", bar: "bg-amber-400" },
  neutral: { text: "text-base-content", icon: "bg-base-200 text-base-content/70", bar: "bg-base-content/40" },
};

export const KpiCard = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div
    className={`rounded-2xl border border-base-300 bg-base-100 shadow-xs px-3.5 py-2.5 flex flex-col gap-1.5 min-w-0 ${className}`}
  >
    {children}
  </div>
);

export const KpiHeader = ({
  icon: Icon,
  title,
  tone = "neutral",
  right,
}: {
  icon: LucideIcon;
  title: string;
  tone?: KpiTone;
  right?: ReactNode;
}) => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex items-center gap-2 min-w-0">
      <span className={`grid place-items-center h-5 w-5 rounded-md shrink-0 ${KPI_TONE[tone].icon}`}>
        <Icon size={12} strokeWidth={2.5} />
      </span>
      <span className="text-xs font-semibold text-base-content/70 truncate">{title}</span>
    </div>
    {right}
  </div>
);

/** ตัวเลขหลักของการ์ด */
export const KpiValue = ({ value, unit, tone = "neutral" }: { value: ReactNode; unit?: ReactNode; tone?: KpiTone }) => (
  <div className="flex items-baseline gap-1.5 min-w-0">
    <span className={`text-[22px] font-extrabold leading-tight tabular-nums ${KPI_TONE[tone].text}`}>{value}</span>
    {unit && <span className="text-[11px] font-medium text-base-content/50 truncate">{unit}</span>}
  </div>
);

export const KpiMetric = ({
  label,
  value,
  align = "left",
  valueClass = "text-base-content",
}: {
  label: string;
  value: ReactNode;
  align?: "left" | "right" | "center";
  valueClass?: string;
}) => (
  <div className={`min-w-0 ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""}`}>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-base-content/50 leading-tight">{label}</div>
    <div className={`text-[13px] font-bold tabular-nums truncate leading-tight ${valueClass}`}>{value}</div>
  </div>
);

/** แถวหลัก: ตัวเลขหลักชิดซ้าย + รายละเอียดชิดขวา (ใช้พื้นที่แนวนอนให้เต็ม) */
export const KpiRow = ({ value, children }: { value: ReactNode; children?: ReactNode }) => (
  <div className="flex items-end justify-between gap-3 min-w-0">
    <div className="min-w-0 shrink-0">{value}</div>
    {children && <div className="flex items-end gap-4 min-w-0 text-right">{children}</div>}
  </div>
);

/** ส่วนท้ายการ์ด (มีเส้นคั่นด้านบน) */
export const KpiFooter = ({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 | 3 }) => (
  <div
    className={`mt-auto grid gap-2 border-t border-base-300 pt-1.5 ${
      cols === 3 ? "grid-cols-3" : cols === 2 ? "grid-cols-2" : "grid-cols-1"
    }`}
  >
    {children}
  </div>
);

/** แถบสัดส่วนแบ่งหลายช่วง */
export const KpiRatioBar = ({
  segments,
  className = "",
}: {
  segments: { value: number; tone: KpiTone; label?: string }[];
  className?: string;
}) => {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  return (
    <div
      className={`flex h-1.5 w-full overflow-hidden rounded-full bg-base-200 ${className}`}
      title={segments
        .filter((s) => s.label)
        .map((s) => `${s.label} ${total > 0 ? Math.round((s.value / total) * 100) : 0}%`)
        .join(" · ")}
    >
      {total > 0 &&
        segments.map((s, i) => (
          <div
            key={i}
            className={`${KPI_TONE[s.tone].bar} transition-all duration-500`}
            style={{ width: `${(Math.max(0, s.value) / total) * 100}%` }}
          />
        ))}
    </div>
  );
};
