"use client";

import React, { useState } from "react";
import {
  Users,
  Crown,
  Plus,
  Check,
  Sparkles,
  Shield,
  Layers,
  ChevronDown,
  ExternalLink,
  Clock,
  UserCheck,
  MessageSquare,
} from "lucide-react";
import type { AgentTeam, RecruitedAgent } from "@/lib/api";
import { useNavigation } from "@/context/NavigationContext";
import { pageIds } from "@/lib/navigation";
import { setDiscussionTarget } from "@/lib/discussionStore";

interface RecruitedAgentTeamCardProps {
  agent: RecruitedAgent;
  teams: AgentTeam[];
  isSelected: boolean;
  onToggleSelect: (agentId: string) => void;
  onAssignToTeam: (agent: RecruitedAgent, teamId: string) => void;
  onInspect: (agent: RecruitedAgent) => void;
}

export const RecruitedAgentTeamCard: React.FC<RecruitedAgentTeamCardProps> = ({
  agent,
  teams,
  isSelected,
  onToggleSelect,
  onAssignToTeam,
  onInspect,
}) => {
  const { navigate } = useNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const agentName = agent.customName || agent.template?.name || "Agent";
  const agentRole = agent.customRole || agent.template?.role || "Specialist";
  const sectionName = agent.template?.section?.name || "General Specialist";

  // Check which teams this agent belongs to
  const agentTeams = agent.teams || [];
  const isInAnyTeam = agentTeams.length > 0;

  // Format recruited date
  const recruitedDate = agent.recruitedAt
    ? new Date(agent.recruitedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div
      className={`group relative rounded-2xl border transition-all duration-200 flex flex-col justify-between p-4 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm ${
        isSelected
          ? "border-primary shadow-md ring-1 ring-primary"
          : "border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm"
      }`}
    >
      <div>
        {/* Top Header: Checkbox & Badges */}
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <label className="flex items-center gap-2 cursor-pointer select-none min-w-0 flex-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleSelect(agent.id)}
              className="h-4 w-4 shrink-0 rounded border-slate-300 text-primary accent-primary focus:ring-primary cursor-pointer"
            />
            <span
              title={sectionName}
              className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate"
            >
              {sectionName}
            </span>
          </label>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {Boolean(agent.isUserCreated || agent.template?.isUserCreated) && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-primary-muted text-primary border border-primary-border whitespace-nowrap shrink-0">
                <Sparkles className="h-2.5 w-2.5 shrink-0" />
                Custom
              </span>
            )}
            {isInAnyTeam ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary-muted text-primary border border-primary-border whitespace-nowrap shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                Deployed ({agentTeams.length})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60 whitespace-nowrap shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                Standby Pool
              </span>
            )}
          </div>
        </div>

        {/* Identity: Avatar + Name + Role */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-muted text-primary border border-primary-border font-bold text-base shadow-sm">
            {agentName[0]}
          </div>

          <div className="min-w-0 flex-1">
            <h4
              onClick={() => onInspect(agent)}
              className="font-bold text-sm text-slate-900 dark:text-slate-100 hover:text-primary cursor-pointer transition-colors truncate"
            >
              {agentName}
            </h4>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate mt-0.5">
              {agentRole}
            </div>

            {/* Recruited metadata */}
            <div className="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500 mt-1">
              <span className="inline-flex items-center gap-1">
                <UserCheck className="h-3 w-3 text-emerald-500" />
                Recruited
              </span>
              {recruitedDate && (
                <>
                  <span>•</span>
                  <span>{recruitedDate}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Squad Membership Tags */}
        {isInAnyTeam && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {agentTeams.map((t) => (
              <span
                key={t.teamId}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0"
              >
                <Users className="h-2.5 w-2.5 text-primary shrink-0" />
                <span className="truncate max-w-[120px]">{t.teamName}</span>
                {t.isLead && (
                  <Crown className="h-2.5 w-2.5 text-amber-500 fill-amber-400 shrink-0" />
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Card Actions Footer */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => onInspect(agent)}
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            View Profile
          </button>
          <button
            onClick={() => {
              setDiscussionTarget({
                type: "agent",
                id: agent.id,
                name: agentName,
                role: agentRole,
                avatarLetter: agentName[0],
              });
              navigate(pageIds.discussions);
            }}
            title="Initiate Direct Discussion"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:opacity-80 transition-opacity cursor-pointer whitespace-nowrap shrink-0"
          >
            <MessageSquare className="h-3 w-3" />
            <span>Chat</span>
          </button>
        </div>

        {/* Assign to Team Dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setIsMenuOpen((prev) => !prev)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary-muted text-primary border border-primary-border hover:opacity-85 transition-opacity cursor-pointer whitespace-nowrap"
          >
            <Plus className="h-3 w-3 shrink-0" />
            Assign Squad
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform ${
                isMenuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute right-0 bottom-full mb-1 z-40 w-48 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-1 text-xs">
                <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Select Squad
                </div>
                {teams.length === 0 ? (
                  <div className="px-2 py-2 text-[11px] text-slate-400 text-center">
                    No active squads. Form a squad above first.
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-0.5">
                    {teams.map((team) => {
                      const alreadyInTeam = agentTeams.some((at) => at.teamId === team.id);
                      return (
                        <button
                          key={team.id}
                          disabled={alreadyInTeam}
                          onClick={() => {
                            onAssignToTeam(agent, team.id);
                            setIsMenuOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                            alreadyInTeam
                              ? "opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800 text-slate-400"
                              : "hover:bg-primary-muted text-slate-700 dark:text-slate-200 cursor-pointer"
                          }`}
                        >
                          <span className="truncate">{team.name}</span>
                          {alreadyInTeam && <Check className="h-3 w-3 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

