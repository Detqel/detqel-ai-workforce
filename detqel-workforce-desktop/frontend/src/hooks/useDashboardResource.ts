"use client";

import { useCallback, useEffect, useState } from "react";

/** Refresh visible dashboard data, cancel stale workspace requests, and retain explicit load errors. */
export function useDashboardResource<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    let running = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (running || !active) return;
      running = true;
      try {
        const data = await load(controller.signal);
        if (active) setState({ data, error: null });
      } catch (error) {
        if (active) setState(current => ({ ...current, error: error instanceof Error ? error.message : "Could not load dashboard data." }));
      } finally { running = false; }
    };
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onFocus, 30_000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { active = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [load, version]);
  // Stable, so callers can list it as a dependency without re-running their effects every render.
  const reload = useCallback(() => setVersion(value => value + 1), []);
  return { ...state, loading: state.data === null && state.error === null, reload };
}
