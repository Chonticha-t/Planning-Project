import { AnimatePresence } from "motion/react";
import DrawerHeader from "./Drawer.Config/DrawerHeader";
import DrawerMenu from "./Drawer.Config/DrawerMenu";
import DrawerFooter from "./Drawer.Config/DrawerFooter";

interface DrawerProps {
  isOpen: boolean;
  toggleDrawer: () => void;
}

const Drawer = ({ isOpen, toggleDrawer }: DrawerProps) => {
  return (
    <AnimatePresence>
      <div
        className={`bg-base-200 border-r border-base-300 
        ${isOpen ? "w-68" : "w-20"} flex flex-col`}
      >
        <DrawerHeader isOpen={isOpen} toggleDrawer={toggleDrawer} />
        <DrawerMenu isOpen={isOpen} toggleDrawer={toggleDrawer} />
        <DrawerFooter isOpen={isOpen} />
        {/* {JSON.stringify(cardsData)} */}
      </div>
    </AnimatePresence>
  );
};

export default Drawer;
