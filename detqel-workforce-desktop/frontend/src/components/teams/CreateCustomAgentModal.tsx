"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Bot,
  Sparkles,
  Layers,
  Plus,
  Trash2,
  Loader2,
  Check,
  Shield,
  Tag,
  Briefcase,
  FileText,
} from "lucide-react";
import {
  apiGetRecruitSections,
  apiCreateCustomAgent,
  type RecruitSection,
  type RecruitedAgent,
  type CreateCustomAgentPayload,
} from "@/lib/api";
import { CustomDropdown, type CustomDropdownOption } from "@/components/ui/custom-dropdown";

interface CreateCustomAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  userId?: string;
  onAgentCreated: (agent: RecruitedAgent) => void;
}

export const CreateCustomAgentModal: React.FC<CreateCustomAgentModalProps> = ({
  isOpen,
  onClose,
  workspaceId,
  userId,
  onAgentCreated,
}) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [capabilityInput, setCapabilityInput] = useState("");
  const [capabilityError, setCapabilityError] = useState<string | null>(null);

  const [sections, setSections] = useState<RecruitSection[]>([]);
  const [isLoadingSections, setIsLoadingSections] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available sections from database
  const loadSections = useCallback(async () => {
    try {
      setIsLoadingSections(true);
      const data = await apiGetRecruitSections();
      setSections(data);
      if (data.length > 0 && !sectionId) {
        setSectionId(data[0].id);
      }
    } catch {
      setSections([]);
    } finally {
      setIsLoadingSections(false);
    }
  }, [sectionId]);

  useEffect(() => {
    if (isOpen) {
      loadSections();
      setError(null);
      setCapabilityError(null);
    } else {
      // Reset form
      setName("");
      setRole("");
      setSectionId("");
      setSummary("");
      setDescription("");
      setSystemPrompt("");
      setCapabilities([]);
      setCapabilityInput("");
      setCapabilityError(null);
      setError(null);
    }
  }, [isOpen, loadSections]);

  const sectionOptions = useMemo<CustomDropdownOption[]>(() => {
    return sections.map((sec) => ({
      value: sec.id,
      label: sec.name,
      description: sec.description || undefined,
      icon: <Layers className="h-3.5 w-3.5" />,
    }));
  }, [sections]);

  if (!isOpen) return null;

  const processAndAddCapabilities = (rawText: string): boolean => {
    const text = rawText.trim();
    if (!text) return false;

    if (/[^\p{L}\p{N}\s,\-_/&.+()]/u.test(text)) {
      setCapabilityError("Only , separated or tab separated values are allowed.");
      return false;
    }

    let tokens: string[] = [];
    if (text.includes(",")) {
      tokens = text.split(",");
    } else if (text.includes("\t")) {
      tokens = text.split("\t");
    } else if (text.includes("\n")) {
      tokens = text.split(/\r?\n/);
    } else if (text.includes(" ")) {
      tokens = text.split(/\s+/);
    } else {
      tokens = [text];
    }

    const existingLower = new Set(capabilities.map((c) => c.toLowerCase()));
    const toAdd: string[] = [];

    for (const token of tokens) {
      const trimmed = token.trim();
      if (trimmed && !existingLower.has(trimmed.toLowerCase())) {
        existingLower.add(trimmed.toLowerCase());
        toAdd.push(trimmed);
      }
    }

    if (toAdd.length > 0) {
      setCapabilities((prev) => [...prev, ...toAdd]);
    }

    setCapabilityInput("");
    setCapabilityError(null);
    return true;
  };

  const handleAddCapability = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!capabilityInput.trim()) return;
    processAndAddCapabilities(capabilityInput);
  };

  const handlePasteCapability = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");
    if (!pastedText || !pastedText.trim()) return;
    e.preventDefault();
    const success = processAndAddCapabilities(pastedText);
    if (!success) {
      setCapabilityInput(pastedText);
    }
  };

  const handleRemoveCapability = (index: number) => {
    setCapabilities((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please provide a name for this custom agent.");
      return;
    }
    if (!role.trim()) {
      setError("Please specify the agent's professional role or title.");
      return;
    }
    if (!sectionId) {
      setError("Please select an operational department / section.");
      return;
    }
    if (!workspaceId) {
      setError("Active workspace identifier is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: CreateCustomAgentPayload = {
        workspaceId,
        name: name.trim(),
        role: role.trim(),
        sectionId,
        summary: summary.trim() || undefined,
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        capabilities: capabilities.length > 0 ? capabilities : undefined,
        userId,
      };

      const created = await apiCreateCustomAgent(payload);
      onAgentCreated(created);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create custom agent.";
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
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Create Custom Team Specialist
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-primary-muted text-primary border border-primary-border whitespace-nowrap shrink-0">
                  User Created
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Architect and deploy a bespoke AI agent specifically designed for your squad mandates.
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

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Name & Role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Agent Specialist Name <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Infrastructure Security Sentinel"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Role / Specialization Title <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Senior Cloud Compliance Engineer"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all"
                required
              />
            </div>
          </div>

          {/* Department / Section Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Department / Operational Domain <span className="text-primary">*</span>
            </label>
            <CustomDropdown
              options={sectionOptions}
              value={sectionId}
              onChange={(val) => setSectionId(val)}
              placeholder="Select an operational department..."
              loading={isLoadingSections}
              loadingText="Loading departments from database..."
              emptyText="No departments available in database."
              icon={<Layers className="h-4 w-4" />}
            />
          </div>

          {/* Core Mandate / Summary */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Core Purpose / Executive Summary
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Continuously audits multi-cloud deployments for IAM anomalies and CIS benchmarks."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all"
            />
          </div>

          {/* Capabilities Tag Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Core Capabilities & Proficiencies
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={capabilityInput}
                onChange={(e) => {
                  setCapabilityInput(e.target.value);
                  if (capabilityError) setCapabilityError(null);
                }}
                onPaste={handlePasteCapability}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCapability();
                  }
                }}
                placeholder="Type or paste capabilities (comma or space separated) and press Add"
                className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => handleAddCapability()}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Add
              </button>
            </div>

            {capabilityError && (
              <p className="text-[11px] font-medium text-red-500 dark:text-red-400">
                {capabilityError}
              </p>
            )}

            {capabilities.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {capabilities.map((cap, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-primary-muted text-primary border border-primary-border"
                  >
                    {cap}
                    <button
                      type="button"
                      onClick={() => handleRemoveCapability(idx)}
                      className="hover:text-red-500 transition-colors cursor-pointer"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Directives / System Prompt */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Operating Directives & System Instructions
              </label>
              <span className="text-[11px] text-slate-400">Optional</span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define behavioral rules, execution policies, tone, and step-by-step guidance for this agent..."
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-xs focus:ring-2 focus:ring-primary-ring focus:border-primary focus:outline-none transition-all resize-none"
            />
          </div>
        </form>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !name.trim() || !role.trim() || !sectionId}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-fg shadow-md transition-all cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deploying Agent...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Create Specialist
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

