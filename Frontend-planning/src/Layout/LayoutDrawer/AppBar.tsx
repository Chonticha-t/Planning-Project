import { useLocation } from "react-router-dom";
import { ShieldCheck, LogIn, LogOut, Eye } from "lucide-react";
import ThemeSwitcher from "@/components/Theme/ThemeSwitcher";
import { allRoutes } from "@/routes/config";
import LogoText from "@/Layout/LayoutDrawer/Components/Other/LogoText";
import SearchBar from "@/Layout/LayoutDrawer/Components/Other/SearchBar";
import { useAuth } from "@/context/AuthContext";

const AppBar = () => {
  const location = useLocation();
  const { user, isAdmin, openLoginModal, logout } = useAuth();

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

      {/* Search bar + Auth Status + Theme switch */}
      <div className="ml-auto flex items-center gap-2">
        <SearchBar />

        {isAdmin && user ? (
          <div className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <ShieldCheck size={14} className="shrink-0" />
            <span className="hidden sm:inline">Admin:</span>
            <span className="font-bold">{user.username}</span>
            <button
              type="button"
              onClick={logout}
              className="btn btn-xs btn-ghost rounded-full px-2 h-6 min-h-0 text-[11px] font-semibold text-base-content/70 hover:text-error hover:bg-error/10 gap-1 ml-0.5 cursor-pointer"
              title="Logout from Admin mode"
            >
              <LogOut size={12} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-base-200/80 border border-base-300 text-base-content/60 text-[11px] font-semibold select-none"
              title="Read-only Viewer Mode"
            >
              <Eye size={12} className="shrink-0" />
              <span>Viewer</span>
            </span>
            <button
              type="button"
              onClick={openLoginModal}
              className="btn btn-sm h-8 min-h-0 px-3 rounded-full bg-base-200/80 hover:bg-primary hover:text-primary-content border border-base-300 hover:border-primary text-base-content text-xs font-semibold gap-1.5 transition-all cursor-pointer shadow-2xs"
              title="Login as Admin"
            >
              <LogIn size={13} className="shrink-0" />
              <span>Login</span>
            </button>
          </div>
        )}

        <ThemeSwitcher />
      </div>
    </div>
  );
};

export default AppBar;
