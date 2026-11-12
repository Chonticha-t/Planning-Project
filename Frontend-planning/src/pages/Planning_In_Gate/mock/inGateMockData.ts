import dayjs from "dayjs";
import type {
  FinishedTodaySummary,
  GateGroup,
  GateProcessStep,
  InGateCategory,
  InGateGate,
  InGateLot,
} from "../types";

export const GATES_BY_GROUP: Record<GateGroup, InGateGate[]> = {
  FPC: [
    { id: "FFPC", name: "FFPC", capacityMin: 439 },
    { id: "FVAC", name: "FVAC", capacityMin: 439 },
    { id: "FADL", name: "FADL", capacityMin: 439 },
    { id: "FIN", name: "FIN", capacityMin: 439 },
    { id: "WH", name: "W/H", capacityMin: 439 },
  ],
  SMT: [
    { id: "MFPC", name: "MFPC", capacityMin: 439 },
    { id: "MMOT", name: "MMOT", capacityMin: 439 },
    { id: "MBLK", name: "MBLK", capacityMin: 439 },
    { id: "MFIN", name: "MFIN", capacityMin: 439 },
    { id: "MWH", name: "MW/H", capacityMin: 439 },
  ],
};

export const GATE_SUBSTEPS: Record<string, { code: string; name: string }[]> = {
  FFPC: [
    { code: "FFPC-01", name: "Dry film lamination" },
    { code: "FFPC-02", name: "Circuit exposure" },
    { code: "FFPC-03", name: "DES etching & strip" },
    { code: "FFPC-04", name: "AOI circuit check" },
  ],
  FVAC: [
    { code: "FVAC-01", name: "Coverlay layup & tack" },
    { code: "FVAC-02", name: "Vacuum lamination" },
    { code: "FVAC-03", name: "Bake curing" },
    { code: "FVAC-04", name: "Post-press inspection" },
  ],
  FADL: [
    { code: "FADL-01", name: "Surface plasma treat" },
    { code: "FADL-02", name: "Adhesive punch" },
    { code: "FADL-03", name: "Stiffener alignment" },
    { code: "FADL-04", name: "Heat press bonding" },
    { code: "FADL-05", name: "Bonding QA check" },
  ],
  FIN: [
    { code: "FIN-01", name: "Outline punch / laser" },
    { code: "FIN-02", name: "Open / short E-test" },
    { code: "FIN-03", name: "Final visual inspect" },
    { code: "FIN-04", name: "FQA sampling audit" },
  ],
  WH: [
    { code: "WH-01", name: "Lot & qty verification" },
    { code: "WH-02", name: "Vacuum dry packing" },
    { code: "WH-03", name: "Barcode & put-away" },
  ],
  MFPC: [
    { code: "MFPC-01", name: "Carrier jig load" },
    { code: "MFPC-02", name: "Solder paste print" },
    { code: "MFPC-03", name: "3D SPI inspection" },
    { code: "MFPC-04", name: "Pre-mount bake" },
  ],
  MMOT: [
    { code: "MMOT-01", name: "Chip high-speed mount" },
    { code: "MMOT-02", name: "IC fine-pitch placement" },
    { code: "MMOT-03", name: "N2 reflow oven" },
    { code: "MMOT-04", name: "3D AOI inspection" },
  ],
  MBLK: [
    { code: "MBLK-01", name: "Underfill dispensing" },
    { code: "MBLK-02", name: "Thermal curing oven" },
    { code: "MBLK-03", name: "Shield can attach" },
    { code: "MBLK-04", name: "Laser lot marking" },
  ],
  MFIN: [
    { code: "MFIN-01", name: "Depaneling router" },
    { code: "MFIN-02", name: "ICT / FCT functional" },
    { code: "MFIN-03", name: "X-ray BGA check" },
    { code: "MFIN-04", name: "Final OQA audit" },
  ],
  MWH: [
    { code: "MWH-01", name: "Reel / tray count" },
    { code: "MWH-02", name: "MSL dry-pack seal" },
    { code: "MWH-03", name: "FG warehouse staging" },
  ],
};

// Same product names as Capacity Leveling mock (levelingMockData.ts)
const LEVELING_PRODUCTS = ["Model A", "Model B", "Model C", "Model D"];
const PRODUCTS: Record<GateGroup, string[]> = {
  FPC: LEVELING_PRODUCTS,
  SMT: LEVELING_PRODUCTS,
};

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

/** Route gates for the given group */
export const routeGatesForGroup = (group: GateGroup): InGateGate[] => GATES_BY_GROUP[group];

/** Next gate name in the route */
export const nextGateFor = (group: GateGroup, gateId: string): string => {
  const gates = GATES_BY_GROUP[group];
  const idx = gates.findIndex((g) => g.id === gateId);
  if (idx >= 0 && idx < gates.length - 1) return gates[idx + 1].name;
  return "FG Ship";
};

/** Build the sub-process steps for a lot between currentGate -> nextGate */
export const buildGateStepsForLot = (
  gate: InGateGate,
  stepNow: number,
  isRunning: boolean,
  isHold: boolean
): GateProcessStep[] => {
  const defs = GATE_SUBSTEPS[gate.id] ?? [
    { code: `${gate.name}-01`, name: "Preparation" },
    { code: `${gate.name}-02`, name: "Main process" },
    { code: `${gate.name}-03`, name: "Inspection" },
  ];

  const doneTimes = [
    { range: "21:10 → 21:45", dur: "35 min" },
    { range: "21:48 → 22:25", dur: "37 min" },
    { range: "22:28 → 22:55", dur: "27 min" },
    { range: "22:58 → 23:25", dur: "27 min" },
  ];

  return defs.map((d, i) => {
    const idx = i + 1;
    if (idx < stepNow) {
      const t = doneTimes[i] ?? doneTimes[0];
      return {
        code: d.code,
        name: d.name,
        status: "done" as const,
        timeLabel: t.range,
        subLabel: t.dur,
      };
    }
    if (idx === stepNow) {
      if (isHold) {
        return {
          code: d.code,
          name: d.name,
          status: "running" as const,
          timeLabel: "held at 18:40",
          subLabel: "waiting QA release",
        };
      }
      if (isRunning) {
        return {
          code: d.code,
          name: d.name,
          status: "running" as const,
          timeLabel: "in 22:50",
          subLabel: "running 15 min",
        };
      }
      return {
        code: d.code,
        name: d.name,
        status: "running" as const,
        timeLabel: "at process · queued",
        subLabel: `est. ${20 + idx * 5} min`,
      };
    }
    return {
      code: d.code,
      name: d.name,
      status: "upcoming" as const,
      timeLabel: `est. ${20 + idx * 5} min`,
    };
  });
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

/** Finished-today summary per gate so tab total lots match the mockup (FFPC 24, FVAC 20, FADL 23, FIN 21, W/H 22) */
export const buildFinishedToday = (
  group: GateGroup,
  gate: InGateGate,
  date: string,
  queueCount: number
): FinishedTodaySummary => {
  // Exact total lot counts per gate from the mockup header tabs
  const targetTotalByGate: Record<string, number> = {
    FFPC: 24,
    FVAC: 20,
    FADL: 23,
    FIN: 21,
    WH: 22,
    MFPC: 24,
    MMOT: 20,
    MBLK: 23,
    MFIN: 21,
    MWH: 22,
  };

  const targetTotal = targetTotalByGate[gate.id] ?? 20;
  const totalLots = gate.id === "FVAC" ? 11 : Math.max(8, targetTotal - queueCount);
  const dsLots = gate.id === "FVAC" ? 9 : Math.max(6, totalLots - 2);
  const nsLots = Math.max(1, totalLots - dsLots);
  const plannedToNow = totalLots + 1; // e.g. 11 out vs 12 planned

  const rnd = mulberry32(hashString(`finished|${group}|${gate.id}|${date}`));
  const products = PRODUCTS[group];
  const lots = Array.from({ length: totalLots }, (_, i) => {
    const isDs = i < dsLots;
    const qty = gate.id === "FVAC"
      ? [1400, 1500, 1350, 1600, 1450, 1500, 1300, 1550, 1450, 1400, 1400][i] ?? 1450
      : 1200 + Math.round(rnd() * 6) * 100;
    const hour = isDs ? 9 + Math.floor((i / Math.max(1, dsLots)) * 10) : 20 + (i - dsLots);
    const min = (i * 17 + 12) % 60;
    return {
      id: `XXXXX-${String(80 + i).padStart(3, "0")}`,
      product: products[i % products.length],
      qty,
      shift: (isDs ? "D/S" : "N/S") as "D/S" | "N/S",
      outAt: `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
    };
  });

  const totalPcs = gate.id === "FVAC" ? 15900 : lots.reduce((s, l) => s + l.qty, 0);

  return {
    totalLots,
    totalPcs,
    dsLots,
    nsLots,
    plannedToNow,
    lots,
  };
};

/** Exact queue for FVAC from the reference mockup */
const buildFvacExactWorkList = (date: string): InGateLot[] => {
  const gate = GATES_BY_GROUP.FPC.find((g) => g.id === "FVAC")!;
  const day = dayjs(date);
  const d1 = day.add(1, "day").format("YYYY-MM-DD"); // 13/11 when date is 12/11
  const d2 = day.add(2, "day").format("YYYY-MM-DD"); // 14/11
  const d4 = day.add(4, "day").format("YYYY-MM-DD"); // 16/11

  const rows: Omit<
    InGateLot,
    | "sheet"
    | "outputSheet"
    | "gateSteps"
    | "fromGate"
    | "nextGate"
    | "currentProcCode"
    | "currentProcName"
    | "nowAt"
  >[] = [
    {
      id: "XXXXX-055",
      product: "Model C",
      qty: 1650,
      outputPcs: 0,
      minutes: 80, // held in D/S (0 active min while HOLD, 80 min if released)
      mustOut: d1,
      status: "hold",
      shiftSection: "day",
      stepNow: 2,
      stepTotal: 4,
      note: "waiting QA",
      smartHint: {
        tone: "amber",
        text: `Move after 109 · still meets ${dayjs(d1).format("DD/MM")} if released by 03:00`,
        moveAfterLotId: "XXXXX-109",
      },
    },
    {
      id: "XXXXX-022",
      product: "Model A",
      qty: 2000,
      outputPcs: 1150,
      minutes: 40, // finishes at 00:40
      mustOut: d1,
      status: "running",
      shiftSection: "night",
      stepNow: 3,
      stepTotal: 4,
    },
    {
      id: "XXXXX-027",
      product: "Model A",
      qty: 1850,
      outputPcs: 0,
      minutes: 90, // 00:40 + 90m = 02:10
      mustOut: d1,
      status: "waiting",
      shiftSection: "night",
      stepNow: 3,
      stepTotal: 4,
    },
    {
      id: "XXXXX-102",
      product: "Model C",
      qty: 1500,
      outputPcs: 0,
      minutes: 75, // 02:10 + 75m = 03:25
      mustOut: d2,
      status: "waiting",
      shiftSection: "night",
      stepNow: 2,
      stepTotal: 4,
    },
    {
      id: "XXXXX-109",
      product: "Model C",
      qty: 1350,
      outputPcs: 0,
      minutes: 66, // 421 + 66m = 487m (74%)
      mustOut: d2,
      status: "waiting",
      shiftSection: "night",
      stepNow: 2,
      stepTotal: 4,
    },
    {
      id: "XXXXX-023",
      product: "Model D",
      qty: 2350,
      outputPcs: 0,
      minutes: 111, // 487 + 111m = 598m (91%)
      mustOut: d2,
      status: "waiting",
      shiftSection: "night",
      stepNow: 2,
      stepTotal: 4,
      smartHint: {
        tone: "indigo",
        text: "Same model as 090 · run back-to-back to save setup",
      },
    },
    {
      id: "XXXXX-052",
      product: "Model B",
      qty: 950,
      outputPcs: 0,
      minutes: 54, // 598 + 54m = 652m (100% of 655m)
      mustOut: d4,
      status: "waiting",
      shiftSection: "night",
      stepNow: 1,
      stepTotal: 4,
    },
    {
      id: "XXXXX-066",
      product: "Model D",
      qty: 2200,
      outputPcs: 0,
      minutes: 105, // 652 + 105m = 757m (116%)
      mustOut: d4,
      status: "waiting",
      shiftSection: "night",
      stepNow: 1,
      stepTotal: 4,
      smartHint: {
        tone: "amber",
        text: `Open OT 2 h → fits · or move to ${dayjs(d1).format("DD/MM")} D/S #1`,
        moveAfterLotId: "XXXXX-023",
      },
    },
    {
      id: "XXXXX-071",
      product: "Model A",
      qty: 1080,
      outputPcs: 0,
      minutes: 51, // 757 + 51m = 808m (123%)
      mustOut: d4,
      status: "waiting",
      shiftSection: "night",
      stepNow: 1,
      stepTotal: 4,
    },
  ];

  return rows.map((r) => {
    const sheet = Math.ceil(r.qty / PCS_PER_SHEET);
    const outputSheet = Math.floor(r.outputPcs / PCS_PER_SHEET);
    const gateSteps = buildGateStepsForLot(
      gate,
      r.stepNow ?? 1,
      r.status === "running",
      r.status === "hold"
    );
    const stepTotal = gateSteps.length;
    const stepNow = Math.min(stepTotal, Math.max(1, r.stepNow ?? 1));
    const currentStep = gateSteps[stepNow - 1];
    const fromGate = gate.name;
    const nextGate = "FADL";

    return {
      ...r,
      stepNow,
      stepTotal,
      fromGate,
      nextGate,
      currentProcCode: currentStep?.code ?? `${gate.name}-0${stepNow}`,
      currentProcName: currentStep?.name ?? "Process",
      nowAt: `${fromGate} → ${nextGate} · ${stepNow}/${stepTotal} · ${currentStep?.name ?? ""}`,
      sheet,
      outputSheet,
      gateSteps,
    };
  });
};

/** Mock work list for one gate on one day, in the default planning order. */
export const buildWorkList = (
  group: GateGroup,
  gate: InGateGate,
  date: string,
  planVersion: number,
  scope: string = group
): InGateLot[] => {
  if (gate.id === "FVAC") {
    return buildFvacExactWorkList(date);
  }

  const rnd = mulberry32(hashString(`${scope}|${gate.id}|${date}|v${planVersion}`));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const products = PRODUCTS[group];
  const fromGate = gate.name;
  const nextGate = nextGateFor(group, gate.id);
  const substeps = GATE_SUBSTEPS[gate.id] ?? [];
  const stepTotal = Math.max(3, substeps.length);

  // Target queue count so finished + queue = tab count (FFPC 24, FADL 23, FIN 21, WH 22)
  const queueTargetByGate: Record<string, number> = {
    FFPC: 10,
    FADL: 10,
    FIN: 9,
    WH: 9,
    MFPC: 10,
    MMOT: 9,
    MBLK: 10,
    MFIN: 9,
    MWH: 9,
  };
  const targetCount = queueTargetByGate[gate.id] ?? 9;

  // Unique lot numbers from a shuffled pool
  const pool = Array.from({ length: 120 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  let poolIdx = 0;
  const nextId = () => `XXXXX-${String(pool[poolIdx++]).padStart(3, "0")}`;

  const day = dayjs(date);
  const d1 = day.add(1, "day").format("YYYY-MM-DD");
  const d2 = day.add(2, "day").format("YYYY-MM-DD");
  const d4 = day.add(4, "day").format("YYYY-MM-DD");

  const lots: InGateLot[] = [];

  // 1) 1 HOLD lot from Day Shift
  const holdQty = 1400 + Math.round(rnd() * 6) * 100;
  const holdStepNow = Math.min(stepTotal, 2);
  const holdSteps = buildGateStepsForLot(gate, holdStepNow, false, true);
  const holdCur = holdSteps[holdStepNow - 1];
  lots.push({
    id: nextId(),
    product: pick(products),
    qty: holdQty,
    sheet: Math.ceil(holdQty / PCS_PER_SHEET),
    outputPcs: 0,
    outputSheet: 0,
    minutes: 75,
    fromGate,
    nextGate,
    stepNow: holdStepNow,
    stepTotal,
    currentProcCode: holdCur?.code,
    currentProcName: holdCur?.name,
    nowAt: `${fromGate} → ${nextGate} · ${holdStepNow}/${stepTotal} · ${holdCur?.name ?? ""}`,
    mustOut: d1,
    status: "hold",
    shiftSection: "day",
    gateSteps: holdSteps,
    smartHint: {
      tone: "amber",
      text: `Move after #5 · still meets ${dayjs(d1).format("DD/MM")} if released by 03:00`,
    },
  });

  // 2) 1 Running lot right now at top of Night Shift
  const runQty = 1800 + Math.round(rnd() * 5) * 100;
  const runOut = Math.round((runQty * 0.58) / 50) * 50;
  const runStepNow = Math.max(2, stepTotal - 1);
  const runSteps = buildGateStepsForLot(gate, runStepNow, true, false);
  const runCur = runSteps[runStepNow - 1];
  lots.push({
    id: nextId(),
    product: pick(products),
    qty: runQty,
    sheet: Math.ceil(runQty / PCS_PER_SHEET),
    outputPcs: runOut,
    outputSheet: Math.floor(runOut / PCS_PER_SHEET),
    minutes: 45,
    fromGate,
    nextGate,
    stepNow: runStepNow,
    stepTotal,
    currentProcCode: runCur?.code,
    currentProcName: runCur?.name,
    nowAt: `${fromGate} → ${nextGate} · ${runStepNow}/${stepTotal} · ${runCur?.name ?? ""}`,
    mustOut: d1,
    status: "running",
    shiftSection: "night",
    gateSteps: runSteps,
  });

  // 3) Waiting lots ordered from furthest-along process down to process 1
  const remainingCount = targetCount - 2;
  const durations = [80, 75, 70, 95, 75, 95, 65, 60];
  for (let i = 0; i < remainingCount; i++) {
    const qty = 950 + Math.round(rnd() * 14) * 100;
    const minutes = durations[i] ?? 70;
    const mustOut = i < 2 ? d1 : i < 5 ? d2 : d4;
    const product = pick(products);
    const id = nextId();
    // Earlier queue lots are further along in the gate processes (e.g. step 3 -> 2 -> 1)
    const waitStepNow =
      i === 0
        ? Math.max(1, stepTotal - 1)
        : i < 4
          ? Math.min(stepTotal, 2)
          : 1;
    const waitSteps = buildGateStepsForLot(gate, waitStepNow, false, false);
    const waitCur = waitSteps[waitStepNow - 1];
    lots.push({
      id,
      product,
      qty,
      sheet: Math.ceil(qty / PCS_PER_SHEET),
      outputPcs: 0,
      outputSheet: 0,
      minutes,
      fromGate,
      nextGate,
      stepNow: waitStepNow,
      stepTotal,
      currentProcCode: waitCur?.code,
      currentProcName: waitCur?.name,
      nowAt: `${fromGate} → ${nextGate} · ${waitStepNow}/${stepTotal} · ${waitCur?.name ?? ""}`,
      mustOut,
      status: "waiting",
      shiftSection: "night",
      gateSteps: waitSteps,
      smartHint:
        i === 4
          ? {
              tone: "indigo",
              text: `Same model as ${lots[1].id.slice(-3)} · run back-to-back to save setup`,
            }
          : i === remainingCount - 2
            ? {
                tone: "amber",
                text: `Open OT 2 h → fits · or move to ${dayjs(d1).format("DD/MM")} D/S #1`,
              }
            : undefined,
    });
  }

  return lots;
};
