import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { fetchPlanHistory, fetchPlanHistoryDetail } from "../../Capacity_Leveling/hooks/api";
import { readLatestSavedPlan, type SavedGatePlan } from "../savedPlan";

export function useSavedPlan() {
  const [saved, setSaved] = useState<SavedGatePlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const result = await readLatestSavedPlan({
        list: signal => fetchPlanHistory(undefined, signal),
        detail: fetchPlanHistoryDetail,
      }, controller.signal);
      if (!controller.signal.aborted) setSaved(result);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(axios.isAxiosError(failure)
          ? "Unable to load the saved plan. Check your connection and access, then reload."
          : failure instanceof Error ? failure.message : "Unable to load the saved plan. Please reload.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    return () => request.current?.abort();
  }, [reload]);
  return { saved, loading, error, reload };
}
