"use client";

import React from "react";
import {
  Users,
  Crown,
  Plus,
  Trash2,
  Settings,
  MessageSquare,
  Eye,
} from "lucide-react";
import type { AgentTeam, RecruitedAgent } from "@/lib/api";
import { useNavigation } from "@/context/NavigationContext";
import { pageIds } from "@/lib/navigation";
import { setDiscussionTarget } from "@/lib/discussionStore";

interface SquadCardProps {
  team: AgentTeam;
  onAddMember: (team: AgentTeam) => void;
  onEditTeam: (team: AgentTeam) => void;
  onDeleteTeam: (team: AgentTeam) => void;
  onRemoveMember: (teamId: string, agentId: string) => void;
  onInspectAgent: (agent: RecruitedAgent) => void;
}

const ACCENT_STYLES: Record<
  string,
  {
    gradient: string;
    border: string;
    badge: string;
    text: string;
    glow: string;
    bgHover: string;
  }
> = {
  brand: {
    gradient: "from-primary to-primary-hover",
    border: "border-primary-border hover:border-primary",
    badge: "bg-primary-muted text-primary border border-primary-border",
    text: "text-primary",
    glow: "shadow-sm",
    bgHover: "hover:bg-primary-muted",
  },
  purple: {
    gradient: "from-purple-500 to-indigo-600",
    border: "border-purple-200 dark:border-purple-800/60 hover:border-purple-400 dark:hover:border-purple-500/80",
    badge: "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200/80 dark:border-purple-800/80",
    text: "text-purple-600 dark:text-purple-400",
    glow: "shadow-[0_8px_30px_rgb(147,51,234,0.08)] dark:shadow-[0_8px_30px_rgb(147,51,234,0.18)]",
    bgHover: "hover:bg-purple-500/5",
  },
  violet: {
    gradient: "from-violet-500 to-purple-600",
    border: "border-violet-200 dark:border-violet-800/60 hover:border-violet-400 dark:hover:border-violet-500/80",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300 border-violet-200/80 dark:border-violet-800/80",
    text: "text-violet-600 dark:text-violet-400",
    glow: "shadow-[0_8px_30px_rgb(139,92,246,0.08)] dark:shadow-[0_8px_30px_rgb(139,92,246,0.18)]",
    bgHover: "hover:bg-violet-500/5",
  },
  cyan: {
    gradient: "from-cyan-500 to-blue-600",
    border: "border-cyan-200 dark:border-cyan-800/60 hover:border-cyan-400 dark:hover:border-cyan-500/80",
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200/80 dark:border-cyan-800/80",
    text: "text-cyan-600 dark:text-cyan-400",
    glow: "shadow-[0_8px_30px_rgb(6,182,212,0.08)] dark:shadow-[0_8px_30px_rgb(6,182,212,0.18)]",
    bgHover: "hover:bg-cyan-500/5",
  },
  emerald: {
    gradient: "from-emerald-500 to-teal-600",
    border: "border-emerald-200 dark:border-emerald-800/60 hover:border-emerald-400 dark:hover:border-emerald-500/80",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/80",
    text: "text-emerald-600 dark:text-emerald-400",
    glow: "shadow-[0_8px_30px_rgb(16,185,129,0.08)] dark:shadow-[0_8px_30px_rgb(16,185,129,0.18)]",
    bgHover: "hover:bg-emerald-500/5",
  },
  amber: {
    gradient: "from-amber-500 to-orange-600",
    border: "border-amber-200 dark:border-amber-800/60 hover:border-amber-400 dark:hover:border-amber-500/80",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/80 dark:border-amber-800/80",
    text: "text-amber-600 dark:text-amber-400",
    glow: "shadow-[0_8px_30px_rgb(245,158,11,0.08)] dark:shadow-[0_8px_30px_rgb(245,158,11,0.18)]",
    bgHover: "hover:bg-amber-500/5",
  },
  rose: {
    gradient: "from-rose-500 to-pink-600",
    border: "border-rose-200 dark:border-rose-800/60 hover:border-rose-400 dark:hover:border-rose-500/80",
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200/80 dark:border-rose-800/80",
    text: "text-rose-600 dark:text-rose-400",
    glow: "shadow-[0_8px_30px_rgb(244,63,94,0.08)] dark:shadow-[0_8px_30px_rgb(244,63,94,0.18)]",
    bgHover: "hover:bg-rose-500/5",
  },
};

export const SquadCard: React.FC<SquadCardProps> = ({
  team,
  onAddMember,
  onEditTeam,
  onDeleteTeam,
  onRemoveMember,
  onInspectAgent,
}) => {
  const { navigate } = useNavigation();
  const accentKey = team.accentColor?.toLowerCase() === "purple" ? "brand" : (team.accentColor?.toLowerCase() || "brand");
  const styles = ACCENT_STYLES[accentKey] ?? ACCENT_STYLES.brand;

  const leadMember = team.members.find((m) => m.isLead) || team.lead || team.members[0];
  const otherMembers = team.members.filter((m) => m.id !== leadMember?.id);

  return (
    <div
      className={`group relative flex flex-col w-full sm:w-[325px] max-w-[340px] rounded-2xl border bg-white/90 backdrop-blur-md dark:bg-slate-900/90 transition-all duration-300 ${styles.border} ${styles.glow} overflow-hidden`}
    >
      {/* Top Holographic Accent Glow Line */}
      <div
        className={`h-1.5 w-full bg-gradient-to-r ${styles.gradient} transition-all duration-300 group-hover:h-2`}
      />

      <div className="p-3.5 flex flex-col gap-2.5">
        {/* Header: Identity & Status */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br ${styles.gradient} text-white shadow-sm`}
            >
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors">
                {team.name}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border whitespace-nowrap shrink-0 ${styles.badge}`}
                >
                  {team.focus}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions Dropdown / Trigger */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => {
                // View squad overview placeholder for future detail view
              }}
              title="View"
              aria-label="View squad details"
              className="p-1 rounded-md text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setDiscussionTarget({
                  type: "team",
                  id: team.id,
                  name: team.name,
                  focus: team.focus,
                  accentColor: team.accentColor,
                  memberCount: team.members.length,
                });
                navigate(pageIds.discussions);
              }}
              title="Initiate Squad Discussion"
              className="p-1 rounded-md text-slate-400 hover:text-primary hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onEditTeam(team)}
              title="Edit Squad Mandate"
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDeleteTeam(team)}
              title="Disband Squad"
              className="p-1 rounded-md text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Mission Objective / Mandate */}
        {team.missionObjective ? (
          <div className="rounded-lg border border-slate-200/60 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-800/40 p-2 text-[11px] text-slate-600 dark:text-slate-300">
            <p className="line-clamp-1 leading-relaxed italic">
              &ldquo;{team.missionObjective}&rdquo;
            </p>
          </div>
        ) : team.description ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
            {team.description}
          </p>
        ) : null}

        {/* Squad Members Avatars Row */}
        {team.members.length === 0 ? (
          <div
            onClick={() => onEditTeam(team)}
            className="cursor-pointer border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-2 text-center text-[11px] text-slate-400 hover:border-primary transition-colors"
          >
            No agents assigned yet.
          </div>
        ) : (
          <div className="flex items-center gap-1.5 pt-0.5">
            {/* Squad Lead Highlight Avatar Container */}
            {leadMember && (
              <div key={leadMember.id} className="group/agent relative shrink-0">
                <div
                  onClick={() => onInspectAgent(leadMember.agent)}
                  title={`${leadMember.agent.customName || leadMember.agent.template?.name} (Squad Lead) • ${leadMember.agent.customRole || leadMember.agent.template?.role}`}
                  className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white font-bold text-xs shadow-sm cursor-pointer hover:scale-105 hover:ring-2 hover:ring-amber-400/80 transition-all"
                >
                  {(leadMember.agent.customName || leadMember.agent.template?.name || "A")[0]}
                  <Crown className="absolute -top-1.5 -left-1.5 h-3.5 w-3.5 text-amber-500 fill-amber-400 drop-shadow-sm -rotate-12" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveMember(team.id, leadMember.agentId);
                  }}
                  title="Remove from squad"
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 items-center justify-center rounded-full bg-slate-900/90 hover:bg-red-500 text-white shadow-sm transition-all opacity-0 group-hover/agent:opacity-100 cursor-pointer hidden group-hover/agent:flex"
                >
                  <Plus className="h-2.5 w-2.5 rotate-45" />
                </button>
              </div>
            )}

            {/* Other Members (max 4 total characters: 3 if lead present, 4 if no lead) */}
            {otherMembers.slice(0, leadMember ? 3 : 4).map((member) => (
              <div key={member.id} className="group/agent relative shrink-0">
                <div
                  onClick={() => onInspectAgent(member.agent)}
                  title={`${member.agent.customName || member.agent.template?.name} • ${member.agent.customRole || member.agent.template?.role}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs shadow-sm cursor-pointer hover:scale-105 hover:border-primary hover:text-primary transition-all"
                >
                  {(member.agent.customName || member.agent.template?.name || "A")[0]}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveMember(team.id, member.agentId);
                  }}
                  title="Remove from squad"
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 items-center justify-center rounded-full bg-slate-900/90 hover:bg-red-500 text-white shadow-sm transition-all opacity-0 group-hover/agent:opacity-100 cursor-pointer hidden group-hover/agent:flex"
                >
                  <Plus className="h-2.5 w-2.5 rotate-45" />
                </button>
              </div>
            ))}

            {/* Show +N if more than 4 total members */}
            {team.members.length > 4 && (
              <div
                onClick={() => onEditTeam(team)}
                title={`${team.members.length - 4} more specialists assembled. Click to edit squad.`}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 dark:border-slate-700 bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold text-xs shadow-sm cursor-pointer hover:border-primary hover:text-primary hover:scale-105 transition-all"
              >
                +{team.members.length - 4}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

