"use client";

import React, { useState, useEffect } from "react";
import {
  Building2,
  Layers,
  X,
  Loader2,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import {
  WorkspaceSummary,
  apiGetDomains,
  type IndustryDomainItem,
} from "@/lib/api";
import { useWorkspace } from "@/context/WorkspaceContext";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { IconOnlyButton } from "@/components/ui/icon-only-button";

interface EditWorkspaceModalProps {
  workspace: WorkspaceSummary | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditWorkspaceModal: React.FC<EditWorkspaceModalProps> = ({
  workspace,
  isOpen,
  onClose,
}) => {
  const { workspaces, updateWorkspace } = useWorkspace();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [description, setDescription] = useState("");
  const [domains, setDomains] = useState<IndustryDomainItem[]>([]);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workspace && isOpen) {
      setName(workspace.name || "");
      setDescription(workspace.description || "");
      setIndustry(workspace.industry || "");
      setCustomDomain("");
      setError(null);
      setLoadingDomains(true);

      apiGetDomains()
        .then((fetchedDomains) => {
          setDomains(fetchedDomains);
          const wsIndustry = (workspace.industry || "").trim();
          const match = fetchedDomains.find(
            (d) => d.name.toLowerCase() === wsIndustry.toLowerCase()
          );

          if (match) {
            setIndustry(match.name);
            setCustomDomain("");
          } else if (wsIndustry) {
            setIndustry("ADD_DOMAIN_CUSTOM");
            setCustomDomain(wsIndustry);
          } else if (fetchedDomains.length > 0) {
            setIndustry(fetchedDomains[0].name);
            setCustomDomain("");
          } else {
            setIndustry("");
            setCustomDomain("");
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
  }, [workspace, isOpen]);

  if (!isOpen || !workspace) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Please enter a workspace name.");
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

    const existingName = (workspace.name || "").trim();
    const existingIndustry = (workspace.industry || "").trim();
    const trimmedDescription = description.trim();
    const existingDescription = (workspace.description || "").trim();

    const isNameChanged =
      trimmedName.toLowerCase() !== existingName.toLowerCase();
    const isIndustryChanged =
      finalIndustry.toLowerCase() !== existingIndustry.toLowerCase();
    const isDescriptionChanged =
      trimmedDescription !== existingDescription;

    // If nothing changed, dismiss cleanly without throwing an error
    if (!isNameChanged && !isIndustryChanged && !isDescriptionChanged) {
      onClose();
      return;
    }

    // Only validate duplicate collision if name or domain was modified
    if (isNameChanged || isIndustryChanged) {
      const isDuplicate = workspaces.some(
        (w) =>
          w.id !== workspace.id &&
          w.name.trim().toLowerCase() === trimmedName.toLowerCase() &&
          (w.industry || "").trim().toLowerCase() === finalIndustry.toLowerCase()
      );
      if (isDuplicate) {
        setError(
          `A workspace with the name "${trimmedName}" and domain "${finalIndustry}" already exists. Please choose a different name or domain.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await updateWorkspace(workspace.id, {
        name: trimmedName,
        industry: finalIndustry,
        description: trimmedDescription || undefined,
      });

      onClose();
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to update workspace";
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-[#182234] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 flex flex-col relative animate-in zoom-in-95 duration-200">
        <IconOnlyButton
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5"
          aria-label="Close edit modal"
          icon={<X className="w-5 h-5" />}
        />

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#8a2be2]/10 dark:bg-[#FFA500]/15 border border-[#8a2be2]/20 dark:border-[#FFA500]/30 text-[#8a2be2] dark:text-[#FFA500] flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Edit Workspace
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Update name and business domain for {workspace.name}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-center gap-2 text-xs text-red-600 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Workspace Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-400">
                <Building2 className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Global, Apex Logistics"
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#151f32] text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-[#8a2be2] dark:focus:border-[#FFA500] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 dark:focus:ring-[#FFA500]/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Industry Domain
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 dark:text-slate-400">
                <Layers className="w-4 h-4" />
              </div>
              <select
                value={industry}
                disabled={loadingDomains}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#151f32] text-xs font-medium text-slate-900 dark:text-slate-100 outline-none focus:border-[#8a2be2] dark:focus:border-[#FFA500] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 dark:focus:ring-[#FFA500]/20 transition-all cursor-pointer disabled:opacity-60"
              >
                {domains.map((dom) => (
                  <option key={dom.id} value={dom.name} className="dark:bg-[#182234]">
                    {dom.name}
                  </option>
                ))}
                <option value="ADD_DOMAIN_CUSTOM" className="dark:bg-[#182234]">Add Domain +</option>
              </select>
            </div>

            {industry === "ADD_DOMAIN_CUSTOM" && (
              <div className="mt-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Custom Domain Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="Enter custom domain name..."
                  className="w-full px-3.5 py-2 rounded-xl border border-[#8a2be2]/40 dark:border-[#FFA500]/40 bg-purple-50/20 dark:bg-[#151f32] text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-[#8a2be2] dark:focus:border-[#FFA500] focus:ring-2 focus:ring-[#8a2be2]/20 dark:focus:ring-[#FFA500]/20 transition-all"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
              Description <span className="text-slate-400 dark:text-slate-400 font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary of operations..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#151f32] text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-[#8a2be2] dark:focus:border-[#FFA500] focus:bg-white dark:focus:bg-[#1e2a40] focus:ring-2 focus:ring-[#8a2be2]/20 dark:focus:ring-[#FFA500]/20 transition-all resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <SecondaryButton
              onClick={onClose}
              disabled={isSubmitting}
              value="Cancel"
            />
            <PrimaryButton
              type="submit"
              disabled={isSubmitting}
              value={isSubmitting ? "Saving..." : "Save Changes"}
              icon={isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              iconPosition="left"
            />
          </div>
        </form>
      </div>
    </div>
  );
};
