import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

export type ConfirmVariant = "save" | "edit" | "delete";

export interface ConfirmOptions {
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  from?: "top" | "bottom" | "left" | "right";
}

const VARIANTS: Record<ConfirmVariant, { button: string; title: string; confirmText: string }> = {
  save: {
    button: "btn-primary",
    title: "Save changes?",
    confirmText: "Save",
  },
  edit: {
    button: "btn-info",
    title: "Edit this record?",
    confirmText: "Edit",
  },
  delete: {
    button: "btn-error",
    title: "Are you absolutely sure?",
    confirmText: "Delete",
  },
};

const OFFSET = {
  top: { y: -40, x: 0 },
  bottom: { y: 40, x: 0 },
  left: { x: -40, y: 0 },
  right: { x: 40, y: 0 },
};

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Usage in any page: const confirm = useConfirm(); if (!(await confirm({ variant: "delete" }))) return;
export const useConfirm = () => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return ctx;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({});
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts = {}) => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setOpen(false);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  // Escape = Cancel (capture phase so Escape doesn't also close the modal behind it)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        close(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [open, close]);

  const variant = VARIANTS[options.variant ?? "save"];
  const offset = OFFSET[options.from ?? "top"];

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {createPortal(
        <AnimatePresence>
          {open && (
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
              <motion.div
                className="absolute inset-0 bg-black/30 backdrop-blur-xs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => close(false)}
              />
              <motion.div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                aria-describedby="confirm-dialog-description"
                className="relative w-full max-w-sm bg-base-100 text-base-content rounded-2xl shadow-2xl border border-base-300 overflow-hidden"
                initial={{ opacity: 0, scale: 0.95, ...offset }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, ...offset }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <div className="p-5">
                  <div className="min-w-0">
                    <h2 id="confirm-dialog-title" className="text-base font-semibold leading-tight">
                      {options.title ?? variant.title}
                    </h2>
                    {options.description && (
                      <div id="confirm-dialog-description" className="text-sm text-base-content/60 mt-1.5 text-pretty">
                        {options.description}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-base-200/50 border-t border-base-300 px-5 py-3.5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="btn btn-sm btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content rounded-full px-5 font-semibold"
                  >
                    {options.cancelText ?? "Cancel"}
                  </button>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => close(true)}
                    className={`btn btn-sm ${variant.button} rounded-full px-5 font-semibold`}
                  >
                    {options.confirmText ?? variant.confirmText}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </ConfirmContext.Provider>
  );
};

export default ConfirmProvider;
