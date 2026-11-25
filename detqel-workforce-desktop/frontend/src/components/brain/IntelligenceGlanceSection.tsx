"use client";

import React from "react";
import { ArrowUpRight } from "lucide-react";
import type { BrainTelemetrySegment } from "@/constants/brainConstants";
import { TELEMETRY_ICON_MAP, TELEMETRY_TONE_BADGE_CLASS } from "./brainIcons";

interface IntelligenceGlanceSectionProps {
  segments: BrainTelemetrySegment[];
  onSelectTelemetry: (segment: BrainTelemetrySegment) => void;
}

export const IntelligenceGlanceSection: React.FC<IntelligenceGlanceSectionProps> = ({
  segments,
  onSelectTelemetry,
}) => {
  return (
    <div className="flex-1 h-full bg-slate-200/80 dark:bg-slate-800 grid grid-cols-1 @xs:grid-cols-2 @xl:grid-cols-4 gap-px">
      {segments.map((segment) => {
        const Icon = TELEMETRY_ICON_MAP[segment.icon];
        const badgeClass = TELEMETRY_TONE_BADGE_CLASS[segment.tone];

        return (
          <button
            key={segment.id}
            type="button"
            onClick={() => onSelectTelemetry(segment)}
            className="group bg-slate-50/75 dark:bg-[#131c2d] hover:bg-primary-surface/70 dark:hover:bg-[#192438] p-3 text-left transition-colors cursor-pointer flex flex-col justify-between gap-1.5 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-ring"
          >
            <div className="flex items-center justify-between gap-1.5 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${badgeClass}`}
                >
                  <Icon className="w-3 h-3" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 truncate">
                  {segment.label}
                </span>
              </div>
              <ArrowUpRight
                className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 group-hover:text-primary transition-opacity shrink-0"
                aria-hidden="true"
              />
            </div>

            <div className="flex items-baseline justify-between gap-2 min-w-0">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-base sm:text-lg font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100 leading-none">
                  {segment.value}
                </span>
                <span
                  className={`text-[10px] font-semibold tabular-nums shrink-0 ${
                    segment.delta.startsWith("-")
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  }`}
                >
                  {segment.delta}
                </span>
              </div>
              {segment.badge && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-white dark:bg-[#182234] border border-slate-200/80 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 shrink-0">
                  {segment.badge}
                </span>
              )}
            </div>

            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {segment.detail}
            </div>
          </button>
        );
      })}
    </div>
  );
};
