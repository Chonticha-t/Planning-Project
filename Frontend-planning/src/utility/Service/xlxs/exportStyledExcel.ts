import ExcelJS from "exceljs";

export interface ExportStyledExcelOptions {
  title?: string;
  metadata?: Record<string, string | number>;
  data: Record<string, any>[];
  fileName: string;
  sheetName?: string;
  themeColor?: string;
  showTotalRow?: boolean;
  totalColumns?: string[];
}

export async function exportStyledExcel(options: ExportStyledExcelOptions) {
  const {
    title,
    metadata,
    data,
    fileName,
    sheetName = "Sheet1",
    themeColor = "teal",
    showTotalRow = false,
    totalColumns = [],
  } = options;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Define theme colors (ARGB)
  const colorMap: Record<string, { headerBg: string; titleBg: string; fontColor: string }> = {
    teal: { headerBg: "FF0D9488", titleBg: "FF115E59", fontColor: "FFFFFFFF" },
    navy: { headerBg: "FF1E3A8A", titleBg: "FF172554", fontColor: "FFFFFFFF" },
    blue: { headerBg: "FF2563EB", titleBg: "FF1E40AF", fontColor: "FFFFFFFF" },
    emerald: { headerBg: "FF059669", titleBg: "FF065F46", fontColor: "FFFFFFFF" },
  };

  const theme = colorMap[themeColor] || colorMap.teal;

  let currentRow = 1;

  // Title
  if (title) {
    const titleRow = worksheet.getRow(currentRow);
    titleRow.getCell(1).value = title;
    titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: "FF1E293B" } };
    currentRow += 2;
  }

  // Metadata
  if (metadata && Object.keys(metadata).length > 0) {
    for (const [key, val] of Object.entries(metadata)) {
      const metaRow = worksheet.getRow(currentRow);
      metaRow.getCell(1).value = key;
      metaRow.getCell(1).font = { bold: true, color: { argb: "FF475569" } };
      metaRow.getCell(2).value = val;
      metaRow.getCell(2).font = { color: { argb: "FF334155" } };
      currentRow++;
    }
    currentRow++; // Blank row before table
  }

  if (data.length === 0) {
    worksheet.getRow(currentRow).getCell(1).value = "No Data";
  } else {
    const columns = Object.keys(data[0]);

    // Table Header
    const headerRow = worksheet.getRow(currentRow);
    columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col;
      cell.font = { bold: true, color: { argb: theme.fontColor } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: theme.headerBg },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    headerRow.height = 24;
    currentRow++;

    // Data rows
    data.forEach((item, rIdx) => {
      const row = worksheet.getRow(currentRow);
      columns.forEach((col, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        const val = item[col];
        cell.value = val !== undefined && val !== null ? val : "";
        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        // Alternating row background
        if (rIdx % 2 === 1) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
        }
      });
      currentRow++;
    });

    // Total row
    if (showTotalRow && data.length > 0) {
      const totalRow = worksheet.getRow(currentRow);
      columns.forEach((col, cIdx) => {
        const cell = totalRow.getCell(cIdx + 1);
        if (cIdx === 0) {
          cell.value = "Total";
          cell.font = { bold: true };
        } else if (totalColumns.includes(col)) {
          let sum = 0;
          data.forEach((item) => {
            const num = parseFloat(String(item[col] || "").replace(/,/g, ""));
            if (!isNaN(num)) sum += num;
          });
          cell.value = sum;
          cell.font = { bold: true };
        }
        cell.border = {
          top: { style: "thin", color: { argb: "FF94A3B8" } },
          bottom: { style: "double", color: { argb: "FF94A3B8" } },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F5F9" },
        };
      });
      currentRow++;
    }

    // Auto-fit column widths
    columns.forEach((col, idx) => {
      let maxLen = col.length;
      data.forEach((item) => {
        const valStr = String(item[col] ?? "");
        if (valStr.length > maxLen) maxLen = valStr.length;
      });
      worksheet.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 4, 12), 40);
    });
  }

  // Trigger download in browser
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}
