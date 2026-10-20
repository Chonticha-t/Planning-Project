import { useState, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster } from "react-hot-toast";

import {
  ThemeProvider as ThemeProvider_mui,
  createTheme,
} from "@mui/material/styles";
import { getThemeColors, observeThemeChanges } from "./themeUtils";
import AppRoutes from "@/routes/AppRoutes";

function App() {
  const [themeColors, setThemeColors] = useState<any>({});

  useEffect(() => {
    const update = () => setThemeColors(getThemeColors());
    update();
    const ob = observeThemeChanges(update);
    return () => ob.disconnect();
  }, []);

  const theme = createTheme({
    breakpoints: { values: { xs: 375, sm: 534, md: 640, lg: 1072, xl: 1520 } },
    typography: { fontFamily: "'Inter Variable', 'sans-serif'" },
    palette: {
      primary: { main: themeColors["primary"] || "#007bff" },
      secondary: { main: themeColors["secondary"] || "#6c757d" },
      error: { main: themeColors["error"] || "#dc3545" },
      warning: { main: themeColors["warning"] || "#ffc107" },
      info: { main: themeColors["info"] || "#17a2b8" },
      success: { main: themeColors["success"] || "#28a745" },
      background: {
        default: themeColors["base-100"] || "#ffffff",
        paper: themeColors["base-100"] || "#f5f5f5",
      },
      text: {
        primary: themeColors["base-content"] || "#212529",
        secondary: themeColors["base-content"] || "#212529",
      },
    },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            border: `1px solid ${themeColors["base-300"] || "#e5e7eb"}`,
          },
        },
      },
      MuiSvgIcon: {
        styleOverrides: {
          root: { color: themeColors["primary"] || "inherit" },
        },
      },
    },
  });

  return (
    <ThemeProvider_mui theme={theme}>
      <ThemeProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster
            position="top-center"
            containerStyle={{ zIndex: 99999, top: 20 }}
            toastOptions={{
              duration: 3500,
              className: "border border-slate-200/80 shadow-lg text-slate-800 cursor-pointer",
              style: {
                borderRadius: "12px",
                background: "rgba(255, 255, 255, 0.95)",
                backdropFilter: "blur(12px)",
                padding: "10px 14px",
                fontSize: "14px",
              },
            }}
          />
        </BrowserRouter>
      </ThemeProvider>
    </ThemeProvider_mui>
  );
}

export default App;
