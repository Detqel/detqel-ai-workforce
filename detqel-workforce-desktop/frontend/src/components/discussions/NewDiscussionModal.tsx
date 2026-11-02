"use client";

import React, { useState } from "react";
import {
  X,
  Users,
  Bot,
  Search,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import type { AgentTeam, RecruitedAgent } from "@/lib/api";
import type { DiscussionTarget } from "@/lib/discussionStore";

interface NewDiscussionModalProps {
  isOpen: boolean;
  onClose: () => void;
  teams: AgentTeam[];
  agents: RecruitedAgent[];
  onSelectTarget: (target: DiscussionTarget) => void;
}

export const NewDiscussionModal: React.FC<NewDiscussionModalProps> = ({
  isOpen,
  onClose,
  teams,
  agents,
  onSelectTarget,
}) => {
  const [activeTab, setActiveTab] = useState<"teams" | "agents">("teams");
  const [search, setSearch] = useState("");

  if (!isOpen) return null;

  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.focus.toLowerCase().includes(search.toLowerCase())
  );

  const filteredAgents = agents.filter((a) => {
    const name = (a.customName || a.template?.name || "").toLowerCase();
    const role = (a.customRole || a.template?.role || "").toLowerCase();
    return name.includes(search.toLowerCase()) || role.includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Initiate New Discussion
              </h2>
              <p className="text-[11px] text-slate-400">
                Select an autonomous squad or recruited specialist
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Controls */}
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter squads and specialists..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-ring focus:border-primary transition-all"
            />
          </div>

          {/* Selector Tabs */}
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 text-xs font-semibold">
            <button
              onClick={() => setActiveTab("teams")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === "teams"
                  ? "bg-white dark:bg-slate-900 text-primary shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span>Autonomous Squads ({teams.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("agents")}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === "agents"
                  ? "bg-white dark:bg-slate-900 text-primary shadow-xs font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>Direct Specialists ({agents.length})</span>
            </button>
          </div>
        </div>

        {/* Modal List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {activeTab === "teams" ? (
            filteredTeams.length === 0 ? (
              <div className="text-center p-8 text-xs text-slate-400">
                No autonomous squads found.
              </div>
            ) : (
              filteredTeams.map((team) => (
                <div
                  key={team.id}
                  onClick={() => {
                    onSelectTarget({
                      type: "team",
                      id: team.id,
                      name: team.name,
                      focus: team.focus,
                      accentColor: team.accentColor,
                      memberCount: team.members.length,
                    });
                    onClose();
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-primary hover:bg-primary-muted/20 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg font-bold text-xs shadow-xs">
                      <Users className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {team.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {team.focus} • {team.members.length} Members Assembled
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-primary bg-primary-muted border border-primary-border shrink-0">
                    Collaborate
                  </span>
                </div>
              ))
            )
          ) : filteredAgents.length === 0 ? (
            <div className="text-center p-8 text-xs text-slate-400">
              No recruited agents found.
            </div>
          ) : (
            filteredAgents.map((agent) => {
              const name = agent.customName || agent.template?.name || "Specialist";
              const role = agent.customRole || agent.template?.role || "Agent Specialist";
              const letter = name[0].toUpperCase();

              return (
                <div
                  key={agent.id}
                  onClick={() => {
                    onSelectTarget({
                      type: "agent",
                      id: agent.id,
                      name,
                      role,
                      avatarLetter: letter,
                    });
                    onClose();
                  }}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-850 hover:border-primary hover:bg-primary-muted/20 transition-all cursor-pointer shadow-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs shadow-xs">
                      {letter}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {name}
                      </h4>
                      <span className="text-[10px] text-slate-400 block truncate">
                        {role}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 shrink-0">
                    Direct Chat
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

