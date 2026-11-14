import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";

export interface FinishedEvidence {
  id: string; product: string; lotNo: string; gate: string; nextGate: string;
  currentProcess: string | null; scannedAt: string; scanType: "SCAN IN";
  processGroup: string | null; sourceUpdatedAt: string | null;
}
export interface FinishedState {
  rows: FinishedEvidence[]; loading: boolean; error?: string;
  reload: () => void; checkedAt?: string; unresolved: number;
}

/** Calendar-day evidence from latest WIP, independent of saved plan dates and pagination. */
export function useFinishedToday(date: string, enabled: boolean): FinishedState {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; rows: FinishedEvidence[]; checkedAt?: string; error?: string; unresolved: number }>({ key: "", rows: [], unresolved: 0 });
  const key = `${date}|${revision}|${enabled}`;
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await axios.get<{ data: { date: string; coverage: string; checkedAt: string; rows: FinishedEvidence[]; unresolved: number } }>(
          `${getApiBaseUrl()}/capacity_leveling/routing/finished`, { params: { date }, signal: controller.signal, timeout: 20000 });
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
        if (!controller.signal.aborted) setState({ key, rows: value.rows, checkedAt: value.checkedAt, unresolved: value.unresolved });
      } catch {
        if (!controller.signal.aborted) setState({ key, rows: [], unresolved: 0, error: "Unable to load Finished today. Please retry." });
      }
    })();
    return () => controller.abort();
  }, [date, enabled, key]);
  const current = state.key === key ? state : null;
  return { rows: current?.rows ?? [], loading: Boolean(enabled && !current),
    error: current?.error, checkedAt: current?.checkedAt, unresolved: current?.unresolved ?? 0,
    reload };
}
