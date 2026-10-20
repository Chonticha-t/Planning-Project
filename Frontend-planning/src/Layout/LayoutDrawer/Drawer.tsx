import DrawerHeader from "./Drawer.Config/DrawerHeader";
import DrawerMenu from "./Drawer.Config/DrawerMenu";
import DrawerFooter from "./Drawer.Config/DrawerFooter";

interface DrawerProps {
  isOpen: boolean;
  toggleDrawer: () => void;
}

const Drawer = ({ isOpen, toggleDrawer }: DrawerProps) => {
  return (
    // ใช้ CSS transition ที่ width แทนการสลับทันที ให้เนื้อหาด้านขวาค่อยๆ ขยาย/หด
    <div
      className={`bg-base-200 border-r border-base-300 shrink-0 overflow-hidden
      transition-[width] duration-300 ease-out
      ${isOpen ? "w-68" : "w-20"} flex flex-col`}
    >
        <DrawerHeader isOpen={isOpen} toggleDrawer={toggleDrawer} />
        <DrawerMenu isOpen={isOpen} toggleDrawer={toggleDrawer} />
        <DrawerFooter isOpen={isOpen} />
        {/* {JSON.stringify(cardsData)} */}
    </div>
  );
};

export default Drawer;
