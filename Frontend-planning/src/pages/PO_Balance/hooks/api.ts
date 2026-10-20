import { getApiBaseUrl } from "@/utils/apiConfig";

export const API_BASE_URL = getApiBaseUrl();

// 📋 ตารางแผนผลิต (รับ filter: status, prd_name, startdate, stopdate)
export const PO_BALANCE_TABLE_API = `${API_BASE_URL}/table`;

// 📊 สรุปจำนวนแถว / ยอดที่ต้องผลิต แยกตาม status
export const PO_BALANCE_SUMMARY_API = `${API_BASE_URL}/summary`;

// 🔽 รายชื่อ product สำหรับ dropdown
export const PO_BALANCE_DISTINCT_PRODUCT_API = `${API_BASE_URL}/distinct_product`;
