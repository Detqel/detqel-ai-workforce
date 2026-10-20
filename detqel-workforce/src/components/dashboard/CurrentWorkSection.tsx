import React from "react";
import { WorkspaceLink as Link } from "@/components/navigation/WorkspaceLink";
import { defaultPageId } from "@/lib/navigation";
import { Activity, ArrowRight, Inbox } from "lucide-react";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";

export const CurrentWorkSection: React.FC = () => {
  return (
    <div className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/60">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Current Work</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Your active investigations, predictions and automations.
            </p>
          </div>
        </div>
        <Link
          href={defaultPageId}
          className="text-xs font-semibold text-slate-500 dark:text-[#FFA500] hover:text-slate-900 dark:hover:text-[#FFA500] flex items-center gap-1 transition-colors"
        >
          <span>View all</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-[#151f32] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-[#FFA500]/80">
          <Inbox className="w-6 h-6" />
        </div>
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Nothing in progress yet
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
            Start an investigation, prediction, simulation or automation to put
            DETQEL to work for your business.
          </p>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <PrimaryButton
            value="Start a new mission"
            icon={<ArrowRight className="w-3.5 h-3.5" />}
          />
          <SecondaryButton
            value="Explore use cases"
          />
        </div>
      </div>
    </div>
  );
};
