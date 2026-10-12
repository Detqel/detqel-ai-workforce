import React from "react";
import { WorkspaceLink as Link } from "@/components/navigation/WorkspaceLink";
import { defaultPageId, pageIds } from "@/lib/navigation";
import { Activity, ArrowRight, Radio } from "lucide-react";

interface BusinessSignalsSectionProps {
  signals?: Array<{
    id: string;
    title: string;
    subtitle?: string;
    status?: string;
    type?: string;
  }>;
}

export const BusinessSignalsSection: React.FC<BusinessSignalsSectionProps> = ({
  signals = [],
}) => {
  const hasSignals = signals && signals.length > 0;

  return (
    <div className="bg-white dark:bg-[#182234] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between min-w-0">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/60">
              <Activity className="w-3.5 h-3.5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Business Signals
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Key updates and changes across your business.
              </p>
            </div>
          </div>
          <Link
            href={`${defaultPageId}#signals`}
            className="text-xs font-semibold text-slate-500 dark:text-[#FFA500] hover:text-slate-900 dark:hover:text-[#FFA500] flex items-center gap-1 transition-colors"
          >
            <span>View all signals</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {hasSignals ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-5">
            {signals.map((sig) => (
              <div
                key={sig.id}
                className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-[#151f32] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/60">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {sig.title}
                    </div>
                    {sig.subtitle && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        {sig.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                {sig.status && (
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {sig.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-[#151f32] border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-[#FFA500]/80">
              <Radio className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                No active business signals
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                Connect your business data sources to automatically stream operational
                signals, anomalies, and activity updates.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href={pageIds.connectors}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white dark:bg-[#151f32] hover:bg-slate-50 dark:hover:bg-[#1e2a40] text-slate-700 dark:text-slate-300 dark:hover:text-[#FFA500] border border-slate-200 dark:border-slate-700 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
              >
                <span>Connect</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-400" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
