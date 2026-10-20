import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ExternalLink, LayoutDashboard } from "lucide-react";
import { motion, AnimatePresence, easeIn } from "motion/react";
import { routes_External, allRoutes } from "@/routes/config";

export type SearchBar = {
  path: string; // เส้นทางสำหรับหน้าที่จะไป
  element: React.ReactNode; // code หลักของหน้า
  label?: string; // สำหรับไว้สร้าง label
  Title?: string; // สำหรับไว้สร้าง Title
  isDefault?: boolean; // true กรณีต้องการให้เป็น page หลัก
  icon: any; // ไม่ต้องการแสดงส่ง null
};

const SearchBar = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const allRoutesExternal: SearchBar[] = [...routes_External];
  const allSearchable = useMemo(() => {
    return [
      ...allRoutes.map((r) => ({
        type: "route",
        title: r.Title,
        path: r.path,
        icon: r.icon,
        category: "Internal Page",
      })),
      ...allRoutesExternal.map((c) => ({
        type: "card",
        title: c.Title,
        path: c.path,
        icon: c.icon,
        category: "External App",
      })),
    ];
  }, []);

  // 🔍 กรองผลลัพธ์
  const filteredResults = useMemo(() => {
    if (!query.trim()) return [];
    return allSearchable.filter((item: any) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
  }, [query, allSearchable]);

  // 🖱 เมื่อผู้ใช้เลือกผลลัพธ์
  const handleSelect = (item: any) => {
    setQuery("");
    setIsFocused(false);
    if (item.type === "route") navigate(item.path);
    else if (item.type === "card") window.open(item.path, "_blank");
  };

  // 🎬 Motion Variants
  const containerVariants = {
    hidden: { opacity: 0, y: -10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { staggerChildren: 0.05, delayChildren: 0.05 },
    },
    exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.2 },
      easeIn,
    },
  };

  return (
    <div className="relative">
      {/* Input box */}
      <div className="flex items-center bg-base-100 border border-base-300 rounded-lg px-2 h-9 w-72 shadow-sm transition-all focus-within:ring-1 ring-primary">
        <Search size={16} className="opacity-70" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search dashboards or applications..."
          className="bg-transparent outline-none px-2 w-full text-sm"
        />
      </div>

      {/* Animated Dropdown Results */}
      <AnimatePresence>
        {isFocused && filteredResults.length > 0 && (
          <motion.div
            key="results"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 mt-2 bg-base-100 border border-base-300 rounded-xl shadow-xl w-[22rem] max-h-72 overflow-y-auto z-50 p-2"
          >
            {filteredResults.map((item, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ scale: 1.02, x: 5 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                onClick={() => handleSelect(item)}
                className="group flex items-center gap-3 p-2 rounded-lg cursor-pointer border border-transparent hover:border-primary/70 hover:bg-base-200 transition-all duration-150"
              >
                {/* Icon */}
                <div className="w-8 h-8 flex items-center justify-center rounded-md bg-base-300/50">
                  {item.icon ? (
                    <img
                      src={item.icon}
                      alt="icon"
                      width={24}
                      height={24}
                      className="object-contain"
                    />
                  ) : item.type === "route" ? (
                    <LayoutDashboard size={18} className="opacity-70" />
                  ) : (
                    <ExternalLink size={18} className="opacity-70" />
                  )}
                </div>

                {/* Text */}
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-semibold text-base-content group-hover:text-primary transition-colors truncate">
                    {item.title}
                  </span>
                  <span className="text-xs opacity-70 truncate">
                    {item.category === "Internal Page"
                      ? "Internal Route"
                      : "External Link"}
                  </span>
                </div>

                {/* Badge */}
                <motion.span
                  whileHover={{ scale: 1.1 }}
                  className={`ml-auto badge badge-sm ${
                    item.type === "route"
                      ? "badge-outline"
                      : "badge-primary/80 text-primary-content"
                  }`}
                >
                  {item.type === "route" ? "Internal" : "External"}
                </motion.span>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* No Results Animation */}
        {isFocused && query && filteredResults.length === 0 && (
          <motion.div
            key="noresults"
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="absolute right-0 mt-2 bg-base-100 border border-base-300 rounded-xl shadow-lg w-[22rem] p-4 text-sm text-center opacity-70"
          >
            No results found for “{query}”
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;
