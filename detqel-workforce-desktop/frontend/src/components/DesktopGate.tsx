"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { backendStatus, inDesktop, type BackendStatus } from "@/lib/desktop";
import { DesktopStartupScreen } from "@/components/desktop/DesktopStartupScreen";

const subscribeEnvironment = () => () => {};
const browserSnapshot = () => !inDesktop();
const serverSnapshot = () => false;

export function DesktopGate({ children }: { children: ReactNode }) {
  const browserMode = useSyncExternalStore(subscribeEnvironment, browserSnapshot, serverSnapshot);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!inDesktop()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      try {
        const next = await backendStatus();
        if (!cancelled) {
          setStatus(next);
          setRuntimeError(null);
        }
      } catch {
        if (!cancelled) setRuntimeError("Unable to contact the desktop runtime. Restart DETQEL Workforce.");
      } finally {
        if (!cancelled) timer = setTimeout(() => { void check(); }, 1000);
      }
    };

    void check();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, []);

  if (browserMode || (status?.ready && !status.error && !runtimeError)) return children;
  return <DesktopStartupScreen status={status} runtimeError={runtimeError} />;
}
