import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { conflictingEditors, describeScope, type EditingScope, type EditingUser } from "../utils/editingPresence";

interface Props {
  editors: EditingUser[];
  scopes: EditingScope[];
  username?: string;
  connected: boolean;
  publishing: boolean;
}

export function EditingPresence({ editors, scopes, username, connected, publishing }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const conflicts = connected ? conflictingEditors(editors, scopes, username) : [];
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);

  return <div className="flex min-h-8 flex-wrap items-center justify-between gap-2 rounded-lg border border-base-300 bg-base-100 px-2 text-xs">
    <div ref={root} className="relative">
      <button type="button" aria-expanded={open} aria-controls="leveling-editors" onClick={() => setOpen(value => !value)}
        className="flex items-center gap-2 rounded-lg px-1 py-1 text-base-content/75 hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-primary">
        <Users size={15} />
        <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
        <span className="max-w-64 truncate">{!connected ? "Connecting to editing status…" : editors.length
          ? `Editing: ${editors.slice(0, 2).map(editor => editor.username === username ? `${editor.fullName} (you)` : editor.fullName).join(", ")}${editors.length > 2 ? ` and ${editors.length - 2} more` : ""}`
          : "No one is currently editing"}</span>
        {connected && editors.slice(0, 3).map(editor => <span key={editor.username} title={`${editor.fullName} (@${editor.username})`}
          className="flex size-6 items-center justify-center rounded-full bg-blue-600/10 text-[10px] font-bold text-blue-700 dark:text-blue-300">{(editor.fullName || editor.username).slice(0, 2).toUpperCase()}</span>)}
        {connected && editors.length > 3 && <span>+{editors.length - 3}</span>}
      </button>
      {open && <div id="leveling-editors" className="absolute left-0 top-full z-[60] mt-2 max-h-80 w-80 max-w-[85vw] overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-3 shadow-xl">
        <div className="mb-2 font-bold">Currently editing</div>
        {!connected ? <p className="text-base-content/60">Editing status is unavailable. Reconnecting…</p> : !editors.length ? <p className="text-base-content/60">Users who are only viewing are not listed.</p> : editors.map(editor => <div key={editor.username} className="border-t border-base-200 py-2">
          <div className="font-semibold">{editor.fullName} {editor.username === username && <span className="text-blue-600">(you)</span>}</div>
          <div className="mt-0.5 text-[11px] text-base-content/50">@{editor.username} · {editor.role === "admin" ? "Admin" : "Planner"}</div>
          <ul className="mt-1 space-y-0.5 text-[11px] text-base-content/70">{editor.scopes.map(scope => <li key={JSON.stringify(scope)}>{describeScope(scope)}</li>)}</ul>
        </div>)}
      </div>}
    </div>
    {!publishing && <span role="status" className="text-amber-700 dark:text-amber-400">Unable to send editing status. Retrying…</span>}
    {conflicts.length > 0 && <div role="status" className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
      <AlertTriangle size={14} className="shrink-0" />
      <span>{conflicts.map(editor => editor.fullName).join(", ")} {conflicts.length === 1 ? "is" : "are"} editing the same gate/date as you. Check the latest data before saving.</span>
    </div>}
  </div>;
}
