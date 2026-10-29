import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  ShieldCheck,
  LogOut,
  ChevronDown,
  User,
  BadgeCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ThemeSwitcher from "@/components/Theme/ThemeSwitcher";
import { allRoutes } from "@/routes/config";
import LogoText from "@/Layout/LayoutDrawer/Components/Other/LogoText";
import SearchBar from "@/Layout/LayoutDrawer/Components/Other/SearchBar";
import { useAuth } from "@/context/AuthContext";

const AppBar = () => {
  const location = useLocation();
  const { user, isAdmin, openLoginModal, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const currentRoute = allRoutes.find((r) =>
    location.pathname.startsWith(r.path)
  );

  const title = currentRoute?.Title || "Smart Factory Dashboard";

  // ปิดเมนู Profile เมื่อคลิกข้างนอก หรือกด Escape
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  const displayName = user?.full_name || user?.username || "Admin";

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
    hidden lg:block
  "
      >
        <LogoText text={title} />
      </h1>

      {/* Search bar + Auth Profile + Theme switch */}
      <div className="ml-auto flex items-center gap-2.5">
        <SearchBar />

        {isAdmin && user ? (
          <div ref={profileRef} className="relative">
            {/* Luxury Solid Blue Profile Trigger Button */}
            <button
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              className={`group flex items-center gap-2.5 pl-1.5 pr-3 py-1 h-9 rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] active:scale-[0.98] text-white shadow-[0_2px_10px_rgba(30,64,175,0.28)] border border-blue-400/25 transition-all duration-200 cursor-pointer ${
                profileOpen ? "ring-2 ring-blue-500/40 bg-[#1e3a8a]" : ""
              }`}
              title="Account Profile"
            >
              {/* User Icon Circle */}
              <div className="relative flex items-center justify-center size-6 rounded-full bg-white text-[#1e40af] shadow-xs shrink-0">
                <User size={14} strokeWidth={2.5} />
                <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-sky-400 ring-2 ring-[#1e40af]" />
              </div>

              {/* Name & Role */}
              <div className="flex items-center gap-1.5 text-left leading-none">
                <span className="text-[11px] font-medium text-blue-200 hidden sm:inline">
                  Admin
                </span>
                <span className="text-xs font-bold tracking-wide text-white max-w-[110px] truncate">
                  {user.username}
                </span>
              </div>

              <ChevronDown
                size={14}
                className={`text-blue-200 transition-transform duration-200 shrink-0 ${
                  profileOpen ? "rotate-180 text-white" : "group-hover:text-white"
                }`}
              />
            </button>

            {/* Profile & Logout Dropdown Menu */}
            <AnimatePresence>
              {profileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.96 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-64 rounded-2xl bg-base-100 border border-base-200/90 shadow-[0_12px_32px_rgba(15,23,42,0.16)] overflow-hidden z-50"
                >
                  {/* Top Luxury Blue Profile Card Header */}
                  <div className="bg-[#1e40af] px-4 py-3.5 text-white">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center size-10 rounded-full bg-white text-[#1e40af] shadow-sm shrink-0">
                        <User size={20} strokeWidth={2.3} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-sm text-white truncate">
                            {displayName}
                          </span>
                          <BadgeCheck
                            size={15}
                            className="text-sky-300 shrink-0"
                          />
                        </div>
                        <span className="text-xs text-blue-200 truncate">
                          @{user.username}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between pt-2.5 border-t border-white/15 text-[11px]">
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-100">
                        <ShieldCheck size={13} className="text-sky-300" />
                        Administrator
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/15 text-white font-medium text-[10.5px]">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        Active
                      </span>
                    </div>
                  </div>

                  {/* Profile Details Section */}
                  <div className="p-2 bg-base-100">
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-base-content/75">
                      <User size={15} className="text-[#1e40af] dark:text-blue-400 shrink-0" />
                      <div className="flex flex-col">
                        <span className="text-[10.5px] text-base-content/45 font-medium uppercase tracking-wider">
                          Role Permission
                        </span>
                        <span className="font-semibold text-base-content">
                          Full Planning Access
                        </span>
                      </div>
                    </div>

                    <div className="my-1 border-t border-base-200" />

                    {/* Logout Action */}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <LogOut size={15} />
                        <span>Sign Out</span>
                      </span>
                      <span className="text-[11px] font-normal opacity-60">
                        Exit Admin
                      </span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <button
            type="button"
            onClick={openLoginModal}
            className="group flex items-center gap-2 pl-1.5 pr-3.5 py-1 h-9 rounded-full bg-[#1e40af] hover:bg-[#1e3a8a] active:scale-[0.98] text-white border border-blue-400/25 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-[0_2px_10px_rgba(30,64,175,0.28)]"
            title="Admin Login"
          >
            <span className="flex items-center justify-center size-6 rounded-full bg-white text-[#1e40af] shadow-xs transition-transform group-hover:scale-105 shrink-0">
              <User size={14} strokeWidth={2.5} className="shrink-0" />
            </span>
            <span className="tracking-wide">Admin Login</span>
          </button>
        )}

        <ThemeSwitcher />
      </div>
    </div>
  );
};

export default AppBar;
