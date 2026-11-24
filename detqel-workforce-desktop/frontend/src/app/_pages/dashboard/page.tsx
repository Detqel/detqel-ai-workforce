"use client";

import { useWorkspace } from "@/context/WorkspaceContext";
import { DashboardHeroBanner, CapabilitiesGrid, BusinessSignalsSection, ActivityHeatmapSection, CurrentWorkSection, DecisionsSection } from "@/components/dashboard";

export default function DashboardOverviewPage() {
  const { user, currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  return <div className="w-full space-y-6 bg-slate-50/60 px-6 py-6 text-slate-900 transition-colors select-none sm:px-8 sm:py-8 xl:px-10 dark:bg-[#0e1422] dark:text-slate-100">
    <DashboardHeroBanner userName={user?.name || user?.username || ""} />
    <CapabilitiesGrid />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><BusinessSignalsSection />{workspaceId ? <ActivityHeatmapSection key={workspaceId} workspaceId={workspaceId} /> : <p role="status" className="p-6 text-xs text-slate-500">Select a workspace to view AI activity.</p>}</div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2"><CurrentWorkSection />{workspaceId && <DecisionsSection key={workspaceId} workspaceId={workspaceId} />}</div>
  </div>;
}
