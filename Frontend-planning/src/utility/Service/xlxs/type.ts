// รับ timestamp แล้ว return string
export type formatDateTimeType = (timestamp: number) => string;

export interface ExcelColumn<T = any> {
  header: string;
  key: keyof T & string;
  group?: string;
  width?: number;
  align?: "left" | "center" | "right";
  numFmt?: string;
}

// รับ object { data, fileName, columns? }
export type exportToExcelType = <T extends Record<string, any> = any>(args: {
  data: T[];
  fileName: string;
  columns?: ExcelColumn<T>[];
}) => Promise<void> | void;
