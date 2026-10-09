import React from "react";
import Link from "next/link";
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
        href="/dashboard"
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-[#8a2be2] dark:text-[#c084fc] flex items-center justify-center flex-shrink-0 border border-purple-100 dark:border-purple-900/60">
            <Search className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-purple-100 group-hover:text-[#8a2be2] dark:group-hover:text-[#c084fc] transition-colors">
              Investigate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-purple-300/70 mt-0.5 leading-snug">
              Find root causes and opportunities
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-purple-400/60 group-hover:text-slate-900 dark:group-hover:text-purple-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>

      <Link
        href="/dashboard#predict"
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center flex-shrink-0 border border-emerald-100 dark:border-emerald-900/60">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-purple-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              Predict
            </div>
            <div className="text-[11px] text-slate-500 dark:text-purple-300/70 mt-0.5 leading-snug">
              Forecast outcomes with confidence
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-purple-400/60 group-hover:text-slate-900 dark:group-hover:text-purple-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>

      <Link
        href="/dashboard#simulate"
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 border border-blue-100 dark:border-blue-900/60">
            <Box className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-purple-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Simulate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-purple-300/70 mt-0.5 leading-snug">
              Test scenarios before you act
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-purple-400/60 group-hover:text-slate-900 dark:group-hover:text-purple-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>

      <Link
        href="/dashboard#automate"
        className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-600/50 rounded-2xl p-4.5 transition-all shadow-xs hover:shadow-md cursor-pointer group flex items-start justify-between"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center flex-shrink-0 border border-amber-100 dark:border-amber-900/60">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-purple-100 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              Automate
            </div>
            <div className="text-[11px] text-slate-500 dark:text-purple-300/70 mt-0.5 leading-snug">
              Turn insights into actions
            </div>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-slate-400 dark:text-purple-400/60 group-hover:text-slate-900 dark:group-hover:text-purple-100 transform transition-transform duration-300 ease-out group-hover:-rotate-[60deg] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 flex-shrink-0 mt-1 origin-center" />
      </Link>
    </div>
  );
};
