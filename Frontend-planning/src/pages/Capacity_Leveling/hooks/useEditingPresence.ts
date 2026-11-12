import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/utils/apiConfig";
import { uniqueScopes, type EditingScope, type EditingUser } from "../utils/editingPresence";

const BASE = `${getApiBaseUrl()}/capacity_leveling`;
const IDLE_MS = 120000;

export function useEditingPresence(scopes: EditingScope[], enabled: boolean) {
  const { user, canEditPlanning } = useAuth();
  const username = user?.username;
  const [editors, setEditors] = useState<EditingUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [publishing, setPublishing] = useState(true);
  const scopesKey = JSON.stringify(uniqueScopes(scopes));
  const currentScopes = useRef(scopesKey);
  currentScopes.current = scopesKey;
  const notify = useRef<(() => void) | null>(null);
  const activityAt = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    setConnected(false);
    setEditors([]);
    const stream = new EventSource(`${BASE}/presence/events`);
    let lastMessage = 0;
    stream.addEventListener("presence", event => {
      try {
        const body = JSON.parse((event as MessageEvent).data) as { editors: EditingUser[] };
        if (!Array.isArray(body.editors)) return;
        setEditors(body.editors);
        setConnected(true);
        lastMessage = Date.now();
      } catch { setConnected(false); setEditors([]); }
    });
    stream.onerror = () => { setConnected(false); setEditors([]); };
    const watchdog = window.setInterval(() => {
      if (!lastMessage || Date.now() - lastMessage > 20000) { setConnected(false); setEditors([]); }
    }, 5000);
    return () => { stream.close(); window.clearInterval(watchdog); };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !canEditPlanning || !username) return;
    setPublishing(true);
    // Each mounted page has its own lease; closing one tab cannot remove another.
    const tabId = crypto.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.floor(Math.random() * 16);
      return (c === "x" ? r : (r & 3) | 8).toString(16);
    });
    let stopped = false, busy = false, queued = false, hadLease = false;
    let debounce: number | undefined;
    const controller = new AbortController();
    const send = async () => {
      if (stopped) return;
      if (busy) { queued = true; return; }
      const active = document.visibilityState !== "hidden" && Date.now() - activityAt.current < IDLE_MS;
      const scopes = active ? JSON.parse(currentScopes.current) as EditingScope[] : [];
      if (!scopes.length && !hadLease) return;
      busy = true;
      hadLease = true;
      try {
        await axios.post(`${BASE}/presence`, { tabId, scopes }, { signal: controller.signal, timeout: 6000 });
        if (!stopped) { setPublishing(true); hadLease = scopes.length > 0; }
      } catch { if (!stopped) setPublishing(false); }
      finally {
        busy = false;
        if (queued && !stopped) { queued = false; void send(); }
      }
    };
    const schedule = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void send(), 200);
    };
    notify.current = () => { activityAt.current = Date.now(); schedule(); };
    const interaction = () => { activityAt.current = Date.now(); schedule(); };
    const visibility = () => { void send(); };
    const leave = () => {
      // Best effort on exit; the server lease also expires if the tab closes abruptly.
      void axios.delete(`${BASE}/presence/${tabId}`, { timeout: 3000 }).catch(() => {});
    };
    for (const event of ["pointerdown", "keydown", "input", "dragstart", "drop"]) window.addEventListener(event, interaction, true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", leave);
    const heartbeat = window.setInterval(() => void send(), 15000);
    void send();
    return () => {
      stopped = true;
      controller.abort();
      notify.current = null;
      window.clearTimeout(debounce);
      window.clearInterval(heartbeat);
      for (const event of ["pointerdown", "keydown", "input", "dragstart", "drop"]) window.removeEventListener(event, interaction, true);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [enabled, canEditPlanning, username]);

  useEffect(() => { notify.current?.(); }, [scopesKey]);

  return { editors: enabled ? editors : [], connected: enabled && connected, publishing };
}
