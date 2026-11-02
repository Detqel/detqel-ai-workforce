"use client";

import React, { useEffect } from "react";
import {
  X,
  UserPlus,
  Check,
  Shield,
  Layers,
  Terminal,
  FileText,
  Loader2,
  Sparkles,
  MessageSquare,
} from "lucide-react";
import { useNavigation } from "@/context/NavigationContext";
import { pageIds } from "@/lib/navigation";
import { setDiscussionTarget } from "@/lib/discussionStore";
import {
  type MarketplaceAgent,
  MARKETPLACE_ICON_MAP,
} from "@/constants/agentMarketplaceConstants";

interface AgentDossierModalProps {
  agent: MarketplaceAgent | null;
  isOpen: boolean;
  isRecruited: boolean;
  isRecruiting: boolean;
  onClose: () => void;
  onRecruit: (agent: MarketplaceAgent) => void;
}

export const AgentDossierModal: React.FC<AgentDossierModalProps> = ({
  agent,
  isOpen,
  isRecruited,
  isRecruiting,
  onClose,
  onRecruit,
}) => {
  const { navigate } = useNavigation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !agent) return null;

  const IconComponent = MARKETPLACE_ICON_MAP[agent.iconName] ?? Sparkles;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white dark:bg-[#151f32] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#111927]/60">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-primary-muted text-primary border border-primary-border shadow-xs shrink-0">
              <IconComponent className="w-7 h-7" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="agent-details-title"
                  className="text-lg font-bold text-slate-900 dark:text-slate-100"
                >
                  {agent.name}
                </h2>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-muted text-primary border border-primary-border">
                  {agent.category}
                </span>
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-1">
                {agent.role} &bull; <span className="font-semibold text-slate-700 dark:text-slate-300">{agent.tier}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Indicator */}
          <div
            className={`flex items-center justify-between p-3.5 rounded-xl border ${
              isRecruited
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300"
                : "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRecruited ? "bg-emerald-500 animate-pulse" : "bg-primary"
                }`}
              />
              <span className="text-xs font-bold">
                {isRecruited ? "Active Specialist in Workforce" : "Available for Instant Deployment"}
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              {agent.metrics.label}: <strong className="text-slate-900 dark:text-slate-100">{agent.metrics.value}</strong>
            </span>
          </div>

          {/* Mission & Purpose */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <FileText className="w-4 h-4 text-primary" />
              <span>Mission & Operational Purpose</span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50/80 dark:bg-slate-800/30 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
              {agent.purpose}
            </p>
          </div>

          {/* Core Capabilities */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Layers className="w-4 h-4 text-primary" />
              <span>Core Capabilities & Toolsets</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {agent.capabilities.map((capability, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span>{capability}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Operational Directives / Instructions */}
          <div>
            <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Terminal className="w-4 h-4 text-primary" />
              <span>System Prompt & Directives</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-xs leading-relaxed border border-slate-800 shadow-inner">
              <p className="text-slate-400 mb-1.5">// Autonomous Execution Directives</p>
              <p className="whitespace-pre-wrap">{agent.instructions}</p>
            </div>
          </div>

          {/* Governance & Scope */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                <span>Scope & Permissions</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Read Access: <strong className="text-slate-800 dark:text-slate-200 capitalize">{agent.scope.readAccess}</strong>
              </p>
              {agent.scope.writeAccess && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Write Access: <strong className="text-slate-800 dark:text-slate-200 capitalize">{agent.scope.writeAccess}</strong>
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1">
                {agent.scope.domains.map((domain, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                    {domain}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                <span>Approval Governance</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Policy: <strong className="text-slate-800 dark:text-slate-200 capitalize">{agent.approvalPolicy.defaultPolicy.replace("_", " ")}</strong>
              </p>
              {agent.approvalPolicy.threshold && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Constraint: <span className="text-slate-700 dark:text-slate-300">{agent.approvalPolicy.threshold}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/70 dark:bg-[#111927]/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>

          {!isRecruited ? (
            <button
              type="button"
              disabled={isRecruiting}
              onClick={() => onRecruit(agent)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRecruiting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Recruiting to Workforce...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Recruit to Workforce</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-semibold text-xs border border-emerald-200 dark:border-emerald-800">
                <Check className="w-4 h-4" />
                <span>Active in Workforce</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setDiscussionTarget({
                    type: "agent",
                    id: agent.id,
                    name: agent.name,
                    role: agent.role,
                    avatarLetter: agent.name[0],
                  });
                  navigate(pageIds.discussions);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg font-bold text-xs transition-all shadow-xs cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Initiate Discussion</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

