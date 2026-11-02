"use client";

import React from "react";
import { Check, CheckSquare, Square, UserPlus, Eye, Loader2, Sparkles, MessageSquare } from "lucide-react";
import { useNavigation } from "@/context/NavigationContext";
import { pageIds } from "@/lib/navigation";
import { setDiscussionTarget } from "@/lib/discussionStore";
import {
  type MarketplaceAgent,
  MARKETPLACE_ICON_MAP,
} from "@/constants/agentMarketplaceConstants";

interface AgentMarketplaceCardProps {
  agent: MarketplaceAgent;
  isRecruited: boolean;
  isSelected: boolean;
  isRecruiting: boolean;
  onToggleSelect: (agentId: string) => void;
  onRecruit: (agent: MarketplaceAgent) => void;
  onInspect: (agent: MarketplaceAgent) => void;
}

export const AgentMarketplaceCard: React.FC<AgentMarketplaceCardProps> = ({
  agent,
  isRecruited,
  isSelected,
  isRecruiting,
  onToggleSelect,
  onRecruit,
  onInspect,
}) => {
  const { navigate } = useNavigation();
  const IconComponent = MARKETPLACE_ICON_MAP[agent.iconName] ?? Sparkles;

  const categoryStyles: Record<
    string,
    { badge: string; iconBg: string; borderHover: string }
  > = {
    "Leadership & Orchestration": {
      badge: "bg-primary-muted text-primary border border-primary-border",
      iconBg: "bg-primary-muted text-primary border border-primary-border",
      borderHover: "hover:border-primary",
    },
    "Business Strategy & Planning": {
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800/60",
      iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400 border-blue-200/80 dark:border-blue-800/80",
      borderHover: "hover:border-blue-400/80 dark:hover:border-blue-500/60",
    },
    "Product Management": {
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
      iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/80",
      borderHover: "hover:border-amber-400/80 dark:hover:border-amber-500/60",
    },
    "Technology & Software Engineering": {
      badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60",
      iconBg: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/80 dark:text-cyan-400 border-cyan-200/80 dark:border-cyan-800/80",
      borderHover: "hover:border-cyan-400/80 dark:hover:border-cyan-500/60",
    },
    "Artificial Intelligence & Data Science": {
      badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300 border-violet-200 dark:border-violet-800/60",
      iconBg: "bg-violet-50 text-violet-600 dark:bg-violet-950/80 dark:text-violet-400 border-violet-200/80 dark:border-violet-800/80",
      borderHover: "hover:border-violet-400/80 dark:hover:border-violet-500/60",
    },
    "Sales & Revenue": {
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80",
      borderHover: "hover:border-emerald-400/80 dark:hover:border-emerald-500/60",
    },
    "Marketing & Branding": {
      badge: "bg-pink-100 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300 border-pink-200 dark:border-pink-800/60",
      iconBg: "bg-pink-50 text-pink-600 dark:bg-pink-950/80 dark:text-pink-400 border-pink-200/80 dark:border-pink-800/80",
      borderHover: "hover:border-pink-400/80 dark:hover:border-pink-500/60",
    },
    "Finance & Accounting": {
      badge: "bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200 dark:border-teal-800/60",
      iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/80 dark:text-teal-400 border-teal-200/80 dark:border-teal-800/80",
      borderHover: "hover:border-teal-400/80 dark:hover:border-teal-500/60",
    },
    "Human Resources & Recruitment": {
      badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60",
      iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-800/80",
      borderHover: "hover:border-indigo-400/80 dark:hover:border-indigo-500/60",
    },
    "Customer Success & Support": {
      badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
      iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-950/80 dark:text-sky-400 border-sky-200/80 dark:border-sky-800/80",
      borderHover: "hover:border-sky-400/80 dark:hover:border-sky-500/60",
    },
    "Operations & Administration": {
      badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
      iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700",
      borderHover: "hover:border-slate-400 dark:hover:border-slate-600",
    },
    "Legal, Compliance & Cybersecurity": {
      badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
      iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/80",
      borderHover: "hover:border-rose-400/80 dark:hover:border-rose-500/60",
    },
    "Research & Knowledge Management": {
      badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
      iconBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80",
      borderHover: "hover:border-emerald-400/80 dark:hover:border-emerald-500/60",
    },
  };

  const style = categoryStyles[agent.category] ?? categoryStyles["Leadership & Orchestration"];

  return (
    <div
      className={`group relative flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 shadow-xs ${
        isSelected
          ? "border-primary bg-primary-muted ring-1 ring-primary"
          : isRecruited
          ? "border-emerald-200/80 dark:border-emerald-900/40 bg-white/90 dark:bg-[#151f32]/90"
          : `border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-[#151f32] ${style.borderHover} hover:shadow-md`
      }`}
    >
      <div>
        {/* Top Header: Selection Checkbox & Badges */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            {!isRecruited ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(agent.id);
                }}
                className="flex items-center justify-center p-1 -m-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={isSelected ? `Deselect ${agent.name}` : `Select ${agent.name} for recruitment`}
              >
                {isSelected ? (
                  <CheckSquare className="w-5 h-5 text-primary" />
                ) : (
                  <Square className="w-5 h-5" />
                )}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                title="This agent is recruited in your workforce"
              >
                <Check className="w-3 h-3" />
                Active in Workforce
              </span>
            )}

            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${style.badge}`}
            >
              {agent.category}
            </span>
          </div>

          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700/60">
            {agent.tier}
          </span>
        </div>

        {/* Agent Profile & Icon */}
        <div className="flex items-start gap-3.5 mb-3.5">
          <div
            className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center border shadow-2xs transition-transform group-hover:scale-105 ${style.iconBg}`}
          >
            <IconComponent className="w-6 h-6" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                {agent.name}
              </h3>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {agent.role}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-600 dark:text-slate-300/90 leading-relaxed mb-4 line-clamp-2">
          {agent.description}
        </p>

        {/* Capabilities Pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {agent.capabilities.slice(0, 3).map((capability, index) => (
            <span
              key={index}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/70"
            >
              {capability}
            </span>
          ))}
          {agent.capabilities.length > 3 && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md text-slate-500 dark:text-slate-400">
              +{agent.capabilities.length - 3} more
            </span>
          )}
        </div>
      </div>

      {/* Footer Metrics & Actions */}
      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 mt-auto">
        <div className="min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 block">
            {agent.metrics.label}
          </span>
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
            {agent.metrics.value}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onInspect(agent)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/70 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
            title="View agent details and directives"
          >
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>View</span>
          </button>

          {!isRecruited ? (
            <button
              type="button"
              disabled={isRecruiting}
              onClick={() => onRecruit(agent)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-hover text-primary-fg font-bold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRecruiting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Recruiting...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Recruit</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/50 text-xs font-semibold">
                <Check className="w-3.5 h-3.5" />
                <span>Recruited</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setDiscussionTarget({
                    type: "agent",
                    id: agent.id,
                    name: agent.name,
                    role: agent.role,
                    avatarLetter: agent.name[0],
                  });
                  navigate(pageIds.discussions);
                }}
                className="p-1.5 rounded-lg text-primary hover:bg-primary-muted border border-primary-border transition-colors cursor-pointer"
                title="Initiate Discussion"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

