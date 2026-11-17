import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { ForecastApiResponse } from "../types";

export const API_BASE_URL = getApiBaseUrl();
export const FORECAST_API_URL = `${API_BASE_URL}/forecast`;

export const fetchForecastApi = async (signal?: AbortSignal): Promise<ForecastApiResponse> => {
  const res = await axios.get<ForecastApiResponse>(FORECAST_API_URL, {
    timeout: 15000,
    signal,
  });
  return res.data;
};
