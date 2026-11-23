import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { ApiResponse, Horizon, OverviewData } from "../types";

export const PLANNING_OVERVIEW_TABLE_API = `${getApiBaseUrl()}/planning_overview/table`;

const AJAX_TIMEOUT_MS = 15_000;
// Quiet background refresh so a page left open stays close to the source tables.
const AUTO_REFRESH_MS = 5 * 60_000;

const usePlanningOverview = (horizon: Horizon) => {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!silent) setLoading(true);

      try {
        const res = await axios.get<ApiResponse<OverviewData>>(PLANNING_OVERVIEW_TABLE_API, {
          params: { days: horizon, _t: Date.now() },
          timeout: AJAX_TIMEOUT_MS,
          signal: controller.signal,
        });
        if (res.data?.status === "OK" && res.data.data) {
          setData(res.data.data);
          setError(null);
        } else {
          throw new Error(res.data?.message || "Failed to load planning overview");
        }
      } catch (err: unknown) {
        if (axios.isCancel(err)) return;
        console.error("Error fetching planning overview:", err);
        const msg =
          (axios.isAxiosError(err) ? err.response?.data?.message : undefined) ||
          "Failed to load data. Please check that the backend is running.";
        setError(msg);
        if (!silent) toast.error(msg);
      } finally {
        // Only the latest request clears the spinner, even when a silent refresh replaced a visible load.
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [horizon]
  );

  useEffect(() => {
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  return { data, loading, error, reload: load };
};

export default usePlanningOverview;
