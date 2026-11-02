"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Users,
  Crown,
  Sparkles,
  Search,
  Check,
  Loader2,
  Shield,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  apiCreateTeam,
  apiUpdateTeam,
  type AgentTeam,
  type CreateTeamPayload,
  type RecruitedAgent,
} from "@/lib/api";

interface CreateSquadModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId?: string;
  recruitedAgents: RecruitedAgent[];
  onTeamCreated: (team: AgentTeam) => void;
  initialSelectedAgentIds?: string[];
  editingTeam?: AgentTeam | null;
}

const FOCUS_PRESETS = [
  "Executive & Orchestration",
  "Technology & Software Engineering",
  "Artificial Intelligence & Data Science",
  "Product Management",
  "Business Strategy & Planning",
  "Marketing & Branding",
  "Sales & Revenue",
  "Finance & Accounting",
  "Cross-Functional Squad",
];

const ACCENT_COLORS = [
  { id: "brand", label: "Theme Primary", bg: "bg-primary", border: "border-primary" },
  { id: "cyan", label: "Oceanic Cyan", bg: "bg-cyan-500", border: "border-cyan-500" },
  { id: "emerald", label: "Hyper Emerald", bg: "bg-emerald-500", border: "border-emerald-500" },
  { id: "amber", label: "Solar Amber", bg: "bg-amber-500", border: "border-amber-500" },
  { id: "rose", label: "Crimson Rose", bg: "bg-rose-500", border: "border-rose-500" },
  { id: "violet", label: "Deep Violet", bg: "bg-violet-500", border: "border-violet-500" },
];

export const CreateSquadModal: React.FC<CreateSquadModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  userId,
  recruitedAgents,
  onTeamCreated,
  initialSelectedAgentIds = [],
  editingTeam = null,
}) => {
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("Cross-Functional Squad");
  const [accentColor, setAccentColor] = useState("brand");
  const [missionObjective, setMissionObjective] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [leadAgentId, setLeadAgentId] = useState<string | null>(null);
  const [searchAgent, setSearchAgent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial state when modal opens or editingTeam changes
  useEffect(() => {
    if (editingTeam) {
      setName(editingTeam.name);
      setFocus(editingTeam.focus);
      setAccentColor(editingTeam.accentColor || "brand");
      setMissionObjective(editingTeam.missionObjective || "");
      setDescription(editingTeam.description || "");
      const memberIds = new Set(editingTeam.members.map((m) => m.agentId));
      setSelectedAgentIds(memberIds);
      const lead = editingTeam.members.find((m) => m.isLead);
      setLeadAgentId(lead?.agentId || null);
    } else {
      setName("");
      setFocus("Cross-Functional Squad");
      setAccentColor("brand");
      setMissionObjective("");
      setDescription("");
      const initialSet = new Set(initialSelectedAgentIds);
      setSelectedAgentIds(initialSet);
      setLeadAgentId(initialSelectedAgentIds[0] || null);
    }
    setError(null);
  }, [editingTeam, initialSelectedAgentIds, isOpen]);

  // Filtered recruited agents for member picker
  const filteredAgents = useMemo(() => {
    const query = searchAgent.trim().toLowerCase();
    if (!query) return recruitedAgents;
    return recruitedAgents.filter((a) => {
      const agentName = (a.customName || a.template?.name || "").toLowerCase();
      const role = (a.customRole || a.template?.role || "").toLowerCase();
      return agentName.includes(query) || role.includes(query);
    });
  }, [recruitedAgents, searchAgent]);

  if (!isOpen) return null;

  const toggleAgentSelection = (agentId: string) => {
    setError(null);
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
        if (leadAgentId === agentId) {
          // If we removed the lead, pick the next available selected agent as lead
          const remaining = Array.from(next);
          setLeadAgentId(remaining.length > 0 ? remaining[0] : null);
        }
      } else {
        next.add(agentId);
        if (!leadAgentId) {
          setLeadAgentId(agentId);
        }
      }
      return next;
    });
  };

  const setAsLead = (agentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedAgentIds.has(agentId)) {
      setSelectedAgentIds((prev) => new Set(prev).add(agentId));
    }
    setLeadAgentId(agentId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a name for this team / squad.");
      return;
    }
    if (!workspaceId) {
      setError("Workspace is not selected.");
      return;
    }
    if (!editingTeam && selectedAgentIds.size < 2) {
      setError("Requires minimum 2 agents in a team to work.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingTeam) {
        const updated = await apiUpdateTeam(editingTeam.id, workspaceId, {
          name: name.trim(),
          focus,
          accentColor,
          missionObjective: missionObjective.trim() || undefined,
          description: description.trim() || undefined,
        });
        onTeamCreated(updated);
      } else {
        const payload: CreateTeamPayload = {
          workspaceId,
          name: name.trim(),
          focus,
          accentColor,
          missionObjective: missionObjective.trim() || undefined,
          description: description.trim() || undefined,
          memberAgentIds: Array.from(selectedAgentIds),
          leadAgentId: leadAgentId || undefined,
          userId,
        };
        const created = await apiCreateTeam(payload);
        onTeamCreated(created);
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to synthesize team.";
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-md">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingTeam ? "Configure Squad Mandate" : "Synthesize Autonomous AI Squad"}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Group recruited agents into an aligned collaborative unit with designated leadership.
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Squad Name & Palette */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Squad Name <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Core Engineering Swarm, Growth Pod, Executive Council"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Theme Glow
              </label>
              <div className="flex items-center gap-1.5 pt-1">
                {ACCENT_COLORS.map((col) => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setAccentColor(col.id)}
                    title={col.label}
                    className={`h-7 w-7 rounded-full ${col.bg} transition-all flex items-center justify-center cursor-pointer ${
                      accentColor === col.id
                        ? "ring-2 ring-offset-2 ring-primary dark:ring-offset-slate-900 scale-110"
                        : "opacity-70 hover:opacity-100"
                    }`}
                  >
                    {accentColor === col.id && <Check className="h-3.5 w-3.5 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Focus Domain Presets */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Domain / Focus Mandate
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FOCUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setFocus(preset)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    focus === preset
                      ? "bg-primary text-primary-fg border-primary shadow-sm"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-primary-border"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Mission Objective */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
              <span>Operating Mandate / Mission Directive</span>
              <span className="text-[10px] text-slate-400 font-normal">Optional</span>
            </label>
            <textarea
              value={missionObjective}
              onChange={(e) => setMissionObjective(e.target.value)}
              rows={2}
              placeholder="Define this squad's core responsibilities and high-level autonomous directives..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all"
            />
          </div>

          {/* Member Selection Matrix */}
          <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Assemble Members ({selectedAgentIds.size} Selected)
              </label>
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchAgent}
                  onChange={(e) => setSearchAgent(e.target.value)}
                  placeholder="Filter recruited..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary-ring"
                />
              </div>
            </div>

            {recruitedAgents.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                You have not recruited any agents yet. Visit the Recruit tab to recruit specialists into your workforce first.
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center text-xs text-slate-400">
                No matching recruited agents found.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                {filteredAgents.map((agent) => {
                  const agentName = agent.customName || agent.template?.name || "Agent";
                  const agentRole = agent.customRole || agent.template?.role || "Specialist";
                  const isSelected = selectedAgentIds.has(agent.id);
                  const isLead = leadAgentId === agent.id;

                  return (
                    <div
                      key={agent.id}
                      onClick={() => toggleAgentSelection(agent.id)}
                      className={`cursor-pointer rounded-xl border p-2.5 transition-all flex items-center justify-between ${
                        isSelected
                          ? "border-primary bg-primary-muted shadow-sm"
                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-bold text-xs ${
                            isSelected
                              ? "bg-primary text-primary-fg"
                              : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {agentName[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {agentName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {agentRole}
                          </div>
                        </div>
                      </div>

                      {/* Lead Designation Toggle */}
                      {isSelected && (
                        <div className="flex items-center gap-1.5 ml-2">
                          <button
                            type="button"
                            onClick={(e) => setAsLead(agent.id, e)}
                            title={isLead ? "Squad Leader" : "Make Squad Leader"}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              isLead
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                : "text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                            }`}
                          >
                            <Crown className={`h-4 w-4 ${isLead ? "fill-amber-400" : ""}`} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-fg shadow-sm disabled:opacity-50 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Synthesizing Squad...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  {editingTeam ? "Update Squad" : `Synthesize Squad (${selectedAgentIds.size})`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

