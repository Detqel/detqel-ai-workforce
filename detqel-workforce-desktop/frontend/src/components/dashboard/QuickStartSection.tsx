import { PAGE_FRAGMENTS } from "@/constants/navigationConstants";
import React from "react";
import { WorkspaceLink as Link } from "@/components/navigation/WorkspaceLink";
import { defaultPageId } from "@/lib/navigation";
import {
  Zap,
  ArrowRight,
  BarChart3,
  TrendingUp,
  Box,
} from "lucide-react";

export const QuickStartSection: React.FC = () => {
  return (
    <div className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 mb-5">
        <div className="flex items-center gap-2.5">
          <Zap className="w-4 h-4 text-amber-500" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Quick Start</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Get started with common tasks
            </p>
          </div>
        </div>
        <Link
          href={defaultPageId}
          className="text-xs font-semibold text-slate-500 dark:text-[#FFA500] hover:text-slate-900 dark:hover:text-[#FFA500] flex items-center gap-1 transition-colors"
        >
          <span>View all use cases</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href={`${defaultPageId}#${PAGE_FRAGMENTS.analyze}`}
          className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#151f32] border border-slate-200/90 dark:border-slate-800 hover:border-purple-300 dark:hover:border-[#FFA500]/50 hover:bg-white dark:hover:bg-[#1e2a40] transition-all cursor-pointer group flex items-center justify-between shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-[#FFA500]/15 text-[#8a2be2] dark:text-[#FFA500] flex items-center justify-center flex-shrink-0 border border-purple-100 dark:border-[#FFA500]/30">
              <BarChart3 className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-[#8a2be2] dark:group-hover:text-[#FFA500] transition-colors">
              Analyze recent performance
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors" />
        </Link>

        <Link
          href={`${defaultPageId}#${PAGE_FRAGMENTS.predict}`}
          className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#151f32] border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-600/50 hover:bg-white dark:hover:bg-[#1e2a40] transition-all cursor-pointer group flex items-center justify-between shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-100 dark:border-emerald-900/60">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              Predict next quarter demand
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors" />
        </Link>

        <Link
          href={`${defaultPageId}#${PAGE_FRAGMENTS.simulate}`}
          className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#151f32] border border-slate-200/90 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600/50 hover:bg-white dark:hover:bg-[#1e2a40] transition-all cursor-pointer group flex items-center justify-between shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 border border-blue-100 dark:border-blue-900/60">
              <Box className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Simulate a pricing change
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors" />
        </Link>

        <Link
          href={`${defaultPageId}#${PAGE_FRAGMENTS.automate}`}
          className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#151f32] border border-slate-200/90 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-600/50 hover:bg-white dark:hover:bg-[#1e2a40] transition-all cursor-pointer group flex items-center justify-between shadow-2xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-100 dark:border-amber-900/60">
              <Zap className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              Automate report generation
            </span>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-100 transition-colors" />
        </Link>
      </div>
    </div>
  );
};
