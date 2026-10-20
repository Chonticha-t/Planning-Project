"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "motion/react";
import { Theme } from "./type";

const themes: Theme[] = [
  "light",
  "dark",
  "cupcake",
  "bumblebee",
  "emerald",
  "corporate",
  "synthwave",
  "retro",
  "cyberpunk",
  "valentine",
  "halloween",
  "garden",
  "forest",
  "aqua",
  "lofi",
  "pastel",
  "fantasy",
  "wireframe",
  "black",
  "luxury",
  "dracula",
  "cmyk",
  "autumn",
  "business",
  "acid",
  "lemonade",
  "night",
  "coffee",
  "winter",
  "dim",
  "nord",
  "sunset",
  "caramellatte",
  "abyss",
  "silk",
  "custom",
  "calm-day",
  "Dark-Purple",
];

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <motion.dialog
          key="theme-modal"
          className="font-Bangers modal modal-open z-[99]"
          onClick={() => setIsOpen(false)}
          aria-modal="true"
          aria-label="Theme selector"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", damping: 15, stiffness: 200 }}
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            className="modal-box max-w-3xl bg-base-100 shadow-lg"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <motion.h3
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4 }}
                className="text-2xl font-semibold"
              >
                Select Theme
              </motion.h3>

              <motion.button
                whileHover={{ rotate: 90, scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                className="btn btn-ghost btn-sm"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
              >
                ✕
              </motion.button>
            </div>

            {/* Grid Themes */}
            <motion.div
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{
                visible: {
                  transition: {
                    staggerChildren: 0.05,
                    delayChildren: 0.1,
                  },
                },
              }}
            >
              {themes.map((t) => (
                <motion.div
                  key={t}
                  data-theme={t}
                  className={`card bg-base-100 cursor-pointer hover:scale-105 transition-transform
                    ${theme === t ? "ring-2 ring-primary" : ""}
                  `}
                  onClick={() => {
                    setTheme(t);
                    setIsOpen(false);
                  }}
                >
                  <div className="card-body p-3 text-xl">
                    {/* ชื่อ + จุดสีหลัก */}
                    <div className="flex items-center gap-2">
                      <motion.div
                        layoutId={`dot-${t}`}
                        className="w-4 h-4 rounded-full bg-primary shadow"
                      />
                      <span className="capitalize text-base-content text-md font-medium">
                        {t}
                      </span>
                    </div>

                    {/* Preview 4 สี */}
                    <div className="grid grid-cols-4 gap-1 mt-2">
                      <div className="h-3 w-full rounded bg-primary" />
                      <div className="h-3 w-full rounded bg-secondary" />
                      <div className="h-3 w-full rounded bg-accent" />
                      <div className="h-3 w-full rounded bg-neutral" />
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </motion.dialog>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* 🟡 ปุ่มเปิด */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="btn btn-circle btn-ghost"
        aria-label="Open theme switcher"
        whileHover={{
          rotate: 15,
          scale: 1.1,
          boxShadow: "0 0 12px rgba(255, 200, 0, 0.5)",
        }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 200, damping: 10 }}
      >
        {/* ไอคอนดวงอาทิตย์/พระจันทร์ */}
        <motion.svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          initial={{ rotate: 0 }}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.4 }}
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </motion.svg>
      </motion.button>

      {/* Portal */}
      {createPortal(modal, document.body)}
    </>
  );
};

export default ThemeSwitcher;
