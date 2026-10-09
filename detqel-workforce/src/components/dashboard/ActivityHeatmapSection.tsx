"use client";

import React from "react";
import { LayoutGrid, ChevronDown } from "lucide-react";
import type { ActivityHeatmapResponse } from "@/lib/api";

interface ActivityHeatmapSectionProps {
  heatmapData: ActivityHeatmapResponse | null;
  displayDates: string[];
  heatmapRows: string[];
}

export const ActivityHeatmapSection: React.FC<ActivityHeatmapSectionProps> = ({
  heatmapData,
  displayDates,
  heatmapRows,
}) => {
  const totalDays = heatmapData?.days?.length || 42;
  const weeksCount = Math.max(1, Math.round(totalDays / 7));

  return (
    <div className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between min-w-0 overflow-hidden">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <LayoutGrid className="w-4 h-4 text-slate-500 dark:text-[#a855f7] shrink-0" />
            <div className="min-w-0 truncate">
              <h2 className="text-sm font-bold text-slate-900 dark:text-purple-100">
                AI Activity
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-purple-300/70 truncate">
                Activity across your business over the last {weeksCount} weeks
                {heatmapData?.totalActivities !== undefined
                  ? ` • ${heatmapData.totalActivities} tracked in database`
                  : ""}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-[#151f32] border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-purple-200 shrink-0">
            <span>Last {weeksCount} weeks</span>
            <ChevronDown className="w-3 h-3 text-slate-400 dark:text-purple-400/60" />
          </div>
        </div>

        {/* Heatmap Matrix */}
        <div className="pt-5 space-y-2.5">
          {heatmapRows.map((rowName) => {
            const cells =
              heatmapData?.matrix[rowName] ||
              Array.from({ length: totalDays }).map((_, i) => ({
                date: `day-${i}`,
                formattedDate: `Day ${i + 1}`,
                count: 0,
                level: 0,
              }));

            return (
              <div
                key={rowName}
                className="flex items-center gap-2 sm:gap-3 w-full min-w-0"
              >
                <span className="w-18 sm:w-20 text-[11px] font-medium text-slate-500 dark:text-purple-300/70 text-left shrink-0 truncate">
                  {rowName}
                </span>

                <div
                  className="flex-1 min-w-0 grid gap-[2px] sm:gap-[3px] items-center"
                  style={{
                    gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
                  }}
                >
                  {cells.map((cell, colIndex) => {
                    let cellColor =
                      "bg-slate-100 dark:bg-[#151f32] border-slate-200/70 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-[#1e2a40]";
                    if (cell.level === 1) {
                      cellColor =
                        "bg-[#8a2be2]/25 border-[#8a2be2]/40 hover:bg-[#8a2be2]/45";
                    } else if (cell.level === 2) {
                      cellColor =
                        "bg-[#8a2be2]/55 border-[#8a2be2]/75 hover:bg-[#8a2be2]/75 shadow-[0_0_6px_rgba(138,43,226,0.25)]";
                    } else if (cell.level === 3) {
                      cellColor =
                        "bg-[#8a2be2] border-purple-400 hover:bg-[#7823c9] shadow-[0_0_8px_rgba(138,43,226,0.4)]";
                    } else if (cell.level >= 4) {
                      cellColor =
                        "bg-emerald-500 border-emerald-400 hover:bg-emerald-600 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
                    }

                    return (
                      <div
                        key={cell.date || colIndex}
                        title={`${cell.formattedDate}: ${cell.count} ${
                          cell.count === 1 ? "activity" : "activities"
                        } (${rowName})`}
                        className={`aspect-square w-full max-w-[12px] sm:max-w-[14px] max-h-[12px] sm:max-h-[14px] mx-auto min-w-0 rounded-[2px] border transition-all hover:scale-125 hover:z-10 cursor-pointer ${cellColor}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Date Milestones strictly aligned to the columns */}
          <div className="flex items-center gap-2 sm:gap-3 pt-2 w-full min-w-0">
            <div className="w-18 sm:w-20 shrink-0" />
            <div className="flex-1 min-w-0 relative h-4 text-[10px] text-slate-400 font-medium select-none">
              {displayDates.length >= 5 ? (
                <>
                  <span className="absolute left-0 top-0 text-left">
                    {displayDates[0]}
                  </span>
                  <span className="absolute left-[25%] -translate-x-1/2 top-0 text-center">
                    {displayDates[1]}
                  </span>
                  <span className="absolute left-[50%] -translate-x-1/2 top-0 text-center">
                    {displayDates[2]}
                  </span>
                  <span className="absolute left-[75%] -translate-x-1/2 top-0 text-center">
                    {displayDates[3]}
                  </span>
                  <span className="absolute right-0 top-0 text-right">
                    {displayDates[4]}
                  </span>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  {displayDates.map((date) => (
                    <span key={date}>{date}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
