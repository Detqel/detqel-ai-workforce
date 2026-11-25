"use client";

import React, { useEffect } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import {
  BRAIN_CAPABILITIES,
  type BrainCapabilityItem,
} from "@/constants/brainConstants";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import { CAPABILITY_ICON_MAP } from "./brainIcons";

interface CapabilityExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunPrompt: (prompt: string, capability: BrainCapabilityItem) => void;
}

export const CapabilityExplorerModal: React.FC<CapabilityExplorerModalProps> = ({
  isOpen,
  onClose,
  onRunPrompt,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="capability-explorer-title"
        className="w-full max-w-3xl max-h-[85vh] bg-white dark:bg-[#182234] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary-muted text-primary border border-primary-border flex items-center justify-center shrink-0">
              <Sparkles className="w-4.5 h-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="capability-explorer-title"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                Business Brain Intelligence Capabilities
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Select any prompt to launch an analysis in the Business Brain Assistant.
              </p>
            </div>
          </div>

          <IconOnlyButton
            onClick={onClose}
            aria-label="Close capabilities explorer"
            className="rounded-lg shrink-0"
            icon={<X className="w-4 h-4" />}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {BRAIN_CAPABILITIES.map((capability) => {
            const Icon = CAPABILITY_ICON_MAP[capability.icon];

            return (
              <div
                key={capability.id}
                className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#131c2d] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${capability.badgeClass}`}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {capability.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {capability.subtitle}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {capability.description}
                  </p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-800">
                  {capability.samplePrompts.map((samplePrompt) => (
                    <button
                      key={samplePrompt}
                      type="button"
                      onClick={() => {
                        onRunPrompt(samplePrompt, capability);
                        onClose();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#182234] border border-slate-200/80 dark:border-slate-700/80 hover:border-primary text-left text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:text-primary transition-colors cursor-pointer group"
                    >
                      <span className="line-clamp-1">{samplePrompt}</span>
                      <ArrowRight className="w-3 h-3 shrink-0 text-slate-400 group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
