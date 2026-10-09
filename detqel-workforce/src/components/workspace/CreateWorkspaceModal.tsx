"use client";

import React, { useState } from "react";
import {
  Building2,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  Brain,
  Bot,
  Activity,
  ShieldCheck,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  apiCreateWorkspace,
  apiGetDomains,
  type IndustryDomainItem,
} from "@/lib/api";
import { useRouter } from "next/navigation";

export const CreateWorkspaceModal: React.FC = () => {
  const router = useRouter();
  const {
    user,
    workspaces,
    isCreateWorkspaceModalOpen,
    closeCreateWorkspaceModal,
    addNewWorkspace,
  } = useWorkspace();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [description, setDescription] = useState("");
  const [domains, setDomains] = useState<IndustryDomainItem[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamically load industry domains directly from PostgreSQL database
  React.useEffect(() => {
    if (isCreateWorkspaceModalOpen) {
      setLoadingDomains(true);
      apiGetDomains()
        .then((data) => {
          setDomains(data);
          if (data.length > 0) {
            setIndustry((prev) => (prev ? prev : data[0].name));
          }
        })
        .catch((err) => {
          console.error("Failed to load domains from database:", err);
          setError("Failed to fetch domains from database.");
        })
        .finally(() => {
          setLoadingDomains(false);
        });
    }
  }, [isCreateWorkspaceModalOpen]);

  if (!isCreateWorkspaceModalOpen) return null;

  const canDismiss = workspaces.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter a workspace name.");
      return;
    }

    if (!user?.id) {
      setError("Active user session not detected. Please sign in again.");
      return;
    }

    let finalIndustry = industry;
    if (industry === "ADD_DOMAIN_CUSTOM") {
      if (!customDomain.trim()) {
        setError("Please enter your domain name.");
        return;
      }
      finalIndustry = customDomain.trim();
    }

    // Check for duplicate workspace with same name and same domain
    const isDuplicate = workspaces.some(
      (w) =>
        w.name.trim().toLowerCase() === name.trim().toLowerCase() &&
        (w.industry || "").trim().toLowerCase() === finalIndustry.trim().toLowerCase()
    );
    if (isDuplicate) {
      setError(
        `A workspace with the name "${name.trim()}" and domain "${finalIndustry}" already exists. Please choose a different name or domain.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await apiCreateWorkspace({
        name: name.trim(),
        industry: finalIndustry,
        description: description.trim() || undefined,
        createdBy: user.id,
      });

      addNewWorkspace(created);
      router.push("/dashboard");
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Workspace creation failed";
      console.error("Workspace creation failed:", errorMessage);
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-[96vw] max-w-5xl xl:max-w-6xl h-[88vh] max-h-[760px] min-h-[580px] bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative animate-in zoom-in-95 duration-300">
        {/* Dismiss Button (only visible if user already has at least one existing workspace) */}
        {canDismiss && (
          <button
            type="button"
            onClick={closeCreateWorkspaceModal}
            className="absolute top-4 right-4 z-30 p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* LEFT COLUMN: Modern Workspace Presentation & AI Workforce Explanation */}
        <div className="flex-1 relative overflow-hidden p-8 sm:p-10 flex flex-col justify-between bg-gradient-to-br from-[#0c0a1a] via-[#140e2b] to-[#1e113a] text-white">
          {/* Subtle Ambient Glow Effects */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#8a2be2]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

          {/* Top Section: Tagline & Headings */}
          <div className="relative z-10 space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold backdrop-blur-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#8a2be2]" />
              <span>DETQEL AI Workforce</span>
            </div>

            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
                Why a Dedicated Workspace is Essential
              </h2>
              <p className="text-xs sm:text-sm text-purple-200/80 mt-2.5 max-w-lg leading-relaxed">
                An autonomous AI workforce cannot thrive on isolated prompts.
                A DETQEL Workspace serves as the unified operational perimeter
                where intelligent agents continuously collaborate, analyze, and execute
                with deep business context.
              </p>
            </div>
          </div>

          {/* Center Section: 3 Pillars of AI Workforce Workspace */}
          <div className="relative z-10 grid grid-cols-1 gap-3.5 my-6">
            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs hover:bg-white/[0.07] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 flex items-center justify-center shrink-0">
                <Brain className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Unified Business Brain</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5 leading-relaxed">
                  Centralizes company schema, integrations, and institutional knowledge so every agent operates with 100% domain ground truth.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs hover:bg-white/[0.07] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Autonomous Multi-Agent Swarms</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5 leading-relaxed">
                  Recruit and orchestrate specialized agents across Investigation, Prediction, Simulation, and Automation working 24/7.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] backdrop-blur-xs hover:bg-white/[0.07] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-300 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5">
                  <span>Continuous Real-Time Telemetry</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </h4>
                <p className="text-[11px] sm:text-xs text-slate-300/80 mt-0.5 leading-relaxed">
                  Stream operational heatmap activity, live business signals, and reviewable decision matrices directly to your command center.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Security / Isolation Note */}
          <div className="relative z-10 pt-4 border-t border-purple-500/20 flex items-center gap-2.5 text-[11px] text-purple-200/80">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Dedicated tenant isolation • Enterprise-grade RBAC • Zero knowledge leaks</span>
          </div>
        </div>

        {/* RIGHT BAR: Workspace Configuration Form */}
        <div className="w-full md:w-[410px] lg:w-[450px] xl:w-[480px] bg-white dark:bg-[#182234] p-7 sm:p-9 flex flex-col justify-between shrink-0 overflow-y-auto">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8a2be2] dark:text-[#c084fc] bg-purple-50 dark:bg-purple-950/60 px-2.5 py-1 rounded-lg border border-purple-100 dark:border-purple-900/60">
                Workspace Initialization
              </span>
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-purple-100 tracking-tight">
              Create Your Workspace
            </h3>
            <p className="text-xs text-slate-500 dark:text-purple-300/70 mt-1 leading-relaxed">
              Name your organization hub to initiate your AI Workforce environment and launch your dashboard.
            </p>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form id="create-workspace-form" onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-purple-200 uppercase tracking-wider mb-1.5">
                  Workspace Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-purple-400/60">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Global, Apex Logistics"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#151f32] text-xs font-medium text-slate-900 dark:text-purple-100 placeholder:text-slate-400 dark:placeholder:text-purple-400/50 outline-none focus:border-[#8a2be2] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-purple-200 uppercase tracking-wider mb-1.5">
                  Industry Domain
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-purple-400/60">
                    <Layers className="w-4 h-4" />
                  </div>
                  <select
                    value={industry}
                    disabled={loadingDomains}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#151f32] text-xs font-medium text-slate-900 dark:text-purple-100 outline-none focus:border-[#8a2be2] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {domains.map((dom) => (
                      <option key={dom.id} value={dom.name} className="dark:bg-[#182234]">
                        {dom.name}
                      </option>
                    ))}
                    <option value="ADD_DOMAIN_CUSTOM" className="dark:bg-[#182234]">Add Domain +</option>
                  </select>
                </div>

                {/* Free-form text input popped up when Add Domain + is selected */}
                {industry === "ADD_DOMAIN_CUSTOM" && (
                  <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-purple-200 uppercase tracking-wider mb-1">
                      Custom Domain Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customDomain}
                      onChange={(e) => setCustomDomain(e.target.value)}
                      placeholder="Enter custom domain (e.g. Aerospace, Robotics, Gaming...)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#8a2be2]/40 bg-purple-50/20 dark:bg-[#151f32] text-xs font-medium text-slate-900 dark:text-purple-100 placeholder:text-slate-400 dark:placeholder:text-purple-400/50 outline-none focus:border-[#8a2be2] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 transition-all"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-purple-200 uppercase tracking-wider mb-1.5">
                  Description <span className="text-slate-400 dark:text-purple-400/60 font-normal">(Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief summary of operations, product lines, or business goals..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#151f32] text-xs text-slate-900 dark:text-purple-100 placeholder:text-slate-400 dark:placeholder:text-purple-400/50 outline-none focus:border-[#8a2be2] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 transition-all resize-none"
                />
              </div>
            </form>
          </div>

          <div className="pt-5 mt-auto">
            <button
              type="submit"
              form="create-workspace-form"
              disabled={isSubmitting}
              className="w-full py-3.5 px-4 rounded-xl bg-[#8a2be2] hover:bg-[#7b24ca] active:scale-[0.99] text-white font-bold text-xs shadow-md shadow-[#8a2be2]/25 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Provisioning Workspace & AI Agents...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Workspace & Launch Dashboard</span>
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-400 dark:text-purple-400/60 text-center mt-3 leading-normal">
              You can invite team members and configure connectors at any time from your command center settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
