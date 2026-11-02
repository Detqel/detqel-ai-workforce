"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Users,
  Plus,
  Sparkles,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  Layers,
  ArrowRight,
  Filter,
  Check,
  Bot,
  UserPlus,
  Compass,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { useNavigation } from "@/context/NavigationContext";
import {
  apiGetTeams,
  apiGetRecruitedAgents,
  apiAddTeamMember,
  apiRemoveTeamMember,
  apiDeleteTeam,
  apiCreateTeam,
  type AgentTeam,
  type RecruitedAgent,
} from "@/lib/api";
import {
  SquadCard,
  CreateSquadModal,
  RecruitedAgentTeamCard,
  CreateCustomAgentModal,
} from "@/components/teams";
import { AgentDossierModal } from "@/components/recruit";
import {
  AGENT_SECTIONS,
  type MarketplaceAgent,
} from "@/constants/agentMarketplaceConstants";

export default function TeamsPage() {
  const { user, currentWorkspace } = useWorkspace();
  const { navigate } = useNavigation();

  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [recruitedAgents, setRecruitedAgents] = useState<RecruitedAgent[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);

  // Selection & Modal States
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreateCustomAgentModalOpen, setIsCreateCustomAgentModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<AgentTeam | null>(null);
  const [initialSquadAgentIds, setInitialSquadAgentIds] = useState<string[]>([]);
  const [inspectingAgent, setInspectingAgent] = useState<MarketplaceAgent | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "in_squad" | "standby">("all");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("all");

  // Notifications
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch teams & recruited agents
  const fetchData = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    setIsLoadingTeams(true);
    setIsLoadingAgents(true);

    try {
      const [teamsData, agentsData] = await Promise.all([
        apiGetTeams(currentWorkspace.id).catch(() => []),
        apiGetRecruitedAgents(currentWorkspace.id).catch(() => []),
      ]);
      setTeams(teamsData);
      setRecruitedAgents(agentsData);
    } catch {
      setToast({ type: "error", text: "Failed to load team data." });
    } finally {
      setIsLoadingTeams(false);
      setIsLoadingAgents(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Stats
  const deployedAgentCount = useMemo(() => {
    return recruitedAgents.filter((a) => (a.teams || []).length > 0).length;
  }, [recruitedAgents]);

  const standbyAgentCount = useMemo(() => {
    return recruitedAgents.filter((a) => (a.teams || []).length === 0).length;
  }, [recruitedAgents]);

  // Handle Team Deletion
  const handleDeleteTeam = async (team: AgentTeam) => {
    if (!currentWorkspace?.id) return;
    const confirmDelete = window.confirm(`Disband and delete the squad "${team.name}"?`);
    if (!confirmDelete) return;

    try {
      await apiDeleteTeam(team.id, currentWorkspace.id);
      setToast({ type: "success", text: `Squad "${team.name}" has been disbanded.` });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete team.";
      setToast({ type: "error", text: msg });
    }
  };

  // Add agent to team
  const handleAssignToTeam = async (agent: RecruitedAgent, teamId: string) => {
    try {
      await apiAddTeamMember(teamId, {
        agentId: agent.id,
        memberRole: "Specialist",
        isLead: false,
        userId: user?.id,
      });
      const team = teams.find((t) => t.id === teamId);
      setToast({
        type: "success",
        text: `${agent.customName || agent.template?.name} assigned to "${team?.name}".`,
      });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to assign agent to team.";
      setToast({ type: "error", text: msg });
    }
  };

  // Remove agent from team
  const handleRemoveMember = async (teamId: string, agentId: string) => {
    try {
      await apiRemoveTeamMember(teamId, agentId);
      setToast({ type: "success", text: "Agent removed from squad." });
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to remove agent.";
      setToast({ type: "error", text: msg });
    }
  };

  // Filtered recruited agents
  const filteredRecruitedAgents = useMemo(() => {
    return recruitedAgents.filter((agent) => {
      const name = (agent.customName || agent.template?.name || "").toLowerCase();
      const role = (agent.customRole || agent.template?.role || "").toLowerCase();
      const section = (agent.template?.section?.name || "").toLowerCase();
      const sectionSlug = agent.template?.section?.slug || "";

      // Search match
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch = !query || name.includes(query) || role.includes(query) || section.includes(query);

      // Availability match
      const inSquad = (agent.teams || []).length > 0;
      const matchesAvailability =
        availabilityFilter === "all" ||
        (availabilityFilter === "in_squad" && inSquad) ||
        (availabilityFilter === "standby" && !inSquad);

      // Section match
      const matchesSection =
        selectedSectionFilter === "all" || sectionSlug === selectedSectionFilter;

      return matchesSearch && matchesAvailability && matchesSection;
    });
  }, [recruitedAgents, searchQuery, availabilityFilter, selectedSectionFilter]);

  // Map RecruitedAgent to MarketplaceAgent for Dossier Modal
  const openDossierForRecruited = (agent: RecruitedAgent) => {
    const configSchema = (agent.configuration || {}) as Record<string, unknown>;
    const capabilities = Array.isArray(configSchema.capabilities)
      ? (configSchema.capabilities as string[])
      : [agent.customRole || agent.template?.role || "Specialist"];

    setInspectingAgent({
      id: agent.templateId || agent.id,
      name: agent.customName || agent.template?.name || "Agent Specialist",
      role: agent.customRole || agent.template?.role || "Specialist",
      category: agent.template?.section?.name || "Specialist Department",
      sectionSlug: agent.template?.section?.slug || "general",
      tier: agent.isUserCreated || agent.template?.isUserCreated ? "Custom Specialist" : "Senior Specialist",
      description: agent.template?.description || agent.systemPrompt || agent.customInstructions || "Dedicated autonomous workforce specialist.",
      purpose: agent.template?.summary || agent.customRole || agent.template?.role || "Specialist",
      instructions: agent.customInstructions || agent.systemPrompt || "",
      capabilities,
      scope: { domains: [agent.template?.section?.slug || "general"], readAccess: "full", writeAccess: "supervised" },
      approvalPolicy: { defaultPolicy: "supervised" },
      metrics: { label: "Department", value: agent.template?.section?.name || "Workforce" },
      highlightTrait: capabilities[0] || "Autonomous Specialist",
      iconName: "Sparkles",
    });
  };

  return (
    <div className="min-h-screen w-full bg-[#f8f9fc] dark:bg-[#0b0f19] text-slate-900 dark:text-slate-100 transition-colors select-none p-4 sm:p-6 lg:p-8 space-y-8">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-semibold backdrop-blur-md animate-in slide-in-from-bottom duration-200 ${
            toast.type === "success"
              ? "bg-emerald-600/90 text-white shadow-emerald-500/20"
              : "bg-red-600/90 text-white shadow-red-500/20"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Top Workspace Header & Telemetry Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-md">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Autonomous Teams & Squads
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Synthesize multi-agent pods, assign mission directives, and orchestrate your recruited workforce.
              </p>
            </div>
          </div>
        </div>

        {/* Telemetry HUD Capsules */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-xs shadow-sm">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="font-bold text-slate-900 dark:text-white">{teams.length}</span>
            <span className="text-slate-500 dark:text-slate-400">Squads</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-xs shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="font-bold text-slate-900 dark:text-white">{deployedAgentCount}</span>
            <span className="text-slate-500 dark:text-slate-400">In Squads</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm text-xs shadow-sm">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span className="font-bold text-slate-900 dark:text-white">{standbyAgentCount}</span>
            <span className="text-slate-500 dark:text-slate-400">Standby</span>
          </div>

          <button
            onClick={() => {
              setEditingTeam(null);
              setInitialSquadAgentIds([]);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-fg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Form AI Team
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: UPPER PART - TEAM OF AGENTS (SQUAD COMMAND) */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-primary" />
            <h2 className="text-sm font-bold tracking-wider uppercase text-slate-800 dark:text-slate-200">
              Autonomous Squad Command ({teams.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Self-organizing multi-agent units with assigned mandates
          </span>
        </div>

        {isLoadingTeams ? (
          <div className="flex items-center justify-center p-12 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : teams.length === 0 ? (
          /* Empty State: No Teams Created Yet */
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-8 sm:p-10 text-center space-y-4 shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted text-primary border border-primary-border">
              <Users className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                No Autonomous Squads Formed Yet
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Connect your recruited specialists into high-performance autonomous teams with assigned mandates and mission objectives.
              </p>
            </div>
          </div>
        ) : (
          /* Active Squads List */
          <div className="flex flex-wrap gap-4 items-start">
            {teams.map((team) => (
              <SquadCard
                key={team.id}
                team={team}
                onAddMember={(t) => {
                  setEditingTeam(null);
                  setInitialSquadAgentIds([]);
                  setIsCreateModalOpen(true);
                }}
                onEditTeam={(t) => {
                  setEditingTeam(t);
                  setIsCreateModalOpen(true);
                }}
                onDeleteTeam={handleDeleteTeam}
                onRemoveMember={handleRemoveMember}
                onInspectAgent={openDossierForRecruited}
              />
            ))}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 2: LOWER PART - ALL RECRUITED AGENTS AVAILABLE */}
      {/* ========================================================================= */}
      <section className="space-y-4 pt-4 border-t border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <h2 className="text-sm font-bold tracking-wider uppercase text-slate-800 dark:text-slate-200">
                Recruited Specialists Pool ({recruitedAgents.length})
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              All specialists recruited into your workspace, ready for pod deployment and independent mission execution.
            </p>
          </div>

          {/* Action Buttons: Create Custom Agent & Marketplace */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateCustomAgentModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-fg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Custom Agent
            </button>
            <button
              onClick={() => navigate("recruit")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-primary hover:bg-primary-muted border border-primary-border transition-colors cursor-pointer"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Recruit from Marketplace
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm shadow-sm">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search recruited agents by name, role, department..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary-ring transition-all"
            />
          </div>

          {/* Availability Filter Chips */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAvailabilityFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                availabilityFilter === "all"
                  ? "bg-primary text-primary-fg shadow-sm"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              All ({recruitedAgents.length})
            </button>
            <button
              onClick={() => setAvailabilityFilter("in_squad")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                availabilityFilter === "in_squad"
                  ? "bg-primary text-primary-fg shadow-sm"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              In Squads ({deployedAgentCount})
            </button>
            <button
              onClick={() => setAvailabilityFilter("standby")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                availabilityFilter === "standby"
                  ? "bg-primary text-primary-fg shadow-sm"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              Standby Pool ({standbyAgentCount})
            </button>
          </div>
        </div>

        {/* Section / Department Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedSectionFilter("all")}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              selectedSectionFilter === "all"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm"
                : "bg-white text-slate-600 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400"
            }`}
          >
            All Departments
          </button>
          {AGENT_SECTIONS.map((sec) => (
            <button
              key={sec.slug}
              onClick={() => setSelectedSectionFilter(sec.slug)}
              className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                selectedSectionFilter === sec.slug
                  ? "bg-primary text-primary-fg border-primary shadow-sm"
                  : "bg-white text-slate-600 dark:bg-slate-800/80 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-border"
              }`}
            >
              {sec.name}
            </button>
          ))}
        </div>

        {/* Recruited Agents Grid */}
        {isLoadingAgents ? (
          <div className="flex items-center justify-center p-12 bg-white/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : recruitedAgents.length === 0 ? (
          /* Empty State: No agents recruited */
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-muted text-primary border border-primary-border">
              <Bot className="h-7 w-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                No Recruited Agents in this Workspace
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Create your own custom agent for your team or recruit enterprise specialists from the marketplace.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <button
                onClick={() => setIsCreateCustomAgentModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-fg shadow-sm transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Create Custom Agent
              </button>
              <button
                onClick={() => navigate("recruit")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-primary hover:bg-primary-muted border border-primary-border transition-all cursor-pointer"
              >
                <UserPlus className="h-4 w-4" />
                Go to Recruit Marketplace
              </button>
            </div>
          </div>
        ) : filteredRecruitedAgents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
            No recruited agents match the current filter criteria.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {filteredRecruitedAgents.map((agent) => (
              <RecruitedAgentTeamCard
                key={agent.id}
                agent={agent}
                teams={teams}
                isSelected={selectedAgentIds.has(agent.id)}
                onToggleSelect={(id) => {
                  setSelectedAgentIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  });
                }}
                onAssignToTeam={handleAssignToTeam}
                onInspect={openDossierForRecruited}
              />
            ))}
          </div>
        )}
      </section>

      {/* Floating Multi-Select Squad Formation Bar */}
      {selectedAgentIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 shadow-2xl backdrop-blur-md border border-slate-700/50 dark:border-slate-300/50 animate-in slide-in-from-bottom duration-200">
          <span className="text-xs font-bold">
            {selectedAgentIds.size} Agent{selectedAgentIds.size > 1 ? "s" : ""} Selected
          </span>
          <div className="h-4 w-px bg-slate-700 dark:bg-slate-300" />
          <button
            onClick={() => {
              setEditingTeam(null);
              setInitialSquadAgentIds(Array.from(selectedAgentIds));
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-fg shadow-md transition-all cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Synthesize Squad from Selection
          </button>
          <button
            onClick={() => setSelectedAgentIds(new Set())}
            className="text-xs text-slate-400 hover:text-white dark:text-slate-600 dark:hover:text-slate-900 transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Modal: Create Custom Agent */}
      <CreateCustomAgentModal
        isOpen={isCreateCustomAgentModalOpen}
        onClose={() => setIsCreateCustomAgentModalOpen(false)}
        workspaceId={currentWorkspace?.id || ""}
        userId={user?.id}
        onAgentCreated={(newAgent) => {
          setToast({
            type: "success",
            text: `Agent "${newAgent.customName || "Custom Specialist"}" created and recruited to your team.`,
          });
          fetchData();
        }}
      />

      {/* Modal: Synthesize / Configure Squad */}
      <CreateSquadModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingTeam(null);
        }}
        workspaceId={currentWorkspace?.id || ""}
        userId={user?.id}
        recruitedAgents={recruitedAgents}
        onTeamCreated={() => {
          setSelectedAgentIds(new Set());
          fetchData();
        }}
        initialSelectedAgentIds={initialSquadAgentIds}
        editingTeam={editingTeam}
      />

      {/* Modal: Full Agent Dossier Inspection */}
      <AgentDossierModal
        agent={inspectingAgent}
        isOpen={Boolean(inspectingAgent)}
        isRecruited={true}
        isRecruiting={false}
        onClose={() => setInspectingAgent(null)}
        onRecruit={() => {}}
      />
    </div>
  );
}
