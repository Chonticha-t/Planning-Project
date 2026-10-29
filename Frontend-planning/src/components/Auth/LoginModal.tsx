import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  ShieldCheck,
  X,
  User,
  Lock,
  Eye,
  EyeOff,
  LogIn,
  RefreshCw,
  AlertCircle,
  Clock,
} from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLogin,
}) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setUsername("");
      setPassword("");
      setShowPassword(false);
      setErrorMsg(null);
      setLoading(false);
      setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Capture Escape so it only closes LoginModal and not any modal underneath
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        if (!loading) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, loading, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMsg("Please enter both username and password.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const result = await onLogin(trimmedUser, password);
      if (!result.ok) {
        setErrorMsg(result.message || "Invalid username or password.");
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => {
              if (!loading) onClose();
            }}
          />

          {/* Dialog Card */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-modal-title"
            className="relative bg-base-100 text-base-content rounded-2xl sm:rounded-[22px] shadow-2xl w-full max-w-[400px] p-6 border border-base-300 flex flex-col transform-gpu"
            initial={{ opacity: 0, scale: 0.96, y: -16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -16 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <ShieldCheck size={22} strokeWidth={2.2} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2
                      id="login-modal-title"
                      className="text-[17px] font-bold text-base-content tracking-tight leading-tight"
                    >
                      Admin Login
                    </h2>
                    <span className="badge badge-primary badge-sm text-[10.5px] font-semibold">
                      Required
                    </span>
                  </div>
                  <p className="text-[12px] text-base-content/60 mt-0.5">
                    Sign in as Admin to edit rates or manage Due Dates.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="btn btn-circle btn-sm btn-ghost hover:bg-base-200 text-base-content/70 hover:text-base-content shrink-0"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {errorMsg && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-error/10 border border-error/30 text-error text-xs font-medium">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Username */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="planning-login-username"
                  className="text-[11px] font-bold text-base-content/60 tracking-wider uppercase"
                >
                  Username
                </label>
                <div className="relative flex items-center">
                  <User
                    size={16}
                    className="absolute left-3.5 text-base-content/45 pointer-events-none"
                  />
                  <input
                    id="planning-login-username"
                    ref={usernameInputRef}
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    disabled={loading}
                    placeholder="Enter admin username"
                    className="w-full rounded-xl border border-base-300 bg-base-200/50 focus:bg-base-100 focus:border-primary focus:ring-2 focus:ring-primary/20 pl-10 pr-3.5 py-2.5 text-[14px] font-medium text-base-content placeholder:text-base-content/35 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="planning-login-password"
                  className="text-[11px] font-bold text-base-content/60 tracking-wider uppercase"
                >
                  Password
                </label>
                <div className="relative flex items-center">
                  <Lock
                    size={16}
                    className="absolute left-3.5 text-base-content/45 pointer-events-none"
                  />
                  <input
                    id="planning-login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    disabled={loading}
                    placeholder="Enter password"
                    className="w-full rounded-xl border border-base-300 bg-base-200/50 focus:bg-base-100 focus:border-primary focus:ring-2 focus:ring-primary/20 pl-10 pr-10 py-2.5 text-[14px] font-medium text-base-content placeholder:text-base-content/35 focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 text-base-content/45 hover:text-base-content/80 p-1 cursor-pointer transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 mt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={onClose}
                  className="btn btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content flex-1 rounded-full text-[13px] font-semibold min-h-[42px] h-[42px] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary flex-1 rounded-full text-primary-content text-[13px] font-semibold min-h-[42px] h-[42px] shadow-sm gap-1.5 cursor-pointer"
                >
                  {loading ? (
                    <RefreshCw size={15} className="animate-spin" />
                  ) : (
                    <LogIn size={15} />
                  )}
                  <span>{loading ? "Signing in..." : "Login"}</span>
                </button>
              </div>

              {/* Session Info Footer */}
              <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-base-content/50">
                <Clock size={12} className="shrink-0" />
                <span>Admin session stays active for 1 hour</span>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default LoginModal;

