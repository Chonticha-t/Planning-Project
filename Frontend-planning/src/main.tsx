import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { registerSW } from "virtual:pwa-register";
import "./utility/Sweet_alert/Swal_custom.css";
import "@fortawesome/fontawesome-free/css/all.min.css";

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("A new version is available. Do you want to reload?")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("The app is ready to work offline.");
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
