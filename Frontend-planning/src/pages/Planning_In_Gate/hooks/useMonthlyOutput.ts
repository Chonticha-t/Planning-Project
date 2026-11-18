import { useCallback } from "react";
import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { InGateCategory } from "../types";
import { validateMonthlyOutput } from "../monthlyOutput";
import { useInGateRead } from "./useInGateRead";

const errorMessage = () => "Unable to load observed output. Please retry.";

export function useMonthlyOutput(month: string, category: InGateCategory, search: string, enabled: boolean) {
  const query = search.trim();
  const read = useCallback(async (signal: AbortSignal, refresh: boolean) => {
    const response = await axios.get(`${getApiBaseUrl()}/capacity_leveling/routing/output/month`, {
      params: { month, category, search: query, refresh }, signal, timeout: 20000,
    });
    return validateMonthlyOutput(response.data?.data, month, category, query);
  }, [month, category, query]);
  return useInGateRead(JSON.stringify([month, category, query]), enabled, read, errorMessage, 250);
}
