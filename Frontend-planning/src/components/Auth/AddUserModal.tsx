import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { Eye, EyeOff, LoaderCircle, ShieldCheck, UserPlus, X } from "lucide-react";
import { getApiBaseUrl } from "@/utils/apiConfig";
import { useAuth } from "@/context/AuthContext";

interface Props { onClose: () => void }
type Fields = "username" | "full_name" | "password" | "confirm" | "role";

export default function AddUserModal({ onClose }: Props) {
  const { isAdmin } = useAuth();
  const [form, setForm] = useState({ username: "", full_name: "", password: "", confirm: "", role: "planner" });
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [message, setMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    usernameRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  useEffect(() => {
    if (!isAdmin) onClose();
  }, [isAdmin, onClose]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopImmediatePropagation();
        if (!busy.current) onClose();
      }
      if (event.key === "Tab") {
        const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
        if (!items?.length) return;
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onClose]);

  const update = (field: Fields, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setMessage("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || !isAdmin) return;
    const next: Partial<Record<Fields, string>> = {};
    if (!form.username.trim()) next.username = "Enter a username.";
    if (!form.full_name.trim()) next.full_name = "Enter a display name.";
    if (!form.password.trim()) next.password = "Enter a password.";
    if (form.password !== form.confirm) next.confirm = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    busy.current = true;
    setSaving(true);
    setMessage("");
    try {
      await axios.post(`${getApiBaseUrl()}/auth/users`, {
        username: form.username.trim(), full_name: form.full_name.trim(), password: form.password, role: form.role,
      }, { timeout: 15000 });
      toast.success(`User ${form.username.trim()} created successfully`);
      onClose();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrors(error.response?.data?.errors || {});
        setMessage(error.response?.data?.message || "Unable to confirm creation. Please check your connection before retrying.");
      } else setMessage("Unable to create user. Please try again.");
    } finally { busy.current = false; setSaving(false); }
  };

  const inputClass = "w-full rounded-xl border border-base-300 bg-base-200/40 px-3.5 py-2.5 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:opacity-60";

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/45 p-4" onMouseDown={event => {
      if (event.target === event.currentTarget && !busy.current) onClose();
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="add-user-title" className="w-full max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-2xl border border-base-300 bg-base-100 text-base-content shadow-2xl">
        <div className="flex items-start justify-between border-b border-base-200 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-600/10 p-2.5 text-blue-600"><UserPlus size={22} /></div>
            <div><h2 id="add-user-title" className="text-lg font-bold">Add User</h2><p className="mt-0.5 text-xs text-base-content/60">Create an account for your planning team.</p></div>
          </div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="Close add user" className="btn btn-sm btn-circle btn-ghost"><X size={18} /></button>
        </div>
        <form onSubmit={submit} noValidate className="space-y-4 px-6 py-5">
          {message && <p role="alert" className="rounded-xl border border-error/20 bg-error/10 p-3 text-xs text-error">{message}</p>}
          {([['username', 'Username'], ['full_name', 'Display name'], ['password', 'Password'], ['confirm', 'Confirm password']] as const).map(([field, label]) => (
            <div key={field}>
              <label htmlFor={`new-user-${field}`} className="mb-1.5 block text-xs font-semibold">{label}</label>
              <div className="relative">
                <input id={`new-user-${field}`} ref={field === "username" ? usernameRef : undefined} value={form[field]} onChange={event => update(field, event.target.value)} disabled={saving}
                  type={field === "password" || field === "confirm" ? showPassword ? "text" : "password" : "text"}
                  autoComplete={field === "password" || field === "confirm" ? "new-password" : "off"}
                  maxLength={field === "username" ? 50 : field === "full_name" ? 100 : undefined}
                  aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `new-user-${field}-error` : undefined}
                  className={`${inputClass} ${field === "password" ? "pr-12" : ""}`} />
                {field === "password" && <button type="button" disabled={saving} aria-label={showPassword ? "Hide passwords" : "Show passwords"} onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-3 text-base-content/50">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>}
              </div>
              {errors[field] && <p id={`new-user-${field}-error`} role="alert" className="mt-1 text-xs text-error">{errors[field]}</p>}
            </div>
          ))}
          <div>
            <label htmlFor="new-user-role" className="mb-1.5 block text-xs font-semibold">Role</label>
            <select id="new-user-role" disabled={saving} value={form.role} onChange={event => update("role", event.target.value)} className={inputClass} aria-invalid={Boolean(errors.role)}>
              <option value="planner">Planner</option><option value="admin">Admin</option>
            </select>
            {errors.role && <p role="alert" className="mt-1 text-xs text-error">{errors.role}</p>}
          </div>
          <div className="flex gap-2.5 rounded-xl bg-blue-600/5 p-3 text-xs text-base-content/70">
            <ShieldCheck size={17} className="shrink-0 text-blue-600" />
            <p>{form.role === "admin" ? "Full planning access, plus permission to create users." : "Full planning access: edit and save planning data. Cannot create users."}</p>
          </div>
          <div className="flex justify-end gap-2 border-t border-base-200 pt-4">
            <button type="button" disabled={saving} onClick={onClose} className="btn btn-ghost rounded-full">Cancel</button>
            <button type="submit" disabled={saving} className="btn rounded-full border-[#1e40af] bg-[#1e40af] text-white hover:bg-[#1e3a8a]">{saving ? <LoaderCircle size={16} className="animate-spin" /> : <UserPlus size={16} />}{saving ? "Creating..." : "Create User"}</button>
          </div>
        </form>
      </div>
    </div>, document.body,
  );
}
