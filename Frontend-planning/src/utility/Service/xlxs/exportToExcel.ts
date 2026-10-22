import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import dayjs from "dayjs";
import { formatDateTimeType, exportToExcelType } from "./type";

// ฟังก์ชัน format วันที่เวลา
const formatDateTime: formatDateTimeType = (timestamp) => {
  return dayjs(timestamp).format("YYYY-MM-DD_HH-mm-ss");
};

// ฟังก์ชัน export เป็น Excel
export const exportToExcel: exportToExcelType = async ({ data, fileName, columns }) => {
  const currentDateTime = formatDateTime(Date.now());
  const fullFileName = `${fileName}_${currentDateTime}.xlsx`;

  if (!columns || columns.length === 0) {
    const ws = XLSX.utils.json_to_sheet(data);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

    XLSX.writeFile(wb, fullFileName);
    return;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  const hasGroup = columns.some((c) => Boolean(c.group));
  const headerRowCount = hasGroup ? 2 : 1;

  if (hasGroup) {
    let colIdx = 0;
    while (colIdx < columns.length) {
      const col = columns[colIdx];
      const excelCol = colIdx + 1;

      if (col.group) {
        const groupName = col.group;
        let endIdx = colIdx;
        while (endIdx + 1 < columns.length && columns[endIdx + 1].group === groupName) {
          endIdx++;
        }
        const endExcelCol = endIdx + 1;

        worksheet.getCell(1, excelCol).value = groupName;
        if (endExcelCol > excelCol) {
          worksheet.mergeCells(1, excelCol, 1, endExcelCol);
        }

        for (let i = colIdx; i <= endIdx; i++) {
          worksheet.getCell(2, i + 1).value = columns[i].header;
        }

        colIdx = endIdx + 1;
      } else {
        worksheet.getCell(1, excelCol).value = col.header;
        worksheet.mergeCells(1, excelCol, 2, excelCol);
        colIdx++;
      }
    }

    worksheet.getRow(1).height = 22;
    worksheet.getRow(2).height = 22;
  } else {
    columns.forEach((col, i) => {
      worksheet.getCell(1, i + 1).value = col.header;
    });
    worksheet.getRow(1).height = 24;
  }

  const headerBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFCBD5E1" } },
    bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
    left: { style: "thin", color: { argb: "FFCBD5E1" } },
    right: { style: "thin", color: { argb: "FFCBD5E1" } },
  };

  for (let r = 1; r <= headerRowCount; r++) {
    for (let c = 1; c <= columns.length; c++) {
      const cell = worksheet.getCell(r, c);
      const isGroupTop = hasGroup && r === 1 && Boolean(columns[c - 1].group);
      cell.font = { bold: true, size: 10, color: { argb: "FF1E293B" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: isGroupTop ? "FFE2E8F0" : "FFF1F5F9" },
      };
      cell.border = headerBorder;
    }
  }

  const cellBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };

  data.forEach((item, rowIdx) => {
    const excelRow = worksheet.getRow(headerRowCount + 1 + rowIdx);
    columns.forEach((col, cIdx) => {
      const cell = excelRow.getCell(cIdx + 1);
      const val = item[col.key];
      cell.value = val !== undefined && val !== null ? val : "";
      if (col.align) {
        cell.alignment = { vertical: "middle", horizontal: col.align };
      }
      if (col.numFmt && typeof val === "number") {
        cell.numFmt = col.numFmt;
      }
      cell.border = cellBorder;
    });
  });

  columns.forEach((col, cIdx) => {
    if (col.width) {
      worksheet.getColumn(cIdx + 1).width = col.width;
      return;
    }
    let maxLen = col.header.length;
    data.forEach((item) => {
      const valStr = String(item[col.key] ?? "");
      if (valStr.length > maxLen) maxLen = valStr.length;
    });
    worksheet.getColumn(cIdx + 1).width = Math.min(Math.max(maxLen + 4, 14), 40);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fullFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
};

// --- Example Usage ---
// const sampleData = [
//   { Name: "สมศรี", Age: 28, City: "กรุงเทพฯ" },
//   { Name: "มานะ", Age: 35, City: "เชียงใหม่" },
//   { Name: "อรุณี", Age: 22, City: "ภูเก็ต" },
// ];
// exportToExcel({ data: sampleData, fileName: "รายงานข้อมูลลูกค้า" });
