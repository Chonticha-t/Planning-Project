// "YYYY-MM-DD" (หรือ "YYYY-MM-DD HH:MI:SS") จาก API -> "DD/MM/YYYY" สำหรับแสดงผล
export const toDMY = (value: string | null | undefined) => {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : value;
};
