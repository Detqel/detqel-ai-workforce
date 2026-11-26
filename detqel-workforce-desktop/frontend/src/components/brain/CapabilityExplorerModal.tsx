"use client";
import React from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { BRAIN_CAPABILITIES, type BrainCapabilityItem } from "@/constants/brainConstants";
import { CAPABILITY_ICON_MAP } from "./brainIcons";
import { BrainModal } from "./panels/BrainModal";
interface CapabilityExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCapability: (capability: BrainCapabilityItem) => void;
}
export const CapabilityExplorerModal: React.FC<CapabilityExplorerModalProps> = ({
  isOpen,
  onClose,
  onOpenCapability,
}) => {
  if (!isOpen) return null;
  return (
    <BrainModal
      title="Business Brain Intelligence Capabilities"
      subtitle="Open any capability to see what it does and its recent activity."
      icon={Sparkles}
      onClose={onClose}
    >
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {BRAIN_CAPABILITIES.map((capability) => {
          const Icon = CAPABILITY_ICON_MAP[capability.icon];
          return (
            <button
              key={capability.id}
              type="button"
              onClick={() => {
                onClose();
                onOpenCapability(capability);
              }}
              className="group text-left rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#131c2d] hover:border-primary-border p-4 flex flex-col justify-between gap-3 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${capability.badgeClass}`}>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-primary transition-colors">
                      {capability.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{capability.subtitle}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{capability.description}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                Open
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>
    </BrainModal>
  );
};
