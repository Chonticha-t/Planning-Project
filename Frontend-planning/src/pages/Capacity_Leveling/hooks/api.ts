import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { GateShiftConfig, LevelingData, PlanInfo } from "../types";

const BASE = `${getApiBaseUrl()}/capacity_leveling`;

export interface ApiFailure {
  code: string;
  message: string;
}

/** Turns any request failure into the server's code and message. */
export const toApiFailure = (error: unknown): ApiFailure => {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { code?: string; message?: string } | undefined;
    return {
      code: body?.code || (error.response ? "UNAVAILABLE" : "NETWORK"),
      message: body?.message || "Unable to reach the planning server. Please try again.",
    };
  }
  return { code: "UNKNOWN", message: "Something went wrong. Please try again." };
};

export const fetchLevelingData = async (startdate: string, stopdate: string, signal?: AbortSignal) => {
  const { data } = await axios.get<{ data: LevelingData }>(`${BASE}/load`, {
    params: { startdate, stopdate },
    signal,
  });
  return data.data;
};

export const fetchCapacity = async (signal?: AbortSignal) => {
  const { data } = await axios.get<{ data: { gates: GateShiftConfig[] } }>(`${BASE}/capacity`, { signal });
  return data.data.gates;
};

export const saveCapacity = async (gates: GateShiftConfig[]) => {
  const { data } = await axios.put<{ data: { gates: GateShiftConfig[] } }>(`${BASE}/capacity`, { gates });
  return data.data.gates;
};

export interface PlanMove {
  workKey: string;
  gate: string;
  plannedDate: string;
}

export const savePlan = async (baseVersion: number, moves: PlanMove[], note: string) => {
  const { data } = await axios.post<{ data: { plan: PlanInfo; movedCount: number } }>(`${BASE}/plan`, {
    baseVersion,
    moves,
    note,
  });
  return data.data;
};
