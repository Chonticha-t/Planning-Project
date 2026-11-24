import { useCallback } from "react";
import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { InGateCategory } from "../types";
import { validateMonthlyOutput } from "../monthlyOutput";
import { useInGateRead } from "./useInGateRead";

const errorMessage = () => "Unable to load observed output. Please retry.";

export function useMonthlyOutput(
  month: string,
  category: InGateCategory,
  search: string,
  enabled: boolean,
  planId?: string | null,
) {
  const query = search.trim();
  const scopedPlanId = planId ?? null;
  const read = useCallback(async (signal: AbortSignal, refresh: boolean) => {
    const response = await axios.get(`${getApiBaseUrl()}/capacity_leveling/routing/output/month`, {
      params: { month, category, search: query, refresh, ...(scopedPlanId ? { planId: scopedPlanId } : {}) },
      signal,
      timeout: 20000,
    });
    return validateMonthlyOutput(response.data?.data, month, category, query, scopedPlanId);
  }, [month, category, query, scopedPlanId]);
  return useInGateRead(JSON.stringify([month, category, query, scopedPlanId]), enabled, read, errorMessage, 250);
}
