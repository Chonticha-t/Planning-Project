import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA, VitePWAOptions } from "vite-plugin-pwa";
import { fileURLToPath } from "url";
import path, { dirname } from "path";
import tailwindcss from "@tailwindcss/vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

const pwaOptions: Partial<VitePWAOptions> = {
  registerType: "autoUpdate",
  devOptions: {
    enabled: true,
  },
  includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
  // ทำให้อัปเดต SW ทันทีเมื่อมีของใหม่
  workbox: {
    clientsClaim: true,
    skipWaiting: true,
  },
  manifest: {
    name: "Planning",
    short_name: "Planning",
    description: "Production planning from PO and FG stock",
    icons: [
      { src: "icon/FujiLogo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "icon/FujiLogo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "icon/FujiLogo.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "icon/FujiLogo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    theme_color: "#171717",
    background_color: "#f0e7db",
    display: "standalone",
    scope: "/planning/",
    start_url: "/planning/",
    orientation: "portrait",
  },
};

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions), tailwindcss()],
  base: "/planning/",
  build: {
    sourcemap: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
  },
});

