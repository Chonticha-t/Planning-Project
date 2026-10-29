import React from "react";
import { ClipboardList, Cog, LayoutDashboard } from "lucide-react";

// 🟧 Internal ICONS
import instruction from "@/assets/icon/menuDrawer/instruction/instruction.png";

// =========================================
// 🧭 PAGE IMPORTS (Lazy Loading)
// =========================================
const PO_Balance = React.lazy(() => import("@/pages/PO_Balance/main/PO_Balance"));
const Planning_In_Gate = React.lazy(
  () => import("@/pages/Planning_In_Gate/main/Planning_In_Gate")
);
const Planning_Summary = React.lazy(
  () => import("@/pages/Planning_Summary/main/Planning_Summary")
);

// =========================================
// ⚙️ BASE CONFIG
// =========================================
export const BASE = "/planning";

export type AppRoute = {
  path: string; // เส้นทางสำหรับหน้าที่จะไป
  element: React.ReactNode; // code หลักของหน้า
  label?: string; // สำหรับไว้สร้าง label
  Title?: string; // สำหรับไว้สร้าง Title
  isDefault?: boolean; // true กรณีต้องการให้เป็น page หลัก
  icon: any; // ไม่ต้องการแสดงส่ง null
  labelClassName?: string; // สำหรับปรับแต่ง class ของ label
};

// =========================================
// 🟦 PLANNING ROUTES
// =========================================
export const routes_planning: AppRoute[] = [
  {
    path: `${BASE}/po_balance`,
    element: <PO_Balance />,
    label: "PO BALANCE",
    Title: "PO BALANCE",
    isDefault: true,
    icon: ClipboardList,
  },
  {
    path: `${BASE}/planning_summary`,
    element: <Planning_Summary />,
    label: "PLANNING SUMMARY",
    Title: "PLANNING SUMMARY",
    icon: LayoutDashboard,
  },
  {
    path: `${BASE}/planning_in_gate`,
    element: <Planning_In_Gate />,
    label: "PLANNING IN GATE",
    Title: "PLANNING IN GATE",
    icon: Cog,
  },

];

export const routes_External: AppRoute[] = [
  {
    path: `http://10.17.66.242/Smart-Upload/dashboardhub`,
    element: <></>,
    label: "Instruction",
    Title: "Instruction",
    icon: instruction,
  },
];

export const allRoutes: AppRoute[] = [...routes_planning];
