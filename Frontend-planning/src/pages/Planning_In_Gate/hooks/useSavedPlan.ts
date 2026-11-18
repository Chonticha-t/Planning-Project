import axios from "axios";
import { fetchPlanHistory, fetchPlanHistoryDetail } from "../../Capacity_Leveling/hooks/api";
import { readLatestSavedPlan } from "../savedPlan";
import { useInGateRead } from "./useInGateRead";

const read = (signal: AbortSignal, refresh: boolean) => readLatestSavedPlan({
  list: signal => fetchPlanHistory(undefined, signal),
  detail: (id, signal) => fetchPlanHistoryDetail(id, signal, true, refresh),
}, signal);

const errorMessage = (failure: unknown) => axios.isAxiosError(failure)
  ? "Unable to load the saved plan. Check your connection and access, then reload."
  : failure instanceof Error ? failure.message : "Unable to load the saved plan. Please reload.";

export function useSavedPlan() {
  const { data, ...state } = useInGateRead("active-plan", true, read, errorMessage);
  return { saved: data ?? null, ...state };
}
