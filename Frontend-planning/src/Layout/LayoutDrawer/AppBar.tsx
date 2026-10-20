import { useLocation } from "react-router-dom";
import ThemeSwitcher from "@/components/Theme/ThemeSwitcher";
import { allRoutes } from "@/routes/config";
import LogoText from "@/Layout/LayoutDrawer/Components/Other/LogoText";
import SearchBar from "@/Layout/LayoutDrawer/Components/Other/SearchBar"; // ✅ เรียกใช้ที่แยกไว้

const AppBar = () => {
  const location = useLocation();

  const currentRoute = allRoutes.find((r) =>
    location.pathname.startsWith(r.path)
  );

  const title = currentRoute?.Title || "Smart Factory Dashboard";

  return (
    <div className="sticky top-0 z-50 relative flex items-center bg-base-100/70 backdrop-blur-md px-3 border-b border-base-200 h-14 transition-colors duration-300">
      {/* Title */}
      <h1
        className="
    absolute left-1/2 top-1/2 
    -translate-x-1/2 -translate-y-1/2 
    font-bold text-base sm:text-lg lg:text-xl 
    text-center truncate 
    max-w-[70%] sm:max-w-[50%]
    text-base-content/90
    drop-shadow-sm
    hidden lg:block   /* 👈 ซ่อนบน sm/md — แสดงเฉพาะ lg ขึ้นไป */
  "
      >
        <LogoText text={title} />
      </h1>

      {/* Search bar + Theme switch */}
      <div className="ml-auto flex items-center gap-2">
        <SearchBar /> {/* ✅ Component แยกออกมา */}
        <ThemeSwitcher />
      </div>
    </div>
  );
};

export default AppBar;
