"use client";

import React from "react";
import { UserPlus, Loader2, X, Users } from "lucide-react";

interface MarketplaceBatchBarProps {
  selectedCount: number;
  isRecruiting: boolean;
  onRecruitBatch: () => void;
  onClearSelection: () => void;
}

export const MarketplaceBatchBar: React.FC<MarketplaceBatchBarProps> = ({
  selectedCount,
  isRecruiting,
  onRecruitBatch,
  onClearSelection,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/95 dark:bg-[#182338]/95 text-white border border-slate-700/80 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-primary text-primary-fg font-bold shrink-0 shadow-xs">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold">
              {selectedCount} {selectedCount === 1 ? "Agent" : "Agents"} Selected
            </div>
            <div className="text-[11px] text-slate-400">
              Ready to recruit into active workforce
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isRecruiting}
            onClick={onClearSelection}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>

          <button
            type="button"
            disabled={isRecruiting}
            onClick={onRecruitBatch}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isRecruiting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Recruiting ({selectedCount})...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Recruit Selected ({selectedCount})</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

