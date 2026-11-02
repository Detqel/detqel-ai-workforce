"use client";

import React, { useRef, useEffect } from "react";
import {
  Search,
  Sparkles,
  Users,
  CheckCircle2,
  CheckSquare,
  Square,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  AGENT_SECTIONS,
  MARKETPLACE_ICON_MAP,
} from "@/constants/agentMarketplaceConstants";

interface MarketplaceHeaderProps {
  workspaceName?: string;
  totalAgentsCount: number;
  recruitedCount: number;
  availableCount: number;
  selectedTab: string;
  onSelectTab: (tabSlug: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCount: number;
  onToggleSelectAllTab: () => void;
  isAllTabSelected: boolean;
  availableInTabCount: number;
  sectionCounts: Record<string, number>;
}

export const MarketplaceHeader: React.FC<MarketplaceHeaderProps> = ({
  workspaceName,
  totalAgentsCount,
  recruitedCount,
  availableCount,
  selectedTab,
  onSelectTab,
  searchQuery,
  onSearchChange,
  selectedCount,
  onToggleSelectAllTab,
  isAllTabSelected,
  availableInTabCount,
  sectionCounts,
}) => {
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active tab into view when selectedTab changes
  useEffect(() => {
    if (!tabsContainerRef.current) return;
    const activeBtn = tabsContainerRef.current.querySelector<HTMLButtonElement>(
      `[data-tab="${selectedTab}"]`
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [selectedTab]);

  const handleScroll = (direction: "left" | "right") => {
    if (tabsContainerRef.current) {
      const scrollOffset = direction === "left" ? -280 : 280;
      tabsContainerRef.current.scrollBy({
        left: scrollOffset,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner with Stats */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200/90 dark:border-slate-800 bg-linear-to-br from-white via-slate-50 to-primary-muted dark:from-[#151f32] dark:via-[#111927] dark:to-primary-muted p-6 sm:p-8 shadow-xs">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary-muted text-primary border border-primary-border mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Autonomous Agent Marketplace</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Recruit Specialized AI Agents
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xl">
              Browse by enterprise section tabs. Recruit pre-trained executive leaders,
              domain managers, and technical specialists directly into {workspaceName ? <span className="font-semibold text-slate-800 dark:text-slate-200">{workspaceName}</span> : "your workspace"}.
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 shrink-0">
            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-[#182338]/80 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-xs font-medium">
                <Users className="w-3.5 h-3.5 text-[#8a2be2] dark:text-[#FFA500]" />
                <span>Total Catalog</span>
              </div>
              <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {totalAgentsCount}
              </div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400">13 Enterprise Tabs</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-[#182338]/80 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>In Workforce</span>
              </div>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {recruitedCount}
              </div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400">Active in workspace</div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/80 dark:bg-[#182338]/80 border border-slate-200/80 dark:border-slate-700/60 shadow-2xs col-span-2 sm:col-span-1">
              <div className="flex items-center gap-1.5 text-[#8a2be2] dark:text-[#FFA500] text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Available</span>
              </div>
              <div className="text-xl font-bold text-[#8a2be2] dark:text-[#FFA500] mt-1">
                {availableCount}
              </div>
              <div className="text-[10px] text-slate-600 dark:text-slate-400">Ready to recruit</div>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Box */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search agents in this tab by name, capability, or role..."
            className="w-full pl-10 pr-9 py-2 rounded-xl text-xs bg-white dark:bg-[#151f32] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-[#8a2be2] dark:focus:border-[#FFA500] focus:ring-1 focus:ring-[#8a2be2] dark:focus:ring-[#FFA500] transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Tab-Level Selection Actions */}
        <div className="flex items-center gap-2">
          {availableInTabCount > 0 && (
            <button
              type="button"
              onClick={onToggleSelectAllTab}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151f32] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              {isAllTabSelected ? (
                <>
                  <CheckSquare className="w-4 h-4 text-[#8a2be2] dark:text-[#FFA500]" />
                  <span>Deselect Tab</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 text-slate-400" />
                  <span>Select Tab Available ({availableInTabCount})</span>
                </>
              )}
            </button>
          )}

          {selectedCount > 0 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary-muted text-primary border border-primary-border">
              {selectedCount} selected
            </span>
          )}
        </div>
      </div>

      {/* Scrollable Tab Bar Design */}
      <div className="relative flex items-center rounded-2xl bg-slate-100/80 dark:bg-[#151f32]/90 border border-slate-200/90 dark:border-slate-800/90 p-1.5 shadow-2xs">
        {/* Left Scroll Chevron */}
        <button
          type="button"
          onClick={() => handleScroll("left")}
          className="shrink-0 p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all cursor-pointer mr-1"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Scrollable Tabs List */}
        <div
          ref={tabsContainerRef}
          role="tablist"
          aria-label="Enterprise Section Tabs"
          className="flex-1 flex items-center gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-0.5"
        >
          {AGENT_SECTIONS.map((sec) => {
            const count = sectionCounts[sec.name] ?? 0;
            const IconComponent = MARKETPLACE_ICON_MAP[sec.iconName] ?? Sparkles;
            const isSelected = selectedTab === sec.slug || selectedTab === sec.name;

            return (
              <button
                key={sec.slug}
                role="tab"
                data-tab={sec.slug}
                aria-selected={isSelected}
                onClick={() => onSelectTab(sec.slug)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-fg shadow-sm font-bold"
                    : "bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/70 dark:hover:bg-slate-800/60"
                }`}
              >
                <IconComponent className="w-3.5 h-3.5 shrink-0" />
                <span>{sec.name}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md transition-colors ${
                    isSelected
                      ? "bg-white/25 text-white dark:bg-black/25 dark:text-slate-950 font-extrabold"
                      : "bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Scroll Chevron */}
        <button
          type="button"
          onClick={() => handleScroll("right")}
          className="shrink-0 p-1.5 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-white/80 dark:hover:bg-slate-800/80 transition-all cursor-pointer ml-1"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
