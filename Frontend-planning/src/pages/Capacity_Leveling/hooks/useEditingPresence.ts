import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/utils/apiConfig";
import { uniqueScopes, type EditingScope, type EditingUser } from "../utils/editingPresence";

const BASE = `${getApiBaseUrl()}/capacity_leveling`;
const IDLE_MS = 120000;
const PRESENCE_STALE_MS = 20000;
const INITIAL_RETRY_MS = 5000;
const MAX_RETRY_MS = 30000;

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
    let stream: EventSource | null = null;
    let watchdog: number | undefined;
    let retryTimer: number | undefined;
    let retryAt = 0;
    let retryDelay = INITIAL_RETRY_MS;
    const canWatch = () => document.visibilityState === "visible" && navigator.onLine;

    const clearPresence = () => {
      setConnected(false);
      setEditors([]);
    };
    const stopWatching = () => {
      window.clearTimeout(retryTimer);
      window.clearTimeout(watchdog);
      retryTimer = undefined;
      const source = stream;
      stream = null;
      source?.close();
    };
    function retry() {
      stopWatching();
      clearPresence();
      // Spread retries from tabs that disconnected at the same time.
      retryAt = Date.now() + Math.min(MAX_RETRY_MS, retryDelay + Math.floor(Math.random() * 1000));
      retryDelay = Math.min(MAX_RETRY_MS, retryDelay * 2);
      connect();
    }
    const awaitPresence = () => {
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(retry, PRESENCE_STALE_MS);
    };
    function connect() {
      if (stream || retryTimer !== undefined || !canWatch()) return;
      const remaining = retryAt - Date.now();
      if (remaining > 0) {
        retryTimer = window.setTimeout(() => {
          retryTimer = undefined;
          connect();
        }, remaining);
        return;
      }

      let source: EventSource;
      try {
        source = new EventSource(`${BASE}/presence/events`);
      } catch {
        retry();
        return;
      }
      stream = source;
      awaitPresence();
      source.addEventListener("presence", event => {
        if (stream !== source) return;
        try {
          const body = JSON.parse((event as MessageEvent).data) as { editors: EditingUser[] };
          if (!Array.isArray(body?.editors)) {
            retry();
            return;
          }
          retryAt = 0;
          retryDelay = INITIAL_RETRY_MS;
          setEditors(body.editors);
          setConnected(true);
          awaitPresence();
        } catch { retry(); }
      });
      source.onerror = () => { if (stream === source) retry(); };
    }
    const sync = () => {
      if (canWatch()) connect();
      else {
        stopWatching();
        clearPresence();
      }
    };
    clearPresence();
    connect();
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      stopWatching();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
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
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void send();
    }, 15000);
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
