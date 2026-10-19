"use client";

import React from "react";
import Image from "next/image";

interface DashboardHeroBannerProps {
  userName?: string;
}

export const DashboardHeroBanner: React.FC<DashboardHeroBannerProps> = ({
  userName = "",
}) => {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 xl:gap-8 pb-1">
      <div className="space-y-2 flex-1 max-w-2xl xl:max-w-3xl">
        <span
          suppressHydrationWarning
          className="text-xs font-semibold text-slate-500 dark:text-slate-400"
        >
          Good morning{userName ? `, ${userName}` : ""}
        </span>
        <h1 className="text-2xl sm:text-3xl lg:text-[34px] font-extrabold tracking-tight leading-tight flex flex-wrap items-center gap-x-2.5 sm:gap-x-3.5 gap-y-1.5 select-none">
          <span className="text-slate-900 dark:text-slate-100 hover:brightness-110 transition-colors">
            INTELLIGENCE
          </span>

          <span className="inline-flex items-center gap-2.5 sm:gap-3.5">
            <span
              className="relative flex h-2 sm:h-2.5 w-2 sm:w-2.5 items-center justify-center"
              aria-hidden="true"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8a2be2] dark:bg-[#FFA500] opacity-50 duration-1000" />
              <span className="relative inline-flex rounded-full h-1.5 sm:h-2 w-1.5 sm:w-2 bg-[#8a2be2] dark:bg-[#FFA500] shadow-[0_0_8px_rgba(138,43,226,0.6)] dark:shadow-[0_0_8px_rgba(255,165,0,0.6)]" />
            </span>
            <span className="text-[#8a2be2] dark:text-[#FFA500] hover:brightness-110 transition-all drop-shadow-[0_1px_6px_rgba(138,43,226,0.25)] dark:drop-shadow-[0_1px_6px_rgba(255,165,0,0.25)]">
              COMMAND
            </span>
          </span>

          <span className="inline-flex items-center gap-2.5 sm:gap-3.5">
            <span
              className="relative flex h-2 sm:h-2.5 w-2 sm:w-2.5 items-center justify-center"
              aria-hidden="true"
            >
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00503D] opacity-50 duration-1000" />
              <span className="relative inline-flex rounded-full h-1.5 sm:h-2 w-1.5 sm:w-2 bg-[#00503D] shadow-[0_0_8px_rgba(0,80,61,0.6)]" />
            </span>
            <span className="text-[#0A3C30] hover:brightness-110 transition-all drop-shadow-[0_1px_6px_rgba(0,80,61,0.25)]">
              MOTION
            </span>
          </span>
        </h1>
      </div>

      <div className="flex-shrink-0 w-full sm:w-auto flex justify-start lg:justify-end">
        <div className="flex items-center gap-3.5 sm:gap-4 p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200/90 dark:border-slate-800/80 hover:border-purple-300 dark:hover:border-[#FFA500]/60 shadow-xs hover:shadow-md transition-all cursor-pointer w-full sm:w-[400px] md:w-[420px]">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 flex items-center justify-center">
            <Image
              src="/images/detqel-workforce-agent-logo.png"
              alt="VYRA AI Assistant"
              width={220}
              height={220}
              priority
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex-1 min-w-0 pr-1">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Need a hand? Ask VYRA.
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-1">
              VYRA can help with questions, guidance, and day-to-day assistance
              across your workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
