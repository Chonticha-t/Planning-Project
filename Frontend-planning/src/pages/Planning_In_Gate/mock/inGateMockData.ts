import dayjs from "dayjs";
import type { GateGroup, InGateCategory, InGateGate, InGateLot } from "../types";

export const GATES_BY_GROUP: Record<GateGroup, InGateGate[]> = {
  FPC: [
    { id: "FFPC", name: "FFPC", capacityMin: 6460 },
    { id: "FVAC", name: "FVAC", capacityMin: 6460 },
    { id: "FADL", name: "FADL", capacityMin: 6460 },
    { id: "FIN", name: "FIN", capacityMin: 6460 },
    { id: "WH", name: "W/H", capacityMin: 3230 },
  ],
  SMT: [
    { id: "MFPC", name: "MFPC", capacityMin: 6460 },
    { id: "MMOT", name: "MMOT", capacityMin: 6460 },
    { id: "MBLK", name: "MBLK", capacityMin: 6460 },
    { id: "MFIN", name: "MFIN", capacityMin: 6460 },
    { id: "MWH", name: "MW/H", capacityMin: 3230 },
  ],
};

// Same product names as Capacity Leveling mock (levelingMockData.ts)
const LEVELING_PRODUCTS = ["Model A", "Model B", "Model C", "Model D"];
const PRODUCTS: Record<GateGroup, string[]> = {
  FPC: LEVELING_PRODUCTS,
  SMT: LEVELING_PRODUCTS,
};

const MACHINES = 6;
// Same conversion as Capacity Leveling (levelingCalculations.ts: Math.ceil(qty / 12))
export const PCS_PER_SHEET = 12;

export interface InGateTab {
  gate: InGateGate;
  group: GateGroup; // which saved plan it belongs to
  scope: string; // which mock list / saved order it uses
}

/** Gate tabs shown for a process-group selection */
export const tabsForCategory = (category: InGateCategory): InGateTab[] => {
  const fpc = (scope: string) =>
    GATES_BY_GROUP.FPC.map((gate) => ({ gate, group: "FPC" as const, scope }));
  const smt = GATES_BY_GROUP.SMT.map((gate) => ({ gate, group: "SMT" as const, scope: "SMT" }));
  if (category === "ALL") return [...fpc("ALL"), ...smt];
  if (category === "SMT") return smt;
  return fpc(category);
};

// Deterministic RNG so the same group/gate/day always shows the same mock list
const hashString = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Mock work list for one gate on one day, in the default planning order. */
export const buildWorkList = (
  group: GateGroup,
  gate: InGateGate,
  date: string,
  planVersion: number,
  scope: string = group
): InGateLot[] => {
  const rnd = mulberry32(hashString(`${scope}|${gate.id}|${date}|v${planVersion}`));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const products = PRODUCTS[group];
  const isWh = gate.capacityMin < 5000;
  const rate = isWh ? 0.11 : 0.2; // min per pcs

  // Unique lot numbers from a shuffled pool
  const pool = Array.from({ length: 120 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let poolIdx = 0;
  const nextId = () => `XXXXX-${String(pool[poolIdx++]).padStart(3, "0")}`;

  const day = dayjs(date);
  const target = gate.capacityMin * (0.94 + rnd() * 0.16); // 94% – 110% of capacity
  const lots: InGateLot[] = [];
  let total = 0;

  type Computed = "id" | "product" | "qty" | "sheet" | "outputPcs" | "outputSheet" | "minutes";
  const push = (partial: Omit<InGateLot, Computed> & { qty?: number }) => {
    const qty = partial.qty ?? Math.round((400 + rnd() * 2000) / 50) * 50;
    const minutes = Math.max(30, Math.round(qty * rate));
    const sheet = Math.ceil(qty / PCS_PER_SHEET);
    // Partly done today: running lots and lots carried over / pulled in already on the machine
    const progress =
      partial.status === "running"
        ? 0.2 + rnd() * 0.6
        : partial.status === "carried"
          ? 0.3 + rnd() * 0.4
          : partial.status === "top"
            ? rnd() * 0.3
            : 0;
    const outputSheet = Math.floor(sheet * progress);
    const outputPcs = Math.min(qty, outputSheet * PCS_PER_SHEET);
    lots.push({ ...partial, id: nextId(), product: pick(products), qty, sheet, outputPcs, outputSheet, minutes });
    total += minutes;
  };

  // 1) Pulled-in lot from planning
  if (rnd() < 0.75) {
    push({
      nowAt: `${gate.name} ${1 + Math.floor(rnd() * MACHINES)}/${MACHINES}`,
      mustOut: day.format("YYYY-MM-DD"),
      status: "top",
      note: "Run first — PO pulled in",
    });
  }
  // 2) Carried over from yesterday
  const carried = Math.floor(rnd() * 4);
  for (let i = 0; i < carried; i++) {
    push({
      nowAt: `${gate.name} ${1 + Math.floor(rnd() * MACHINES)}/${MACHINES}`,
      mustOut: day.subtract(1, "day").format("YYYY-MM-DD"),
      status: "carried",
      note: i === 0 ? "Finish from yesterday" : undefined,
    });
  }
  // 3) Running now
  for (let i = 0; i < 2; i++) {
    push({
      nowAt: `${gate.name} ${1 + Math.floor(rnd() * MACHINES)}/${MACHINES}`,
      mustOut: day.format("YYYY-MM-DD"),
      status: "running",
    });
  }
  // 4) Waiting / hold / arriving until the day is (over)filled
  while (total < target) {
    const r = rnd();
    const late = lots.length > 12 && rnd() < 0.5;
    const mustOut = (late ? day.add(1, "day") : day).format("YYYY-MM-DD");
    if (r < 0.1) {
      push({
        nowAt: `${gate.name} ${1 + Math.floor(rnd() * MACHINES)}/${MACHINES}`,
        mustOut,
        status: "hold",
        note: `Ask QA to release by ${pick(["10:00", "11:00", "13:00", "14:00"])}`,
      });
    } else if (r < 0.3) {
      push({
        nowAt: `PRE_${gate.name}`,
        mustOut,
        status: "arriving",
        arrivingAt: pick(["10:00", "11:00", "13:30", "15:00", "17:00"]),
      });
    } else {
      push({
        nowAt: `${gate.name} ${1 + Math.floor(rnd() * MACHINES)}/${MACHINES}`,
        mustOut,
        status: "waiting",
      });
    }
  }
  return lots;
};
