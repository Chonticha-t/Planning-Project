import DrawerMenuGroup from "../Components/DrawerMenuGroup";

import { routes_planning } from "@/routes/config";

import production_app from "@/assets/icon/menuDrawer/production/production-app.png";

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
        title="Planning"
        icon={production_app}
        links={routes_planning}
      />
    </nav>
  );
};

export default DrawerMenu;
