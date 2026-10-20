import { Menu } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import FujiLogo from "../assets/pic/Fuji.png";
import LogoText from "../Components/Other/LogoText";

interface DrawerHeaderProps {
  isOpen: boolean;
  toggleDrawer: () => void;
}

const DrawerHeader = ({ isOpen, toggleDrawer }: DrawerHeaderProps) => {
  return (
    <div className="flex items-center justify-between p-3 border-b border-base-300 overflow-hidden h-14 bg-base-200">
      <AnimatePresence mode="wait">
        {isOpen ? (
          <motion.div
            key="fujikura"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="flex items-center gap-2 font-bold text-lg text-nowrap select-none"
          >
            {/* โลโก้ Fuji */}
            <img
              src={FujiLogo}
              alt="Fuji Logo"
              className="w-8 h-8 object-contain"
            />
            {/* ข้อความ */}
            <LogoText text={"FUJIKURA P1"} />
            {/* 🔥 ตัวอักษรเด้งได้เมื่อ hover */}
          </motion.div>
        ) : (
          <motion.button
            key="open"
            onClick={toggleDrawer}
            className="btn btn-xs btn-ghost btn-circle mx-auto"
          >
            <Menu />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ปุ่ม hamburger ด้านขวา */}
      {isOpen && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleDrawer}
          className="btn btn-xs btn-ghost btn-circle"
        >
          <Menu />
        </motion.button>
      )}
    </div>
  );
};

export default DrawerHeader;
