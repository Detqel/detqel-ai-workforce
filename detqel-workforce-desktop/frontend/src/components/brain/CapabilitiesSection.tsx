"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
import {
  BRAIN_CAPABILITIES,
  type BrainCapabilityItem,
} from "@/constants/brainConstants";
import { CAPABILITY_ICON_MAP } from "./brainIcons";

interface CapabilitiesSectionProps {
  activeCapabilityId?: string | null;
  onSelectCapability: (capability: BrainCapabilityItem) => void;
  onExploreAll: () => void;
}

export const CapabilitiesSection: React.FC<CapabilitiesSectionProps> = ({
  activeCapabilityId,
  onSelectCapability,
  onExploreAll,
}) => {
  return (
    <div className="flex-1 h-full p-3.5 sm:p-4 flex flex-col justify-between gap-2.5 bg-white dark:bg-[#182234]">
      {/* Compact section bar */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <h2
          id="intelligence-capabilities-title"
          className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
        >
          Intelligence &amp; Brain Toolbox
        </h2>

        <button
          type="button"
          onClick={onExploreAll}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-hover transition-colors cursor-pointer shrink-0 rounded-md px-1.5 py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
        >
          <span>Explore all</span>
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>

      {/* Compact horizontal capability tiles (items locked against individual edit/removal) */}
      <div className="grid grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4 gap-2 my-auto">
        {BRAIN_CAPABILITIES.map((capability) => {
          const Icon = CAPABILITY_ICON_MAP[capability.icon];
          const isActive = activeCapabilityId === capability.id;

          return (
            <button
              key={capability.id}
              type="button"
              onClick={() => onSelectCapability(capability)}
              className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-xl border text-left transition-all duration-150 cursor-pointer min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring ${
                isActive
                  ? "bg-primary-surface dark:bg-[#1c263b] border-primary shadow-2xs"
                  : "bg-slate-50/75 dark:bg-[#131c2d] border-slate-200/80 dark:border-slate-800 hover:border-primary-border hover:bg-primary-surface/60 dark:hover:bg-[#192438]"
              }`}
            >
              <span
                className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${capability.badgeClass}`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-primary transition-colors truncate">
                  {capability.title}
                </span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {capability.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
