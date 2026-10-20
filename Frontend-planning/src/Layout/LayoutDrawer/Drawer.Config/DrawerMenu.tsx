import { CalendarRange } from "lucide-react";
import DrawerMenuGroup from "../Components/DrawerMenuGroup";

import { routes_planning } from "@/routes/config";

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
      title="PLANNING SYSTEM"
        icon={CalendarRange}
        links={routes_planning}
      />
    </nav>
  );
};

export default DrawerMenu;
