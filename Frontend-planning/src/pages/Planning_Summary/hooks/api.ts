import { getApiBaseUrl } from "@/utils/apiConfig";

export const API_BASE_URL = getApiBaseUrl();

// 📋 ตาราง Planning Summary
export const PLANNING_SUMMARY_TABLE_API = `${API_BASE_URL}/planning_summary/table`;

// 📊 สรุป KPI ภาพรวม (Total PO, WIP, Problems, etc.)
export const PLANNING_SUMMARY_KPI_API = `${API_BASE_URL}/planning_summary/summary`;

// 🔽 รายชื่อ Dropdown filters (products, statuses, lot_statuses, factories)
export const PLANNING_SUMMARY_FILTERS_API = `${API_BASE_URL}/planning_summary/distinct_filters`;

// ⚡ Server-Sent Events (SSE) Stream สำหรับรับสัญญาณ Real-time เมื่อ Database อัปเดต
export const PLANNING_SUMMARY_STREAM_API = `${API_BASE_URL}/planning_summary/stream`;

// ⏭️ กดปุ่ม Skip Due สำหรับย้าย Lot ที่ติด PENDING ไป Due Date ถัดไป
export const PLANNING_SUMMARY_SKIP_DUE_API = `${API_BASE_URL}/planning_summary/skip_due`;

// ↩️ กดปุ่ม Undo Skip สำหรับคืนค่า Lot กลับไป Due Date เดิม
export const PLANNING_SUMMARY_UNSKIP_DUE_API = `${API_BASE_URL}/planning_summary/unskip_due`;
