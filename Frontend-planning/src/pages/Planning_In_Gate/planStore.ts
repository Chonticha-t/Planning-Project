// Shared browser storage between Capacity Leveling (Save Plan) and Planning In Gate.
// Mock-only persistence until the backend endpoint exists.
import type { GateGroup, OrderHistoryEntry, SavedOrder, SavedPlanInfo } from "./types";

const PLAN_KEY = "planning.inGate.savedPlan.v1";
const ORDER_KEY = "planning.inGate.savedOrder.v1";
const HISTORY_KEY = "planning.inGate.orderHistory.v1";

const readJson = <T>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable – keep in memory only */
  }
};

/** Capacity Leveling category → In Gate groups that receive the plan */
export const groupsForCategory = (category: string): GateGroup[] => {
  if (category === "ALL") return ["FPC", "SMT"];
  if (category === "SMT") return ["SMT"];
  return ["FPC"];
};

export const loadSavedPlans = (): Partial<Record<GateGroup, SavedPlanInfo>> =>
  readJson(PLAN_KEY, {});

export const savePlanForGroups = (groups: GateGroup[], info: SavedPlanInfo) => {
  const all = loadSavedPlans();
  groups.forEach((g) => {
    all[g] = info;
  });
  writeJson(PLAN_KEY, all);
};

/** scope = which list the order belongs to (EFPC_GEN / EFPC_AUTO / ALL for FPC gates, SMT for SMT gates) */
export const orderKey = (scope: string, gateId: string, date: string) =>
  `${scope}|${gateId}|${date}`;

export const loadSavedOrders = (): Record<string, SavedOrder> =>
  readJson(ORDER_KEY, {});

export const saveOrder = (key: string, order: SavedOrder) => {
  const all = loadSavedOrders();
  all[key] = order;
  writeJson(ORDER_KEY, all);
};

/** Save-order history per orderKey, newest first */
export const loadOrderHistory = (): Record<string, OrderHistoryEntry[]> =>
  readJson(HISTORY_KEY, {});

export const appendOrderHistory = (key: string, entry: OrderHistoryEntry) => {
  const all = loadOrderHistory();
  all[key] = [entry, ...(all[key] ?? [])];
  writeJson(HISTORY_KEY, all);
  return all;
};
