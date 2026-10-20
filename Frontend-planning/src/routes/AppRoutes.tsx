// routes/AppRoutes.tsx
import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/Layout/LayoutDrawer/Layout.Drawer";
import Loading from "@/components/Loading";
import { BASE, allRoutes } from "./config";

const AppRoutes: React.FC = () => {
  // ✅ หาหน้า default จาก config
  const defaultRoute =
    allRoutes.find((r) => r.isDefault)?.path || `${BASE}/homepage-static`;

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path={BASE} element={<Layout />}>
          {/* index redirect */}
          <Route index element={<Navigate to={defaultRoute} replace />} />

          {/* map routes ทั้งหมด */}
          {allRoutes.map(({ path, element }) => (
            <Route key={path} path={path} element={element} />
          ))}

          {/* not found ภายใน BASE */}
          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Route>

        {/* not found ภายนอก BASE */}
        <Route path="*" element={<Navigate to={BASE} replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
