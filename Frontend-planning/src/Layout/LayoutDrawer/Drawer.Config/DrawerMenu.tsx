import { CalendarRange, Gauge } from "lucide-react";
import DrawerMenuGroup from "../Components/DrawerMenuGroup";

import { routes_planning, routes_capacity } from "@/routes/config";

interface DrawerMenuProps {
  isOpen: boolean;
  toggleDrawer: () => void;
}

const DrawerMenu = ({ isOpen, toggleDrawer }: DrawerMenuProps) => {
  return (
    <nav className="flex-1 flex flex-col gap-2 p-2 overflow-y-auto">
      <DrawerMenuGroup
        isOpen={isOpen}
        toggleDrawer={toggleDrawer}
        title="CAPACITY"
        icon={Gauge}
        links={routes_capacity}
      />
      <DrawerMenuGroup
        isOpen={isOpen}
        toggleDrawer={toggleDrawer}
        title="PLANNING SYSTEM"
        icon={CalendarRange}
        links={routes_planning}
      />
    </nav>
  );
};

export default DrawerMenu;
