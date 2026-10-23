import { getApiBaseUrl } from "@/utils/apiConfig";

export const API_BASE_URL = getApiBaseUrl();

// 📋 ตารางแผนผลิต (รับ filter: status, prd_name, startdate, stopdate)
export const PO_BALANCE_TABLE_API = `${API_BASE_URL}/table`;

// 📊 สรุปจำนวนแถว / ยอดที่ต้องผลิต แยกตาม status
export const PO_BALANCE_SUMMARY_API = `${API_BASE_URL}/summary`;

// 🔽 รายชื่อ product สำหรับ dropdown
export const PO_BALANCE_DISTINCT_PRODUCT_API = `${API_BASE_URL}/distinct_product`;

// 🕒 เช็คเวลาอัปเดตล่าสุดของตาราง po_balance สำหรับ Auto Refresh
export const PO_BALANCE_LAST_UPDATED_API = `${API_BASE_URL}/last_updated`;

// 💱 อัตราแลกเปลี่ยนรายเดือน (GET ดึงข้อมูล, POST บันทึกเข้า DB)
export const PO_BALANCE_EXCHANGE_RATE_API = `${API_BASE_URL}/exchange_rate`;

// ⚡ Server-Sent Events (SSE) Stream สำหรับรับสัญญาณ Real-time เมื่อ Database อัปเดต
export const PO_BALANCE_STREAM_API = `${API_BASE_URL}/stream`;
