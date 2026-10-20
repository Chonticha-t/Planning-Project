import { motion } from "motion/react";

interface DrawerFooterProps {
  isOpen: boolean;
}

const DrawerFooter = ({ isOpen }: DrawerFooterProps) => {
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="sticky p-3 border-t border-base-300 bg-base-100 text-center text-nowrap"
    >
      <div
        className={`flex items-center text-xs text-base-content/70 ${isOpen ? "justify-between" : "justify-center"
          }`}
      >
        {isOpen ? (
          <>
            <div className="flex flex-col text-left leading-tight">
              <span className="font-semibold text-base-content/90">
                © {new Date().getFullYear()} PLANNING P1
              </span>
              <span className="text-[11px] opacity-70">
                Fujikura Electronics (Thailand) Ltd.
              </span>
              <span className="text-[11px] opacity-80">
                {/* All rights reserved. Developed by SMF Team. */}
              </span>
              <span className="text-[11px] opacity-60"></span>
            </div>
          </>
        ) : (
          <div className="text-[11px] opacity-60 text-center text-nowrap">
            © {new Date().getFullYear()} SMF
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DrawerFooter;
