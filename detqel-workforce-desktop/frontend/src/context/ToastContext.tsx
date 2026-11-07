"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastContextType {
  showToast: (kind: ToastKind, text: string) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const AUTO_DISMISS_MS = 4000;

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Application-wide toast notifications. Status, success, and error messages surface here instead of modals so
 * feedback never blocks the user. Toasts auto-dismiss and can be dismissed manually. This replaces the
 * per-page toast state that was previously duplicated across feature pages.
 */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, text }]);
    timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
  }, [dismiss]);

  const success = useCallback((text: string) => showToast("success", text), [showToast]);
  const error = useCallback((text: string) => showToast("error", text), [showToast]);
  const info = useCallback((text: string) => showToast("info", text), [showToast]);

  useEffect(() => {
    const active = timers.current;
    return () => { active.forEach((timer) => clearTimeout(timer)); active.clear(); };
  }, []);

  // A stable value keeps consumers that depend on useToast() from re-running effects whenever a toast appears.
  const value = useMemo(() => ({ showToast, success, error, info }), [showToast, success, error, info]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-5 right-5 z-[60] flex flex-col gap-2.5 w-full max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastCard: React.FC<{ toast: Toast; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const icon =
    toast.kind === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
    : toast.kind === "error" ? <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
    : <Info className="w-4 h-4 text-blue-500 shrink-0" />;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 shadow-lg animate-in slide-in-from-right-4 fade-in duration-200"
    >
      {icon}
      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed flex-1 min-w-0 break-words">{toast.text}</p>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification" className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
