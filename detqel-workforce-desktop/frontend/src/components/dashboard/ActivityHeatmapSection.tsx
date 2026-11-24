"use client";

import { useCallback, useState } from "react";
import { LayoutGrid, Loader2 } from "lucide-react";
import { apiGetActivityHeatmap } from "@/lib/api";
import { useDashboardResource } from "@/hooks/useDashboardResource";
import { ACTIVITY_HEATMAP_DAYS, ACTIVITY_HEATMAP_RANGES } from "@/constants/dashboardConstants";
import { SecondaryButton } from "@/components/ui/secondary-button";

const CELL_COLORS = [
  "bg-slate-100 border-slate-200 dark:bg-[#151f32] dark:border-slate-700",
  "bg-purple-200 border-purple-300 dark:bg-amber-950 dark:border-amber-800",
  "bg-purple-400 border-purple-500 dark:bg-amber-700 dark:border-amber-600",
  "bg-purple-600 border-purple-700 dark:bg-amber-500 dark:border-amber-400",
  "bg-purple-800 border-purple-900 dark:bg-amber-300 dark:border-amber-200",
];

export function ActivityHeatmapSection({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(ACTIVITY_HEATMAP_DAYS);
  const load = useCallback((signal: AbortSignal) => apiGetActivityHeatmap({ workspaceId, days, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, signal), [workspaceId, days]);
  return <ActivityRange key={`${workspaceId}:${days}`} load={load} days={days} onDays={setDays} />;
}

function ActivityRange({ load, days, onDays }: { load: (signal: AbortSignal) => ReturnType<typeof apiGetActivityHeatmap>; days: number; onDays: (days: number) => void }) {
  const { data, error, loading, reload } = useDashboardResource(load);
  return <section aria-labelledby="ai-activity-title" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#182234]">
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div className="flex min-w-0 items-center gap-2.5"><LayoutGrid className="h-4 w-4 shrink-0 text-primary" /><div className="min-w-0">
        <h2 id="ai-activity-title" className="text-sm font-bold">AI Activity</h2>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">Workspace activity over the last {days / 7} weeks{data ? ` ? ${data.totalActivities} recorded actions` : ""}</p>
      </div></div>
      <label className="shrink-0"><span className="sr-only">Activity date range</span><select value={days} onChange={event => onDays(Number(event.target.value))} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] outline-none focus:border-primary dark:border-slate-700 dark:bg-[#151f32]">{ACTIVITY_HEATMAP_RANGES.map(range => <option key={range} value={range}>Last {range / 7} weeks</option>)}</select></label>
    </div>
    {error && <div role="alert" className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"><p>{error}</p><SecondaryButton value="Try again" onClick={reload} /></div>}
    {loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading AI activity...</p> : data && <>
      <div className="overflow-x-auto pb-2 pt-5"><div className="min-w-[380px] space-y-2.5">{data.categories.map(category => <div key={category} className="flex items-center gap-3">
        <span className="w-24 shrink-0 truncate text-[11px] text-slate-600 dark:text-slate-400">{category}</span><div className="grid min-w-0 flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${data.days.length}, minmax(0, 1fr))` }}>{data.matrix[category].map(cell => <span key={cell.date} role="img" aria-label={`${category}, ${cell.formattedDate}: ${cell.count} actions`} title={`${cell.formattedDate}: ${cell.count} ${cell.count === 1 ? "action" : "actions"} (${category})`} className={`mx-auto aspect-square max-h-3.5 w-full max-w-3.5 rounded-[2px] border ${CELL_COLORS[cell.level]}`} />)}</div>
      </div>)}<div className="flex gap-3 pt-2"><span className="w-24 shrink-0" /><div className="flex flex-1 justify-between text-[10px] text-slate-500 dark:text-slate-400">{data.milestoneDates.map((date, index) => <span key={`${date}:${index}`}>{date}</span>)}</div></div></div></div>
      <div className="mt-3 flex items-center justify-end gap-1 text-[10px] text-slate-500 dark:text-slate-400"><span className="mr-1">Less</span>{CELL_COLORS.map(color => <span key={color} aria-hidden className={`h-2.5 w-2.5 rounded-[2px] border ${color}`} />)}<span className="ml-1">More</span></div>
      {data.totalActivities === 0 && <p role="status" className="mt-3 text-xs text-slate-500 dark:text-slate-400">No activity recorded in this period. Completed replies, investigations, documents and question responses appear here.</p>}
    </>}
  </section>;
}
