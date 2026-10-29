import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { getApiBaseUrl } from "@/utils/apiConfig";
import LoginModal from "@/components/Auth/LoginModal";

export interface AuthUser {
  user_id: number;
  username: string;
  full_name: string;
  role: "admin" | "viewer";
}

interface StoredSession {
  token: string;
  user: AuthUser;
  expiresAt: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAdmin: boolean;
  expiresAt: number | null;
  openLoginModal: () => void;
  logout: () => void;
  requireAdmin: (action?: () => void | Promise<void>) => Promise<boolean>;
}

const STORAGE_KEY = "planning_auth_session";
const API_BASE_URL = getApiBaseUrl();
const AUTH_LOGIN_API = `${API_BASE_URL}/auth/login`;
const AUTH_ME_API = `${API_BASE_URL}/auth/me`;

const AuthContext = createContext<AuthContextValue | null>(null);

const loadStoredSession = (): StoredSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      !parsed ||
      !parsed.token ||
      !parsed.user ||
      !parsed.expiresAt ||
      parsed.expiresAt <= Date.now()
    ) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [session, setSession] = useState<StoredSession | null>(() =>
    loadStoredSession()
  );
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const sessionRef = useRef<StoredSession | null>(session);
  sessionRef.current = session;

  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);
  const pendingResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const clearSession = useCallback((silent = false) => {
    localStorage.removeItem(STORAGE_KEY);
    sessionRef.current = null;
    setSession(null);
    delete axios.defaults.headers.common["Authorization"];
    if (!silent) {
      toast("Switched to Viewer mode", { icon: "🔒", duration: 2500 });
    }
  }, []);

  // Sync default Authorization header and setup Axios interceptors
  useEffect(() => {
    if (session?.token && session.expiresAt > Date.now()) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${session.token}`;
    } else {
      delete axios.defaults.headers.common["Authorization"];
    }
  }, [session]);

  useEffect(() => {
    const reqInterceptor = axios.interceptors.request.use((config) => {
      const current = sessionRef.current;
      if (current && current.token && current.expiresAt > Date.now()) {
        config.headers = config.headers ?? {};
        config.headers["Authorization"] = `Bearer ${current.token}`;
      }
      return config;
    });

    const resInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        const reqUrl = String(error?.config?.url || "");
        if (
          status === 401 &&
          !reqUrl.includes("/auth/login") &&
          sessionRef.current
        ) {
          localStorage.removeItem(STORAGE_KEY);
          sessionRef.current = null;
          setSession(null);
          delete axios.defaults.headers.common["Authorization"];
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(reqInterceptor);
      axios.interceptors.response.eject(resInterceptor);
    };
  }, []);

  // Auto-expire timer (1 hour session)
  useEffect(() => {
    if (!session) return;

    const remainingMs = session.expiresAt - Date.now();
    if (remainingMs <= 0) {
      clearSession(true);
      toast("Admin session expired (1 hour). Please login again if needed.", {
        icon: "⏰",
      });
      return;
    }

    const timer = window.setTimeout(() => {
      clearSession(true);
      toast("Admin session expired (1 hour). Switched back to Viewer mode.", {
        icon: "⏰",
      });
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [session, clearSession]);

  // Verify token with backend on initial mount if a stored session exists
  useEffect(() => {
    const initial = sessionRef.current;
    if (!initial) return;

    axios
      .get(AUTH_ME_API, {
        headers: { Authorization: `Bearer ${initial.token}` },
        timeout: 6000,
      })
      .catch((err) => {
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          clearSession(true);
        }
      });
  }, [clearSession]);

  const handleLogin = useCallback(
    async (
      username: string,
      password: string
    ): Promise<{ ok: boolean; message?: string }> => {
      try {
        const res = await axios.post(
          AUTH_LOGIN_API,
          { username, password },
          { timeout: 8000 }
        );

        if (res.data?.status === "OK" && res.data?.data?.token) {
          const { token, expiresAt, user } = res.data.data;
          const nextSession: StoredSession = {
            token,
            user,
            expiresAt: expiresAt || Date.now() + 60 * 60 * 1000,
          };

          localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
          axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
          sessionRef.current = nextSession;
          setSession(nextSession);
          setLoginModalOpen(false);

          toast.success(`Logged in as ${user.full_name || user.username} (Admin)`);

          const action = pendingActionRef.current;
          const resolver = pendingResolverRef.current;
          pendingActionRef.current = null;
          pendingResolverRef.current = null;

          resolver?.(true);
          if (action) {
            await action();
          }

          return { ok: true };
        }

        return {
          ok: false,
          message: res.data?.message || "Invalid username or password.",
        };
      } catch (err: any) {
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Unable to connect to authentication server.";
        return { ok: false, message: msg };
      }
    },
    []
  );

  const handleCloseModal = useCallback(() => {
    setLoginModalOpen(false);
    const resolver = pendingResolverRef.current;
    pendingActionRef.current = null;
    pendingResolverRef.current = null;
    resolver?.(false);
  }, []);

  const requireAdmin = useCallback(
    async (action?: () => void | Promise<void>): Promise<boolean> => {
      const current = sessionRef.current;
      if (
        current &&
        current.user?.role === "admin" &&
        current.expiresAt > Date.now()
      ) {
        if (action) {
          await action();
        }
        return true;
      }

      // Expired or not logged in -> clear stale session and open LoginModal
      if (current && current.expiresAt <= Date.now()) {
        clearSession(true);
      }

      return new Promise<boolean>((resolve) => {
        pendingActionRef.current = action || null;
        pendingResolverRef.current = resolve;
        setLoginModalOpen(true);
      });
    },
    [clearSession]
  );

  const openLoginModal = useCallback(() => {
    void requireAdmin();
  }, [requireAdmin]);

  const logout = useCallback(() => {
    clearSession(false);
  }, [clearSession]);

  const isAdmin = Boolean(
    session &&
      session.user?.role === "admin" &&
      session.expiresAt > Date.now()
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: isAdmin ? session?.user ?? null : null,
      isAdmin,
      expiresAt: isAdmin ? session?.expiresAt ?? null : null,
      openLoginModal,
      logout,
      requireAdmin,
    }),
    [isAdmin, session, openLoginModal, logout, requireAdmin]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <LoginModal
        isOpen={loginModalOpen}
        onClose={handleCloseModal}
        onLogin={handleLogin}
      />
    </AuthContext.Provider>
  );
};

export default AuthProvider;

