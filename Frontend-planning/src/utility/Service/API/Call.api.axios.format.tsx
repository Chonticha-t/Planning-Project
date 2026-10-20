import axios, { AxiosRequestConfig } from "axios";
import Swal from "sweetalert2";

import Swal_Process_loading from "./Sweet_alert/Swal_Process_loading";
import SwalServerError from "./Sweet_alert/Swal_server_error";
import SwalNetworkError from "./Sweet_alert/Swal_newwork_error";
import { buildNoDataHtmlPRD } from "./Sweet_alert/buildNoDataHtml";

interface CallApiOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path_api: string;
  show_toast?: boolean;
  params?: any;
  body?: any;
}

/**
 * แสดง Swal กรณี response ไม่ใช่ "OK"
 */
const handleWarningResponse = (
  method: string,
  path_api: string,
  data: any,
  params?: any
) => {
  Swal.fire({
    title: data?.status || "Warning",
    text: data?.message || "ไม่พบข้อมูลที่ต้องการ",
    icon: "warning",
    html: buildNoDataHtmlPRD({
      subtitle: data?.message || "ไม่พบข้อมูลที่ต้องการ",
      endpoint: `${import.meta.env.VITE_API_IP}${path_api}`,
      method,
      params,
    }),
  });
};

/**
 * แสดง Swal กรณี Error (Network หรือ Server)
 */
const handleAxiosError = async (error: any) => {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return SwalNetworkError({
        error,
        title: "🌐 Connection Error",
        showTroubleshooting: true,
      });
    }
    return SwalServerError({
      error,
      title: error.response.data?.status || "Server Error",
      showActionRequired: true,
    });
  }

  console.error("Unexpected error:", error);
  return Swal.fire({
    title: "Unexpected Error",
    text: "An unexpected error occurred. Please try again later.",
    icon: "error",
  });
};

/**
 * ฟังก์ชันหลัก สำหรับเรียก API
 */
const Callapiaxiosformat = async ({
  method,
  path_api,
  show_toast = false,
  params,
  body,
}: CallApiOptions) => {
  try {
    if (show_toast) {
      Swal_Process_loading({
        title: "กำลังดำเนินการ",
        message: "กรุณารอสักครู่",
        icon: "⚡",
      });
    }

    const config: AxiosRequestConfig = {
      method,
      url: `${import.meta.env.VITE_API_IP}${path_api}`,
      params,
      data: body,
      maxBodyLength: Infinity,
    };

    console.log("API Request Config:", config);

    const response = await axios(config);

    if (response.data?.status === "OK") {
      Swal.close();
      return response.data;
    }

    handleWarningResponse(method, path_api, response.data, params);
    return response.data;
  } catch (error) {
    await handleAxiosError(error);
    throw error;
  }
};

export default Callapiaxiosformat;
