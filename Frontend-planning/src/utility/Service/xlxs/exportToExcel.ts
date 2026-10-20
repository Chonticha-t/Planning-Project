import * as XLSX from "xlsx";
import dayjs from "dayjs";
import { formatDateTimeType, exportToExcelType } from "./type";

// ฟังก์ชัน format วันที่เวลา
const formatDateTime: formatDateTimeType = (timestamp) => {
  return dayjs(timestamp).format("YYYY-MM-DD_HH-mm-ss");
};

// ฟังก์ชัน export เป็น Excel
export const exportToExcel: exportToExcelType = ({ data, fileName }) => {
  const currentDateTime = formatDateTime(Date.now());
  const ws = XLSX.utils.json_to_sheet(data);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  XLSX.writeFile(wb, `${fileName}_${currentDateTime}.xlsx`);
};

// --- Example Usage ---
// const sampleData = [
//   { Name: "สมศรี", Age: 28, City: "กรุงเทพฯ" },
//   { Name: "มานะ", Age: 35, City: "เชียงใหม่" },
//   { Name: "อรุณี", Age: 22, City: "ภูเก็ต" },
// ];
// exportToExcel({ data: sampleData, fileName: "รายงานข้อมูลลูกค้า" });
