/**
 * Utility function to dynamically resolve Backend API Base URL.
 * ใช้ VITE_API_BASE_URL ก่อน ถ้าไม่มีจะต่อกับ host เดียวกับหน้าเว็บที่ port VITE_API_PORT
 */
export const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim() !== "") {
    return envUrl.trim().replace(/\/$/, "");
  }

  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const hostname = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const port = import.meta.env.VITE_API_PORT || "3001";
  return `${protocol}//${hostname}:${port}/api_p1/planning`;
};

export const API_BASE_URL = getApiBaseUrl();
