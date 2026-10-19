import React from "react";
import { WorkspaceLink as Link } from "@/components/navigation/WorkspaceLink";
import { defaultPageId } from "@/lib/navigation";
import {
  Search,
  BarChart3,
  Box,
  Zap,
  ArrowRight,
} from "lucide-react";

export const CapabilitiesGrid: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Link
        href={defaultPageId}
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-[#FFA500]/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between text-left"
      >
        <div className="flex items-start gap-3.5 text-left">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-[#FFA500]/15 text-[#8a2be2] dark:text-[#FFA500] flex items-center justify-center flex-shrink-0 border border-purple-100 dark:border-[#FFA500]/30">
            <Search className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#8a2be2] dark:group-hover:text-[#FFA500] transition-colors text-left">
              Investigate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug text-left">
              Find root causes and opportunities
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>

      <Link
        href={`${defaultPageId}#predict`}
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between text-left"
      >
        <div className="flex items-start gap-3.5 text-left">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-100 dark:border-emerald-900/60">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors text-left">
              Predict
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug text-left">
              Forecast outcomes with confidence
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>

      <Link
        href={`${defaultPageId}#simulate`}
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between text-left"
      >
        <div className="flex items-start gap-3.5 text-left">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 border border-blue-100 dark:border-blue-900/60">
            <Box className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors text-left">
              Simulate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug text-left">
              Test scenarios before you act
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>

      <Link
        href={`${defaultPageId}#automate`}
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between text-left"
      >
        <div className="flex items-start gap-3.5 text-left">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-100 dark:border-amber-900/60">
            <Zap className="w-5 h-5" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors text-left">
              Automate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug text-left">
              Turn insights into actions
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>
    </div>
  );
};
