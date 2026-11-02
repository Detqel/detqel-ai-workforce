"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  apiGetAgents,
  apiCreateAgent,
  apiGetRecruitTemplates,
  apiRecruitAgent,
  apiGetRecruitedAgents,
  type AgentRecord,
  type RecruitTemplate,
  type RecruitedAgent,
} from "@/lib/api";
import {
  AGENT_SECTIONS,
  MARKETPLACE_ICON_MAP,
  type MarketplaceAgent,
  type AgentTier,
} from "@/constants/agentMarketplaceConstants";
import {
  MarketplaceHeader,
  AgentMarketplaceCard,
  AgentDossierModal,
  MarketplaceBatchBar,
} from "@/components/recruit";
import { CheckCircle2, AlertCircle, Loader2, CheckSquare, Square, Sparkles } from "lucide-react";

function getTierFromRole(role: string): AgentTier {
  if (role.startsWith("Chief") || role.startsWith("Executive Director") || role.startsWith("General Counsel")) return "Platform Leader";
  if (role.endsWith("Director") || role.endsWith("Strategist")) return "Master Strategist";
  if (role.endsWith("Manager") || role.endsWith("Lead") || role.endsWith("Owner") || role.endsWith("Controller")) return "Enterprise Specialist";
  return "Senior Specialist";
}

const SECTION_ICON_MAP: Record<string, string> = {
  crown: "Crown",
  "trending-up": "TrendingUp",
  briefcase: "Briefcase",
  code: "Code",
  cpu: "Cpu",
  "dollar-sign": "DollarSign",
  megaphone: "Megaphone",
  "credit-card": "CreditCard",
  users: "Users",
  headphones: "Headphones",
  settings: "Settings",
  "shield-check": "ShieldCheck",
  "book-open": "BookOpen",
};

const SECTION_COLOR_MAP: Record<string, { badge: string; iconBg: string; borderHover: string }> = {
  "leadership-orchestration": {
    badge: "bg-primary-muted text-primary border border-primary-border",
    iconBg: "bg-primary-muted text-primary border border-primary-border",
    borderHover: "hover:border-primary",
  },
  "business-strategy-planning": {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200 dark:border-blue-800/60",
    iconBg: "bg-blue-50 text-blue-600 dark:bg-blue-950/80 dark:text-blue-400 border-blue-200/80 dark:border-blue-800/80",
    borderHover: "hover:border-blue-400/80 dark:hover:border-blue-500/60",
  },
  "product-management": {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-800/60",
    iconBg: "bg-amber-50 text-amber-600 dark:bg-amber-950/80 dark:text-amber-400 border-amber-200/80 dark:border-amber-800/80",
    borderHover: "hover:border-amber-400/80 dark:hover:border-amber-500/60",
  },
  "technology-software-engineering": {
    badge: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800/60",
    iconBg: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950/80 dark:text-cyan-400 border-cyan-200/80 dark:border-cyan-800/80",
    borderHover: "hover:border-cyan-400/80 dark:hover:border-cyan-500/60",
  },
  "artificial-intelligence-data-science": {
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300 border-violet-200 dark:border-violet-800/60",
    iconBg: "bg-violet-50 text-violet-600 dark:bg-violet-950/80 dark:text-violet-400 border-violet-200/80 dark:border-purple-800/80",
    borderHover: "hover:border-violet-400/80 dark:hover:border-violet-500/60",
  },
  "sales-revenue": {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
    iconBg: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/80 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80",
    borderHover: "hover:border-emerald-400/80 dark:hover:border-emerald-500/60",
  },
  "marketing-branding": {
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-950/70 dark:text-pink-300 border-pink-200 dark:border-pink-800/60",
    iconBg: "bg-pink-50 text-pink-600 dark:bg-pink-950/80 dark:text-pink-400 border-pink-200/80 dark:border-pink-800/80",
    borderHover: "hover:border-pink-400/80 dark:hover:border-pink-500/60",
  },
  "finance-accounting": {
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200 dark:border-teal-800/60",
    iconBg: "bg-teal-50 text-teal-600 dark:bg-teal-950/80 dark:text-teal-400 border-teal-200/80 dark:border-teal-800/80",
    borderHover: "hover:border-teal-400/80 dark:hover:border-teal-500/60",
  },
  "human-resources-recruitment": {
    badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60",
    iconBg: "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/80 dark:text-indigo-400 border-indigo-200/80 dark:border-indigo-800/80",
    borderHover: "hover:border-indigo-400/80 dark:hover:border-indigo-500/60",
  },
  "customer-success-support": {
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border-sky-200 dark:border-sky-800/60",
    iconBg: "bg-sky-50 text-sky-600 dark:bg-sky-950/80 dark:text-sky-400 border-sky-200/80 dark:border-sky-800/80",
    borderHover: "hover:border-sky-400/80 dark:hover:border-sky-500/60",
  },
  "operations-administration": {
    badge: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
    iconBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700",
    borderHover: "hover:border-slate-400 dark:hover:border-slate-600",
  },
  "legal-compliance-cybersecurity": {
    badge: "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-800/60",
    iconBg: "bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400 border-rose-200/80 dark:border-rose-800/80",
    borderHover: "hover:border-rose-400/80 dark:hover:border-rose-500/60",
  },
  "research-knowledge-management": {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60",
    iconBg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400 border-emerald-200/80 dark:border-emerald-800/80",
    borderHover: "hover:border-emerald-400/80 dark:hover:border-emerald-500/60",
  },
};

export default function RecruitPage() {
  const { user, currentWorkspace } = useWorkspace();

  const [marketplaceAgents, setMarketplaceAgents] = useState<MarketplaceAgent[]>([]);
  const [recruitedAgents, setRecruitedAgents] = useState<(AgentRecord | RecruitedAgent)[]>([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [recruitingAgentIds, setRecruitingAgentIds] = useState<Set<string>>(new Set());
  const [isBatchRecruiting, setIsBatchRecruiting] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [selectedTab, setSelectedTab] = useState<string>("leadership-orchestration");
  const [searchQuery, setSearchQuery] = useState("");
  const [inspectingAgent, setInspectingAgent] = useState<MarketplaceAgent | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load marketplace templates from backend API
  const loadMarketplaceTemplates = useCallback(async () => {
    try {
      const templates = await apiGetRecruitTemplates();
      if (templates && templates.length > 0) {
        const mapped: MarketplaceAgent[] = templates.map((t: RecruitTemplate) => {
          const configSchema = (t.latestVersion?.configurationSchema || {}) as Record<string, unknown>;
          const capabilities = Array.isArray(configSchema.capabilities)
            ? (configSchema.capabilities as string[])
            : [t.role];
          const iconKey = t.section?.icon?.toLowerCase() || "";
          const iconName = SECTION_ICON_MAP[iconKey] || "Sparkles";

          return {
            id: t.slug || t.id,
            name: t.name,
            role: t.role,
            category: t.section?.name || "Leadership & Orchestration",
            sectionSlug: t.section?.slug || "leadership-orchestration",
            tier: getTierFromRole(t.role),
            description: t.description || t.summary || "",
            purpose: t.summary || t.role,
            instructions: t.latestVersion?.instructionTemplate || t.description || "",
            capabilities,
            scope: {
              domains: [t.section?.slug || "general"],
              readAccess: "full",
              writeAccess: "supervised",
            },
            approvalPolicy: {
              defaultPolicy: "audit_logged",
            },
            metrics: {
              label: "Domain",
              value: t.section?.name || "Enterprise",
            },
            highlightTrait: capabilities[1] || t.role,
            iconName,
          };
        });
        setMarketplaceAgents(mapped);
      } else {
        setMarketplaceAgents([]);
      }
    } catch {
      setMarketplaceAgents([]);
    }
  }, []);

  // Fetch currently recruited agents for the active workspace
  const fetchRecruitedAgents = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setRecruitedAgents([]);
      return;
    }

    try {
      setIsLoadingAgents(true);
      const [workforceAgents, orgAgents] = await Promise.allSettled([
        apiGetAgents(currentWorkspace.id),
        apiGetRecruitedAgents(currentWorkspace.id),
      ]);

      const combined: (AgentRecord | RecruitedAgent)[] = [];
      if (workforceAgents.status === "fulfilled" && Array.isArray(workforceAgents.value)) {
        combined.push(...workforceAgents.value);
      }
      if (orgAgents.status === "fulfilled" && Array.isArray(orgAgents.value)) {
        combined.push(...orgAgents.value);
      }

      setRecruitedAgents(combined);
    } catch {
      setRecruitedAgents([]);
    } finally {
      setIsLoadingAgents(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadMarketplaceTemplates();
  }, [loadMarketplaceTemplates]);

  useEffect(() => {
    fetchRecruitedAgents();
  }, [fetchRecruitedAgents]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Set of normalized recruited names for fast O(1) lookup
  const recruitedNamesSet = useMemo(() => {
    const set = new Set<string>();
    for (const agent of recruitedAgents) {
      const name = "customName" in agent
        ? (agent.customName || agent.template?.name || "")
        : agent.name;
      if (name) {
        set.add(name.trim().toLowerCase());
      }
    }
    return set;
  }, [recruitedAgents]);

  const isAgentRecruited = useCallback(
    (agent: MarketplaceAgent) => {
      return recruitedNamesSet.has(agent.name.trim().toLowerCase());
    },
    [recruitedNamesSet]
  );

  // Active section metadata based on selectedTab
  const activeSectionMetadata = useMemo(() => {
    return (
      AGENT_SECTIONS.find((sec) => sec.slug === selectedTab || sec.name === selectedTab) ??
      AGENT_SECTIONS[0]
    );
  }, [selectedTab]);

  // Agents belonging ONLY to the selected tab
  const agentsInActiveTab = useMemo(() => {
    return marketplaceAgents.filter(
      (agent) =>
        agent.sectionSlug === activeSectionMetadata.slug ||
        agent.category === activeSectionMetadata.name
    );
  }, [marketplaceAgents, activeSectionMetadata]);

  // Search filter applied within the active tab
  const displayedAgentsInTab = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return agentsInActiveTab;

    return agentsInActiveTab.filter((agent) => {
      const inName = agent.name.toLowerCase().includes(query);
      const inRole = agent.role.toLowerCase().includes(query);
      const inDesc = agent.description.toLowerCase().includes(query);
      const inCapabilities = agent.capabilities.some((c) =>
        c.toLowerCase().includes(query)
      );
      return inName || inRole || inDesc || inCapabilities;
    });
  }, [agentsInActiveTab, searchQuery]);

  // Section counts for the tab badges
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sec of AGENT_SECTIONS) {
      counts[sec.name] = 0;
    }
    for (const agent of marketplaceAgents) {
      if (counts[agent.category] !== undefined) {
        counts[agent.category]++;
      }
    }
    return counts;
  }, [marketplaceAgents]);

  // Global totals
  const recruitedCount = useMemo(() => {
    return marketplaceAgents.filter((agent) => isAgentRecruited(agent)).length;
  }, [isAgentRecruited, marketplaceAgents]);

  const availableCount = marketplaceAgents.length - recruitedCount;

  // Active tab unrecruited agents
  const availableInTab = useMemo(() => {
    return displayedAgentsInTab.filter((agent) => !isAgentRecruited(agent));
  }, [displayedAgentsInTab, isAgentRecruited]);

  const recruitedInTabCount = useMemo(() => {
    return agentsInActiveTab.filter((agent) => isAgentRecruited(agent)).length;
  }, [agentsInActiveTab, isAgentRecruited]);

  const isAllTabSelected =
    availableInTab.length > 0 &&
    availableInTab.every((agent) => selectedAgentIds.has(agent.id));

  // Toggle single selection
  const handleToggleSelect = useCallback((agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }, []);

  // Toggle select all available agents in active tab
  const handleToggleSelectAllTab = useCallback(() => {
    if (isAllTabSelected) {
      setSelectedAgentIds((prev) => {
        const next = new Set(prev);
        for (const agent of availableInTab) {
          next.delete(agent.id);
        }
        return next;
      });
    } else {
      setSelectedAgentIds((prev) => {
        const next = new Set(prev);
        for (const agent of availableInTab) {
          next.add(agent.id);
        }
        return next;
      });
    }
  }, [isAllTabSelected, availableInTab]);

  // Switch tab
  const handleSelectTab = useCallback((tabSlug: string) => {
    setSelectedTab(tabSlug);
  }, []);

  // Recruit a single agent
  const handleRecruit = useCallback(
    async (agent: MarketplaceAgent) => {
      if (!currentWorkspace?.id) {
        setToast({
          type: "error",
          text: "Please select an active workspace to recruit agents.",
        });
        return;
      }

      setRecruitingAgentIds((prev) => new Set(prev).add(agent.id));

      try {
        let created: AgentRecord | RecruitedAgent;
        try {
          created = await apiRecruitAgent({
            workspaceId: currentWorkspace.id,
            templateId: agent.id,
            customName: agent.name,
            customRole: agent.role,
            customInstructions: agent.instructions,
            userId: user?.id,
          });
        } catch {
          created = await apiCreateAgent({
            workspaceId: currentWorkspace.id,
            name: agent.name,
            description: agent.description,
            purpose: agent.purpose,
            instructions: agent.instructions,
            agentType: "marketplace",
            scope: agent.scope,
            capabilities: agent.capabilities,
            approvalPolicy: agent.approvalPolicy,
            createdBy: user?.id,
          });
        }

        setRecruitedAgents((prev) => [created, ...prev]);
        setSelectedAgentIds((prev) => {
          const next = new Set(prev);
          next.delete(agent.id);
          return next;
        });

        setToast({
          type: "success",
          text: `${agent.name} (${agent.role}) has been recruited into ${currentWorkspace.name}.`,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to recruit agent";
        setToast({
          type: "error",
          text: message,
        });
      } finally {
        setRecruitingAgentIds((prev) => {
          const next = new Set(prev);
          next.delete(agent.id);
          return next;
        });
      }
    },
    [currentWorkspace, user?.id]
  );

  // Recruit multiple agents in batch
  const handleBatchRecruit = useCallback(async () => {
    if (!currentWorkspace?.id) {
      setToast({
        type: "error",
        text: "Please select an active workspace to recruit agents.",
      });
      return;
    }

    const agentsToRecruit = marketplaceAgents.filter(
      (agent) => selectedAgentIds.has(agent.id) && !isAgentRecruited(agent)
    );

    if (agentsToRecruit.length === 0) return;

    setIsBatchRecruiting(true);

    let recruitedSuccessful = 0;
    const newAgents: (AgentRecord | RecruitedAgent)[] = [];

    const results = await Promise.allSettled(
      agentsToRecruit.map(async (agent) => {
        try {
          return await apiRecruitAgent({
            workspaceId: currentWorkspace.id,
            templateId: agent.id,
            customName: agent.name,
            customRole: agent.role,
            customInstructions: agent.instructions,
            userId: user?.id,
          });
        } catch {
          return await apiCreateAgent({
            workspaceId: currentWorkspace.id,
            name: agent.name,
            description: agent.description,
            purpose: agent.purpose,
            instructions: agent.instructions,
            agentType: "marketplace",
            scope: agent.scope,
            capabilities: agent.capabilities,
            approvalPolicy: agent.approvalPolicy,
            createdBy: user?.id,
          });
        }
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        newAgents.push(result.value);
        recruitedSuccessful++;
      }
    }

    if (newAgents.length > 0) {
      setRecruitedAgents((prev) => [...newAgents, ...prev]);
      setSelectedAgentIds(new Set());
      setToast({
        type: "success",
        text: `Successfully recruited ${recruitedSuccessful} ${
          recruitedSuccessful === 1 ? "agent" : "agents"
        } into ${currentWorkspace.name}.`,
      });
    } else {
      setToast({
        type: "error",
        text: "Failed to recruit selected agents. Please check server status.",
      });
    }

    setIsBatchRecruiting(false);
  }, [currentWorkspace, selectedAgentIds, isAgentRecruited, user?.id, marketplaceAgents]);

  const SectionIcon = MARKETPLACE_ICON_MAP[activeSectionMetadata.iconName] ?? Sparkles;
  const sectionStyle =
    SECTION_COLOR_MAP[activeSectionMetadata.slug] ?? SECTION_COLOR_MAP["leadership-orchestration"];

  return (
    <div className="w-full px-6 sm:px-8 xl:px-10 py-6 sm:py-8 space-y-6 select-none bg-slate-50/60 dark:bg-[#0e1422] text-slate-900 dark:text-slate-100 transition-colors min-h-full pb-24">
      {/* Toast Alert */}
      {toast && (
        <div
          role="alert"
          className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border animate-in slide-in-from-top-3 duration-200 ${
            toast.type === "success"
              ? "bg-emerald-900 text-white border-emerald-700"
              : "bg-rose-900 text-white border-rose-700"
          }`}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-300 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toast.text}</span>
        </div>
      )}

      {/* Header with Search, Tab Navigation & Stats */}
      <MarketplaceHeader
        workspaceName={currentWorkspace?.name}
        totalAgentsCount={marketplaceAgents.length}
        recruitedCount={recruitedCount}
        availableCount={availableCount}
        selectedTab={selectedTab}
        onSelectTab={handleSelectTab}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedCount={selectedAgentIds.size}
        onToggleSelectAllTab={handleToggleSelectAllTab}
        isAllTabSelected={isAllTabSelected}
        availableInTabCount={availableInTab.length}
        sectionCounts={sectionCounts}
      />

      {/* Selected Tab Content Container */}
      {isLoadingAgents && marketplaceAgents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-[#8a2be2] dark:text-[#FFA500]" />
          <span className="text-xs font-semibold">Loading agent marketplace...</span>
        </div>
      ) : (
        <div className="space-y-6 rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white/70 dark:bg-[#111927]/70 p-5 sm:p-7 backdrop-blur-xs shadow-xs">
          {/* Active Tab Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800/80">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-2xs shrink-0 ${sectionStyle.iconBg}`}
              >
                <SectionIcon className="w-5 h-5" />
              </div>

              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                    {activeSectionMetadata.name}
                  </h2>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/80">
                    {agentsInActiveTab.length} Specialists
                  </span>
                  {recruitedInTabCount > 0 && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {recruitedInTabCount} Recruited
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                  {activeSectionMetadata.description}
                </p>
              </div>
            </div>

            {/* Quick Action for Active Tab */}
            {availableInTab.length > 0 && (
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={handleToggleSelectAllTab}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151f32] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer shadow-2xs"
                >
                  {isAllTabSelected ? (
                    <>
                      <CheckSquare className="w-3.5 h-3.5 text-[#8a2be2] dark:text-[#FFA500]" />
                      <span>Deselect All in Tab</span>
                    </>
                  ) : (
                    <>
                      <Square className="w-3.5 h-3.5 text-slate-400" />
                      <span>Select All in Tab ({availableInTab.length})</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Agents Grid for ONLY the Selected Tab */}
          {displayedAgentsInTab.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 pt-1">
              {displayedAgentsInTab.map((agent) => {
                const isRecruited = isAgentRecruited(agent);
                const isSelected = selectedAgentIds.has(agent.id);
                const isRecruiting = recruitingAgentIds.has(agent.id) || isBatchRecruiting;

                return (
                  <AgentMarketplaceCard
                    key={agent.id}
                    agent={agent}
                    isRecruited={isRecruited}
                    isSelected={isSelected}
                    isRecruiting={isRecruiting}
                    onToggleSelect={handleToggleSelect}
                    onRecruit={handleRecruit}
                    onInspect={(targetAgent) => setInspectingAgent(targetAgent)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-14 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-[#151f32]/30 p-8">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 mb-2.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                No specialists found
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                No specialists match &quot;{searchQuery}&quot; within {activeSectionMetadata.name}.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Agent Detail Dossier Modal */}
      <AgentDossierModal
        agent={inspectingAgent}
        isOpen={Boolean(inspectingAgent)}
        isRecruited={inspectingAgent ? isAgentRecruited(inspectingAgent) : false}
        isRecruiting={
          inspectingAgent
            ? recruitingAgentIds.has(inspectingAgent.id) || isBatchRecruiting
            : false
        }
        onClose={() => setInspectingAgent(null)}
        onRecruit={(agent) => {
          handleRecruit(agent);
        }}
      />

      {/* Floating Multi-Recruit Batch Bar */}
      <MarketplaceBatchBar
        selectedCount={selectedAgentIds.size}
        isRecruiting={isBatchRecruiting}
        onRecruitBatch={handleBatchRecruit}
        onClearSelection={() => setSelectedAgentIds(new Set())}
      />
    </div>
  );
}
