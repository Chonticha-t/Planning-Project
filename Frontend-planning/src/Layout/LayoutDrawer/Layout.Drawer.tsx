import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import Drawer from "./Drawer";
import AppBar from "./AppBar";

const LayoutDrawer = () => {
  const [isOpen, setIsOpen] = useState(true);
  const toggleDrawer = () => setIsOpen((prev) => !prev);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Drawer */}
      <Drawer isOpen={isOpen} toggleDrawer={toggleDrawer} />
      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <AppBar />
        <div className="flex-1 overflow-auto p-4 bg-base-200/30">
          <div className="min-h-full">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default LayoutDrawer;
