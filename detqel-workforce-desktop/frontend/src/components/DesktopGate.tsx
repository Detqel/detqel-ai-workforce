"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { backendStatus, inDesktop, type BackendStatus } from "@/lib/desktop";

const subscribeEnvironment = () => () => {};
const browserSnapshot = () => !inDesktop();
const serverSnapshot = () => false;

export function DesktopGate({ children }: { children: ReactNode }) {
  const browserMode = useSyncExternalStore(subscribeEnvironment, browserSnapshot, serverSnapshot);
  const [status, setStatus] = useState<BackendStatus | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!inDesktop()) return;
    let cancelled = false;
    const check = async () => {
      try {
        const next = await backendStatus();
        if (!cancelled) { setStatus(next); setReady(next.ready); }
      } catch {
        if (!cancelled) setStatus({ ready: false, error: "Unable to contact the desktop runtime. Restart DETQEL Workforce.", configPath: "" });
      }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);
  if (browserMode || ready) return children;
  return (
    <main className="min-h-screen flex items-center justify-center p-10 bg-white dark:bg-slate-950">
      <div className="max-w-xl space-y-4" role="status" aria-live="polite">
        <h1 className="text-2xl font-semibold">DETQEL Workforce</h1>
        <p>{status?.error ?? "Starting your workspace…"}</p>
        {status?.error && status.configPath && <>
          <p>Check the database connection in this configuration file, then restart the app:</p>
          <code className="block break-all text-sm select-all">{status.configPath}</code>
          <p>PostgreSQL must be running with the current database migrations applied.</p>
        </>}
      </div>
    </main>
  );
}
