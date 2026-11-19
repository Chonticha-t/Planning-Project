import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Users } from "lucide-react";
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
  const otherEditors = editors.filter((e) => e.username !== username);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);

  const hasConflict = conflicts.length > 0;
  const hasOthers = otherEditors.length > 0;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <div ref={root} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="leveling-editors"
          onClick={() => setOpen((value) => !value)}
          title={
            !connected
              ? "Connecting to live editing status…"
              : hasConflict
              ? `Conflict: ${conflicts.map((e) => e.fullName).join(", ")} editing the same gate/date`
              : editors.length > 0
              ? `Currently editing: ${editors.map((e) => (e.username === username ? `${e.fullName} (you)` : e.fullName)).join(", ")}`
              : "Live presence connected · No one else is currently editing"
          }
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 font-semibold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-primary ${
            hasConflict
              ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              : hasOthers
              ? "border-indigo-200 bg-[#eef2ff] text-[#4f46e5] hover:bg-indigo-100/80"
              : "border-base-300 bg-base-100 text-base-content/75 hover:bg-base-200"
          }`}
        >
          {hasConflict ? (
            <AlertTriangle size={13} className="shrink-0 text-amber-600" />
          ) : (
            <Users size={13} className="shrink-0 opacity-75" />
          )}
          <span
            className={`size-1.5 rounded-full shrink-0 ${
              !connected
                ? "bg-amber-500 animate-pulse"
                : hasConflict
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
          />

          {!connected ? (
            <span className="text-amber-700">Connecting…</span>
          ) : hasConflict ? (
            <span className="max-w-44 truncate">
              Conflict ({conflicts.length})
            </span>
          ) : editors.length > 0 ? (
            <div className="flex items-center gap-1">
              <div className="flex -space-x-1">
                {editors.slice(0, 3).map((editor) => (
                  <span
                    key={editor.username}
                    className={`flex size-5 items-center justify-center rounded-full ring-1 ring-base-100 text-[9.5px] font-bold ${
                      editor.username === username
                        ? "bg-primary text-primary-content"
                        : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {(editor.fullName || editor.username).slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>
              {editors.length > 3 && (
                <span className="text-[10.5px] font-bold">+{editors.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-base-content/60">Live</span>
          )}
          <ChevronDown size={11} className="opacity-50 shrink-0" />
        </button>

        {open && (
          <div
            id="leveling-editors"
            className="absolute right-0 top-full z-[60] mt-1.5 max-h-80 w-80 max-w-[88vw] overflow-y-auto rounded-2xl border border-base-300 bg-base-100 p-3.5 shadow-xl text-base-content"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wide text-base-content/70">
                Active Editors ({editors.length})
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-base-content/55">
                <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
                {connected ? "Connected" : "Reconnecting…"}
              </span>
            </div>

            {!publishing && (
              <div role="status" className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800">
                Unable to send your editing status. Retrying…
              </div>
            )}

            {hasConflict && (
              <div role="status" className="mb-2.5 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11.5px] text-amber-900 leading-snug">
                <AlertTriangle size={14} className="shrink-0 text-amber-600 mt-0.5" />
                <span>
                  <strong>{conflicts.map((editor) => editor.fullName).join(", ")}</strong>{" "}
                  {conflicts.length === 1 ? "is" : "are"} editing the same gate/date as you. Check latest data before saving.
                </span>
              </div>
            )}

            {!connected ? (
              <p className="text-base-content/60 py-2">Editing status is unavailable. Reconnecting…</p>
            ) : !editors.length ? (
              <p className="text-base-content/60 py-2 text-[11.5px]">
                No one has unsaved changes right now. Users who are only viewing are not listed.
              </p>
            ) : (
              <div className="divide-y divide-base-200">
                {editors.map((editor) => (
                  <div key={editor.username} className="py-2 first:pt-1 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs">
                        {editor.fullName}{" "}
                        {editor.username === username && (
                          <span className="text-primary font-bold">(you)</span>
                        )}
                      </span>
                      <span className="text-[10.5px] text-base-content/45">
                        @{editor.username} · {editor.role === "admin" ? "Admin" : "Planner"}
                      </span>
                    </div>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {editor.scopes.map((scope) => (
                        <li
                          key={JSON.stringify(scope)}
                          className="rounded bg-base-200/80 px-1.5 py-0.5 text-[10.5px] font-medium text-base-content/75"
                        >
                          {describeScope(scope)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
