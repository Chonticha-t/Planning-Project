import { useCallback } from "react";
import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import { useInGateRead } from "./useInGateRead";

export interface FinishedEvidence {
  id: string; product: string; lotNo: string; gate: string; nextGate: string;
  currentProcess: string | null; scannedAt: string; scanType: "SCAN IN";
  processGroup: string | null; sourceUpdatedAt: string | null;
}
export interface FinishedState {
  rows: FinishedEvidence[]; loading: boolean; error?: string;
  reload: () => void; revalidate: () => void; checkedAt?: string; unresolved: number;
}

const errorMessage = () => "Unable to load Finished today. Please retry.";

/** Calendar-day evidence from latest WIP, independent of saved plan dates and pagination. */
export function useFinishedToday(date: string, enabled: boolean): FinishedState {
  const read = useCallback(async (signal: AbortSignal, refresh: boolean) => {
    const response = await axios.get<{ data: { date: string; coverage: string; checkedAt: string; rows: FinishedEvidence[]; unresolved: number } }>(
      `${getApiBaseUrl()}/capacity_leveling/routing/finished`, { params: { date, refresh }, signal, timeout: 20000 });
    const value = response.data?.data;
    const ids = new Set<string>();
    if (value?.date !== date || value.coverage !== "latest_wip_only" || typeof value.checkedAt !== "string"
      || !Number.isSafeInteger(value.unresolved) || value.unresolved < 0 || !Array.isArray(value.rows)
      || !value.rows.every(row => {
        if (!row || typeof row.id !== "string" || ids.has(row.id)) return false;
        ids.add(row.id);
        return [row.product, row.lotNo, row.gate, row.nextGate].every(item => typeof item === "string" && item.length > 0)
          && row.gate !== "PRE_FFPC" && row.scanType === "SCAN IN"
          && typeof row.scannedAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(row.scannedAt)
          && (row.currentProcess === null || typeof row.currentProcess === "string")
          && (row.processGroup === null || ["EFPC_GEN", "EFPC_AUTO", "SMT"].includes(row.processGroup))
          && (row.sourceUpdatedAt === null || typeof row.sourceUpdatedAt === "string");
      })) throw new Error("Invalid finished response");
    return value;
  }, [date]);
  const { data, ...state } = useInGateRead(date, enabled, read, errorMessage);
  return { ...state, rows: data?.rows ?? [], checkedAt: data?.checkedAt, unresolved: data?.unresolved ?? 0 };
}
