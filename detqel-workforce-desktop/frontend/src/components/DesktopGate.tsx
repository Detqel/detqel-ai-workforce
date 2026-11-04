"use client";

import { DESKTOP_FRONTEND_READY_ERROR, DESKTOP_RUNTIME_CONTACT_ERROR, DESKTOP_STATUS_POLL_INTERVAL_MS } from "@/constants/desktopConstants";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { backendStatus, inDesktop, notifyFrontendReady, type BackendStatus } from "@/lib/desktop";
import { DesktopStartupScreen } from "@/components/desktop/DesktopStartupScreen";

const subscribeEnvironment = () => () => {};
const browserSnapshot = () => !inDesktop();
const serverSnapshot = () => false;

export function DesktopGate({ children }: { children: ReactNode }) {
  const browserMode = useSyncExternalStore(subscribeEnvironment, browserSnapshot, serverSnapshot);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const frontendReadySignal = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 -> DevTools
      if (e.key === "F12" || e.keyCode === 123) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C -> DevTools
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        ["i", "I", "j", "J", "c", "C"].includes(e.key)
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // Ctrl+U -> View Source
      if ((e.ctrlKey || e.metaKey) && ["u", "U"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      // F5, Ctrl+F5, Ctrl+R, Ctrl+Shift+R -> Reload/Refresh
      if (
        e.key === "F5" ||
        e.keyCode === 116 ||
        ((e.ctrlKey || e.metaKey) && ["r", "R"].includes(e.key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    window.addEventListener("contextmenu", handleContextMenu, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("contextmenu", handleContextMenu, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  useEffect(() => {
    if (!inDesktop()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastContactError: string | undefined;

    const reportFrontend = () => {
      if (frontendReadySignal.current !== null) return;
      frontendReadySignal.current = notifyFrontendReady().catch(error => {
        frontendReadySignal.current = null;
        console.error(DESKTOP_FRONTEND_READY_ERROR, error);
      });
    };
    // Hydration is independent of backend availability and backend status polling.
    reportFrontend();

    const check = async () => {
      try {
        reportFrontend();
        const next = await backendStatus();
        if (cancelled) return;
        lastContactError = undefined;
        if (!cancelled) {
          setStatus(next);
          setRuntimeError(null);
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (detail !== lastContactError) console.error(DESKTOP_RUNTIME_CONTACT_ERROR, error);
        lastContactError = detail;
        if (!cancelled) setRuntimeError(DESKTOP_RUNTIME_CONTACT_ERROR);
      } finally {
        if (!cancelled) timer = setTimeout(() => { void check(); }, DESKTOP_STATUS_POLL_INTERVAL_MS);
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  if (browserMode || (status?.ready && !status.error && !runtimeError)) return children;
  return <DesktopStartupScreen status={status} runtimeError={status?.error ? null : runtimeError} />;
}
