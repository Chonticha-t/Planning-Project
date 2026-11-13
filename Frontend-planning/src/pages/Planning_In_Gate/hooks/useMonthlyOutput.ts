import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { InGateCategory } from "../types";
import { validateMonthlyOutput, type MonthlyOutput } from "../monthlyOutput";

export function useMonthlyOutput(month: string, category: InGateCategory, search: string, enabled: boolean) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data?: MonthlyOutput; error?: string }>({ key: "" });
  const query = search.trim();
  const key = JSON.stringify([month, category, query, revision, enabled]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await axios.get(`${getApiBaseUrl()}/capacity_leveling/routing/output/month`, {
            params: { month, category, search: query }, signal: controller.signal, timeout: 20000,
          });
          const data = validateMonthlyOutput(response.data?.data, month, category, query);
          if (!controller.signal.aborted) setState({ key, data });
        } catch {
          if (!controller.signal.aborted) setState({ key, error: "Unable to load observed output. Please retry." });
        }
      })();
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [month, category, query, enabled, key]);
  const current = enabled && state.key === key ? state : null;
  return { data: current?.data, error: current?.error, loading: enabled && !current, reload };
}
