const GATE_LABELS: Record<string, string> = {
  FVAC: "VAC",
  "AT-FVAC": "VAC",
  FADL: "LAM",
  "AT-FADL": "LAM",
  "AT-FIN": "FIN",
  MMOT: "MOT",
  MMOT1: "MOT",
  MBLK1: "MBLK",
};

// Keep API gate values unchanged; normalize labels only for presentation.
export const formatGateName = (gate?: string | null): string => {
  const name = gate?.replace(/\u00a0/g, " ").trim() ?? "";
  return GATE_LABELS[name.toUpperCase()] ?? name;
};

export const formatGateTransition = (
  gate?: string | null,
  nextGate?: string | null,
): string => {
  const from = formatGateName(gate) || "ไม่ทราบต้นทาง";
  const to = formatGateName(nextGate) || "ไม่ทราบปลายทาง";
  return `${from} → ${to}`;
};

export const formatLotLocation = (gate: string | null | undefined, isNeedWip: boolean): string => {
  if (isNeedWip) return "ยังไม่มี Lot";
  const name = formatGateName(gate);
  if (!name) return "ไม่ทราบตำแหน่ง";
  if (name.toUpperCase() === "PRE_FFPC") return "ก่อนเข้า FFPC";
  if (name.toUpperCase() === "AFTER_WH") return "หลังคลังตาม routing";
  return name;
};
