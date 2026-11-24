import { createContext, useContext, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type BadgeTone = "green" | "red" | "amber" | "blue";

/** Solid status colors used for numbers and accents */
const TONES: Record<BadgeTone, string> = {
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
  blue: "#2563eb",
};

/** Subtle, gentle border colors that provide distinction without screaming */
const BORDER_TONES: Record<BadgeTone, string> = {
  blue: "#93c5fd",
  green: "#86efac",
  red: "#fca5a5",
  amber: "#fcd34d",
};

/** Context to share card tone with footer stats */
const CardToneContext = createContext<BadgeTone | undefined>(undefined);

/** Solid filled badge with white text */
export const StatusBadge = ({
  tone,
  children,
  title,
}: {
  tone: BadgeTone;
  children: ReactNode;
  title?: string;
  inverted?: boolean;
}) => (
  <span
    title={title}
    className="inline-flex h-5 shrink-0 items-center px-2 text-[11px] font-bold rounded-md text-white tabular-nums shadow-2xs"
    style={{ backgroundColor: TONES[tone] }}
  >
    {children}
  </span>
);

/** Small label/value pair used in card footers */
export const CardStat = ({
  label,
  value,
  align = "left",
  tone: explicitTone,
}: {
  label: string;
  value: string;
  align?: "left" | "right";
  tone?: BadgeTone;
}) => {
  const contextTone = useContext(CardToneContext);
  const tone = explicitTone ?? contextTone;

  return (
    <div
      className={`flex min-w-0 flex-col ${align === "right" ? "items-end text-right" : ""}`}
      title={`${label} ${value}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-base-content/65">
        {label}
      </span>
      <span
        className="truncate text-[13px] font-extrabold tabular-nums text-base-content"
        style={tone ? { color: TONES[tone] } : undefined}
      >
        {value}
      </span>
    </div>
  );
};

export const BlueStatCard = ({
  icon: Icon,
  tone = "blue",
  title,
  badge,
  value,
  unit,
  children,
}: {
  icon: LucideIcon;
  /** Colours the top accent bar, big number, unit, and icon */
  tone?: BadgeTone;
  filled?: boolean;
  title: string;
  badge?: ReactNode;
  value: string;
  unit?: string;
  children: ReactNode;
}) => (
  <div className="flex flex-col overflow-hidden rounded-xl bg-base-100 border border-base-300/80 shadow-xs hover:shadow-md transition-all">
    <div className="flex flex-1 flex-col gap-2.5 p-3">
      {/* Top: Title + Big Value (left) | Badge + Icon (right) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex flex-col gap-0.5">
          <h4 className="truncate text-xs font-bold text-base-content/75">{title}</h4>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span
              className="text-[26px] font-black leading-tight tracking-tight tabular-nums text-base-content"
              style={tone ? { color: TONES[tone] } : undefined}
            >
              {value}
            </span>
            {unit && (
              <span
                className="text-xs font-bold text-base-content/75"
                style={tone ? { color: TONES[tone] } : undefined}
              >
                {unit}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center shrink-0">
          {badge ?? (
            <span
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-white shadow-2xs"
              style={{ backgroundColor: tone ? TONES[tone] : "#475569" }}
            >
              <Icon size={15} />
            </span>
          )}
        </div>
      </div>

      {/* Footer in crisp solid container */}
      <div className="mt-auto rounded-lg bg-base-200 border border-base-300 px-2.5 py-1.5">
        <CardToneContext.Provider value={tone}>
          {children}
        </CardToneContext.Provider>
      </div>
    </div>
  </div>
);
