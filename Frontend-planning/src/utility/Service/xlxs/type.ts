// รับ timestamp แล้ว return string
export type formatDateTimeType = (timestamp: number) => string;

// รับ object { data, fileName }
export type exportToExcelType = (args: { data: any[]; fileName: string }) => void;
