import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Summary card shared by SO Balance and Planning Summary.
 * Solid blue (same as the selected gate card); status meaning (green / red / amber)
 * is shown by a solid coloured badge and icon chip with a white ring.
 * Colours are inline / fixed so page theme overrides never recolor them.
 */
const CARD_BLUE = "#316be8";

export type BadgeTone = "green" | "red" | "amber" | "blue";

/** Solid status colours, bright enough to stand out on the blue card */
const TONES: Record<BadgeTone, string> = {
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
  blue: "#1d4ed8",
};

/** Coloured number with a white outline (stroke painted behind the fill so the colour stays bold) */
const toneText = (tone: BadgeTone | undefined, stroke: string) =>
  tone ? { color: TONES[tone], WebkitTextStroke: `${stroke} #fff`, paintOrder: "stroke fill" } : undefined;

/** Solid green / red / amber pill with a white ring — clearly visible on the blue card */
export const StatusBadge = ({
  tone,
  children,
  title,
  inverted = false,
}: {
  tone: BadgeTone;
  children: ReactNode;
  title?: string;
  /** White pill with coloured text — for cards whose background is already the tone colour */
  inverted?: boolean;
}) => (
  <span
    title={title}
    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-extrabold tabular-nums shadow-sm ${
      inverted ? "bg-white" : "text-white ring-2 ring-white/90"
    }`}
    style={inverted ? { color: TONES[tone] } : { background: TONES[tone] }}
  >
    {children}
  </span>
);

/** Small label/value pair used in the card footers */
export const CardStat = ({ label, value, align = "left" }: { label: string; value: string; align?: "left" | "right" }) => (
  <div className={`flex min-w-0 flex-col ${align === "right" ? "items-end text-right" : ""}`} title={`${label} ${value}`}>
    <span className="text-[9.5px] font-semibold uppercase tracking-wider text-white/65">{label}</span>
    <span className="truncate text-[12px] font-semibold tabular-nums text-white">{value}</span>
  </div>
);

export const BlueStatCard = ({
  icon: Icon,
  tone,
  filled = false,
  title,
  badge,
  value,
  unit,
  children,
}: {
  icon: LucideIcon;
  /** Colours the icon chip (e.g. green for Ready, red for Production Plan) */
  tone?: BadgeTone;
  /** Use the tone colour as the card background instead of blue (number stays white) */
  filled?: boolean;
  title: string;
  badge?: ReactNode;
  value: string;
  unit?: string;
  children: ReactNode;
}) => (
  <div
    className="flex flex-col gap-1.5 overflow-hidden rounded-xl px-3 py-2.5 text-white shadow-sm shadow-blue-900/15"
    style={{ background: filled && tone ? TONES[tone] : CARD_BLUE }}
  >
    {/* Fixed header height so cards with and without a badge line up */}
    <div className="flex h-6 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-flex size-5 shrink-0 items-center justify-center rounded-md ${tone && !filled ? "ring-1 ring-white/70" : "bg-white/15 ring-1 ring-white/20"}`}
          style={tone && !filled ? { background: TONES[tone] } : undefined}
        >
          <Icon size={12} />
        </span>
        <h4 className="truncate text-[12px] font-semibold text-white/90">{title}</h4>
      </div>
      {badge}
    </div>
    <div className="flex items-baseline gap-2">
      <span
        className="text-[24px] font-extrabold leading-none tracking-tight tabular-nums"
        style={filled ? undefined : toneText(tone, "2px")}
      >
        {value}
      </span>
      {unit && <span className="text-[12px] font-medium text-white/85">{unit}</span>}
    </div>
    <div className="mt-auto border-t border-white/20 pt-1.5">{children}</div>
  </div>
);
