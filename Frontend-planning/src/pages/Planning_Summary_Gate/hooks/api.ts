import { getApiBaseUrl } from "@/utils/apiConfig";

export const API_BASE_URL = getApiBaseUrl();

// 📋 Table rows API
export const PLANNING_SUMMARY_GATE_TABLE_API = `${API_BASE_URL}/planning_summary_gate/table`;

// 📊 Gate KPIs summary API
export const PLANNING_SUMMARY_GATE_SUMMARY_API = `${API_BASE_URL}/planning_summary_gate/summary`;
export const PLANNING_SUMMARY_GATE_CALENDAR_API = `${API_BASE_URL}/planning_summary_gate/calendar`;

