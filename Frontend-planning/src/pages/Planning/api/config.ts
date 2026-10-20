import { getApiBaseUrl } from "@/utils/apiConfig";

export const API_BASE_URL = getApiBaseUrl();

// 📋 ตารางแผนผลิต (รับ filter: status, prd_name, startdate, stopdate)
export const PLANNING_TABLE_API = `${API_BASE_URL}/table`;

// 📊 สรุปจำนวนแถว / ยอดที่ต้องผลิต แยกตาม status
export const PLANNING_SUMMARY_API = `${API_BASE_URL}/summary`;
