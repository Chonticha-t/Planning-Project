import { getApiBaseUrl } from "@/utils/apiConfig";

export const API_BASE_URL = getApiBaseUrl();

// 📋 ตาราง Planning Summary
export const PLANNING_SUMMARY_TABLE_API = `${API_BASE_URL}/planning_summary/table`;

// 📊 สรุป KPI ภาพรวม (Total PO, WIP, Problems, etc.)
export const PLANNING_SUMMARY_KPI_API = `${API_BASE_URL}/planning_summary/summary`;

// 🔽 รายชื่อ Dropdown filters (products, statuses, lot_statuses, factories)
export const PLANNING_SUMMARY_FILTERS_API = `${API_BASE_URL}/planning_summary/distinct_filters`;

