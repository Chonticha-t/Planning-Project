import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { BoardCardOrderGroup, CapacityResourceGroup, GateShiftConfig, LevelingData, LotNoteEntry, PlanInfo, PlanHistoryPage, PlanHistoryDetail } from "../types";

const BASE = `${getApiBaseUrl()}/capacity_leveling`;

export interface ApiFailure {
  code: string;
  message: string;
}

/** Turns any request failure into the server's code and message. */
export const toApiFailure = (error: unknown): ApiFailure => {
  if (error instanceof Error && error.name === "PlanningDataError") {
    return { code: "MAX_TARGET_UNAVAILABLE", message: error.message };
  }
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { code?: string; message?: string } | undefined;
    return {
      code: body?.code || (error.response ? "UNAVAILABLE" : "NETWORK"),
      message: body?.message || "Unable to reach the planning server. Please try again.",
    };
  }
  return { code: "UNKNOWN", message: "Something went wrong. Please try again." };
};

export const fetchLevelingData = async (startdate: string, stopdate: string, signal?: AbortSignal, refresh = false, reset = false) => {
  const { data } = await axios.get<{ data: LevelingData }>(`${BASE}/load`, {
    params: { startdate, stopdate, refresh, ...(reset ? { reset: true } : {}) },
    signal,
  });
  const next = data?.data;
  if (!next || next.calculationMethod !== "gate_arrival_max_target_v1" ||
    next.loadBasis !== "summary_gate_arrivals_v1" || !Array.isArray(next.arrivalRows) ||
    !Array.isArray(next.gates) || next.gates.some((gate) => !gate.standardShiftMin) ||
    !Array.isArray(next.calendarDays) || !Array.isArray(next.cards) || !Array.isArray(next.boardCardOrder)) {
    const error = new Error("Arrival planning data is unavailable. Reload after the planning server is updated.");
    error.name = "PlanningDataError";
    throw error;
  }
  return next;
};

export const fetchCapacity = async (signal?: AbortSignal, resourceGroup?: CapacityResourceGroup | "ALL") => {
  const { data } = await axios.get<{ data: { gates: GateShiftConfig[]; revision: string; resourceGroup?: string } }>(`${BASE}/capacity`, {
    params: resourceGroup ? { resourceGroup } : undefined,
    signal,
  });
  return data.data;
};

export const saveCapacity = async (
  gates: GateShiftConfig[],
  baseRevision: string,
  resourceGroup?: CapacityResourceGroup | "ALL"
) => {
  const { data } = await axios.put<{ data: { gates: GateShiftConfig[] } }>(`${BASE}/capacity`, {
    gates,
    baseRevision,
    ...(resourceGroup ? { resourceGroup } : {}),
  });
  return data.data.gates;
};

export interface PlanMove {
  workKey: string;
  gate: string;
  plannedDate: string;
}

export const savePlan = async (
  baseVersion: number,
  moves: PlanMove[],
  note: string,
  boardCardOrder: BoardCardOrderGroup[],
  resetToRequired = false
) => {
  const { data } = await axios.post<{ data: { plan: PlanInfo; movedCount: number; orderedGroupCount: number } }>(`${BASE}/plan`, {
    calculationMethod: "gate_arrival_max_target_v1",
    baseVersion,
    moves,
    note,
    boardCardOrder,
    ...(resetToRequired ? { resetToRequired: true } : {}),
  });
  return data.data;
};

export const fetchPlanHistory = async (before?: number, signal?: AbortSignal) => {
  const { data } = await axios.get<{ data: PlanHistoryPage }>(`${BASE}/plans`, {
    params: { before }, signal,
  });
  return data.data;
};

export const fetchPlanHistoryDetail = async (planId: string, signal?: AbortSignal, live = false, refresh = false) => {
  const { data } = await axios.get<{ data: PlanHistoryDetail }>(`${BASE}/plans/${encodeURIComponent(planId)}`, {
    ...(live ? { params: { live: true, ...(refresh ? { refresh: true } : {}) } } : {}),
    signal,
  });
  return data.data;
};

export const fetchActivePlanDetail = async (signal?: AbortSignal, live = true, refresh = false, compact = true) => {
  const { data } = await axios.get<{ data: PlanHistoryDetail | null }>(`${BASE}/plans/active`, {
    params: {
      ...(live ? { live: true } : {}),
      ...(refresh ? { refresh: true } : {}),
      ...(compact ? { compact: true } : {}),
    },
    signal,
  });
  return data.data;
};

export const deletePlanVersion = async (planId: string) => {
  await axios.delete(`${BASE}/plans/${encodeURIComponent(planId)}`);
};
