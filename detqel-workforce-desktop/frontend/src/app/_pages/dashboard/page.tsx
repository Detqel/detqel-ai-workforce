"use client";

import { ACTIVITY_HEATMAP_DAYS, ACTIVITY_HEATMAP_ROWS, ACTIVITY_HEATMAP_PLACEHOLDER_DATES } from "@/constants/dashboardConstants";

import React from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  apiGetActivityHeatmap,
  type ActivityHeatmapResponse,
} from "@/lib/api";
import {
  DashboardHeroBanner,
  CapabilitiesGrid,
  BusinessSignalsSection,
  ActivityHeatmapSection,
  CurrentWorkSection,
  DecisionsSection,
  QuickStartSection,
} from "@/components/dashboard";

export default function DashboardOverviewPage() {
  const { user, currentWorkspace } = useWorkspace();
  const [isMounted, setIsMounted] = React.useState(false);
  const [heatmapData, setHeatmapData] = React.useState<ActivityHeatmapResponse | null>(null);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  React.useEffect(() => {
    if (!currentWorkspace?.id) return;
    let isCancelled = false;

    apiGetActivityHeatmap({
      workspaceId: currentWorkspace.id,
      userId: user?.id,
      days: ACTIVITY_HEATMAP_DAYS,
    }).then((data) => {
      if (!isCancelled && data) {
        setHeatmapData(data);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [currentWorkspace?.id, user?.id]);

  const userName = isMounted && user ? (user.name || user.username || "") : "";

  const displayDates = heatmapData?.milestoneDates || ACTIVITY_HEATMAP_PLACEHOLDER_DATES;

  return (
    <div className="w-full px-6 sm:px-8 xl:px-10 py-6 sm:py-8 space-y-6 select-none bg-slate-50/60 dark:bg-[#0e1422] text-slate-900 dark:text-slate-100 transition-colors">
      <DashboardHeroBanner userName={userName} />

      <CapabilitiesGrid />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BusinessSignalsSection />
        <ActivityHeatmapSection
          heatmapData={heatmapData}
          displayDates={displayDates}
          heatmapRows={ACTIVITY_HEATMAP_ROWS}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CurrentWorkSection />
        <DecisionsSection />
      </div>

      <QuickStartSection />
    </div>
  );
}
