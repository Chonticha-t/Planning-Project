import React from "react";
import { ClipboardList, Cog, LayoutDashboard, DoorOpen, SlidersHorizontal, TrendingUp, Cpu } from "lucide-react";

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
const Planning_Summary_Gate = React.lazy(
  () => import("@/pages/Planning_Summary_Gate/main/Planning_Summary_Gate")
);
const Capacity_Leveling = React.lazy(
  () => import("@/pages/Capacity_Leveling/main/Capacity_Leveling")
);
const Forecast = React.lazy(() => import("@/pages/Forecast/main/Forecast"));
const Machine_Loading = React.lazy(
  () => import("@/pages/Machine_Loading/main/Machine_Loading")
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
// 🟦 CAPACITY ROUTES (Left Drawer Menu)
// =========================================
export const routes_capacity: AppRoute[] = [
  {
    path: `${BASE}/forecast`,
    element: <Forecast />,
    label: "FORECAST",
    Title: "FORECAST",
    icon: TrendingUp,
  },
  {
    path: `${BASE}/machine_loading`,
    element: <Machine_Loading />,
    label: "MACHINE LOADING",
    Title: "MACHINE LOADING",
    icon: Cpu,
  },
];

// =========================================
// 🟦 PLANNING ROUTES (Left Drawer Menu)
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
    path: `${BASE}/planning_summary_gate`,
    element: <Planning_Summary_Gate />,
    label: "PLANNING SUMMARY GATE",
    Title: "PLANNING SUMMARY GATE",
    icon: DoorOpen,
  },
  {
    path: `${BASE}/planning_in_gate`,
    element: <Planning_In_Gate />,
    label: "PLANNING IN GATE",
    Title: "PLANNING IN GATE",
    icon: Cog,
  },
];

// Sub-routes not shown in the left Drawer menu (accessed from inside pages)
export const routes_hidden: AppRoute[] = [
  {
    path: `${BASE}/capacity/forecast`,
    element: <Forecast />,
    label: "FORECAST",
    Title: "FORECAST",
    icon: TrendingUp,
  },
  {
    path: `${BASE}/capacity/machine_loading`,
    element: <Machine_Loading />,
    label: "MACHINE LOADING",
    Title: "MACHINE LOADING",
    icon: Cpu,
  },
  {
    path: `${BASE}/planning_summary_gate/capacity_leveling`,
    element: <Capacity_Leveling />,
    label: "CAPACITY LEVELING",
    Title: "PLANNING SUMMARY GATE",
    icon: SlidersHorizontal,
  },
  {
    path: `${BASE}/capacity_leveling`,
    element: <Capacity_Leveling />,
    label: "CAPACITY LEVELING",
    Title: "PLANNING SUMMARY GATE",
    icon: SlidersHorizontal,
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

export const allRoutes: AppRoute[] = [
  ...routes_capacity,
  ...routes_planning,
  ...routes_hidden,
];
