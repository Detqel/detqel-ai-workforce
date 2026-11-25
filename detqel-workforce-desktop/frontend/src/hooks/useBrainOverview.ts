"use client";

import { useCallback, useMemo } from "react";
import { placeholderBrainOverview, type BrainOverviewView, type BrainTimeframeId } from "@/constants/brainConstants";
import { brainApi } from "@/lib/api/brain";
import { pendingBrainOverview, toBrainOverviewView } from "@/lib/brain-view";
import { useDashboardResource } from "./useDashboardResource";

/** The Business Brain overview for the workspace and timeframe, refreshed on focus and every 30 seconds. */
export function useBrainOverview(workspaceId: string | null, timeframe: BrainTimeframeId): { view: BrainOverviewView; reload: () => void } {
  const load = useCallback(
    (signal: AbortSignal) => (workspaceId ? brainApi.overview(workspaceId, timeframe, signal) : Promise.resolve(null)),
    [workspaceId, timeframe],
  );
  const { data, error, reload } = useDashboardResource(load);
  const view = useMemo(() => {
    if (!workspaceId) return placeholderBrainOverview(timeframe);
    return data ? toBrainOverviewView(data) : pendingBrainOverview(error);
  }, [workspaceId, timeframe, data, error]);
  return { view, reload };
}
