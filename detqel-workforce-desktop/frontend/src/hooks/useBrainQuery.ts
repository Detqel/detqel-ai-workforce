"use client";

import { useCallback, useEffect, useState } from "react";

interface BrainQueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Loads data for a Business Brain panel. A null loader stays idle (for example without the needed access).
 * With pollMs the data refreshes on that interval, which keeps sync status live while a pipeline runs.
 * Changing the loader cancels the request still in flight.
 */
export function useBrainQuery<T>(load: ((signal: AbortSignal) => Promise<T>) | null, pollMs?: number) {
  const [state, setState] = useState<BrainQueryState<T>>({ data: null, error: null, loading: load !== null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    let timer: number | undefined;
    const run = async () => {
      try {
        const data = await load(controller.signal);
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({ ...current, error: error instanceof Error ? error.message : "Could not load this information.", loading: false }));
      }
      if (pollMs && !controller.signal.aborted) timer = window.setTimeout(run, pollMs);
    };
    void run();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [load, version, pollMs]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { ...state, reload };
}
export type BrainQueryResult<T> = BrainQueryState<T> & { reload: () => void };

/** useBrainQuery for a workspace-scoped API call. `loader` must be stable, such as a brainApi method. */
export function useWorkspaceQuery<T>(
  workspaceId: string | null,
  loader: (workspaceId: string, signal: AbortSignal) => Promise<T>,
  options: { enabled?: boolean; pollMs?: number } = {},
): BrainQueryResult<T> {
  const load = useCallback((signal: AbortSignal) => loader(workspaceId!, signal), [workspaceId, loader]);
  return useBrainQuery(workspaceId && options.enabled !== false ? load : null, options.pollMs);
}
