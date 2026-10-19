"use client";

import React, { useEffect, useState, useCallback } from "react";
import { VyraBannerCard } from "./VyraBannerCard";
import { IntelligenceSection } from "./IntelligenceSection";
import { PersonalityInstructionsSection } from "./PersonalityInstructionsSection";
import { TestPreviewSection } from "./TestPreviewSection";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  apiGetAIProviders,
  apiGetProviderModels,
  apiGetVyraSettings,
  apiUpdateVyraSettings,
  apiTestConnection,
  apiTestVyraPrompt,
  type AIProvider,
  type AIProviderModel,
  type VyraSettings,
  type VyraInstructions,
  type VyraTemplate,
} from "@/lib/api";
import { Check, Loader2, Save } from "lucide-react";

export const VyraSettingsPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [vyraSettings, setVyraSettings] = useState<VyraSettings | null>(null);

  // Active state
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<AIProviderModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>("");
  const [keyStatus, setKeyStatus] = useState<string>("");
  const [isValidKey, setIsValidKey] = useState<boolean>(false);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [instructions, setInstructions] = useState<VyraInstructions>({
    core: "",
    behaviour: "",
    knowledge: "",
    boundaries: "",
    responseStyle: "",
  });
  const [previewMode, setPreviewMode] = useState<"chat" | "structured">("chat");

  // Save state
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Load from DB
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [fetchedProviders, fetchedSettings] = await Promise.all([
        apiGetAIProviders(),
        apiGetVyraSettings(currentWorkspace?.id),
      ]);

      if (fetchedProviders && fetchedProviders.length > 0) {
        setProviders(fetchedProviders);
      }

      if (fetchedSettings) {
        setVyraSettings(fetchedSettings);
        const provId = fetchedSettings.selectedProviderId || "";
        setSelectedProviderId(provId);
        setSelectedModelId(fetchedSettings.selectedModelId || "");
        setApiKey(fetchedSettings.apiKey || "");
        setKeyStatus(fetchedSettings.keyStatus || "");
        setIsValidKey(fetchedSettings.isValidKey ?? false);
        if (fetchedSettings.instructions) {
          setInstructions({
            core: fetchedSettings.instructions.core || "",
            behaviour: fetchedSettings.instructions.behaviour || "",
            knowledge: fetchedSettings.instructions.knowledge || "",
            boundaries: fetchedSettings.instructions.boundaries || "",
            responseStyle: fetchedSettings.instructions.responseStyle || "",
          });
        }
        if (fetchedSettings.previewMode) {
          setPreviewMode(fetchedSettings.previewMode as "chat" | "structured");
        }

        // Fetch models for the saved provider if one is set
        if (provId && fetchedSettings.apiKey) {
          setIsLoadingModels(true);
          try {
            const models = await apiGetProviderModels(provId, fetchedSettings.apiKey);
            setAvailableModels(models);
          } finally {
            setIsLoadingModels(false);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load settings from database:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentWorkspace?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const lastFetchRef = React.useRef<string>("");

  const fetchModels = useCallback(
    async (providerId: string, key: string, force = false) => {
      if (!providerId || !key.trim()) return;
      const cacheKey = `${providerId}:${key.trim()}`;
      if (!force && lastFetchRef.current === cacheKey && availableModels.length > 0) return;
      lastFetchRef.current = cacheKey;

      setIsLoadingModels(true);
      try {
        const models = await apiGetProviderModels(providerId, key.trim());
        setAvailableModels(models);
        if (models.length > 0 && selectedModelId && !models.some((m) => m.id === selectedModelId)) {
          setSelectedModelId("");
        }
      } catch (err) {
        console.error("Failed to load models for provider:", err);
        setAvailableModels([]);
      } finally {
        setIsLoadingModels(false);
      }
    },
    [availableModels.length, selectedModelId]
  );

  const handleApiKeyBlur = () => {
    if (selectedProviderId && apiKey.trim()) {
      fetchModels(selectedProviderId, apiKey.trim());
    }
  };

  const handleOpenModelSelection = () => {
    if (selectedProviderId && apiKey.trim() && availableModels.length === 0 && !isLoadingModels) {
      fetchModels(selectedProviderId, apiKey.trim());
    }
  };

  // Fetch models dynamically from provider route when selectedProviderId changes
  const handleSelectProvider = async (providerId: string) => {
    if (providerId === selectedProviderId) return;

    setSelectedProviderId(providerId);
    setSelectedModelId(""); // Reset model until new provider's models load
    setAvailableModels([]);
    lastFetchRef.current = "";

    const prov = providers.find((p) => p.id === providerId);
    const keyToUse = prov?.apiKey?.trim() ? prov.apiKey.trim() : apiKey.trim();
    if (prov?.apiKey) {
      setApiKey(prov.apiKey);
    }

    if (keyToUse) {
      fetchModels(providerId, keyToUse, true);
    }
  };

  // Handle Save
  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const updated = await apiUpdateVyraSettings(currentWorkspace?.id, {
        selectedProviderId,
        selectedModelId,
        apiKey,
        keyStatus,
        isValidKey,
        instructions,
        previewMode,
      });
      if (updated) {
        setVyraSettings(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 2500);
      }
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Test Connection
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      const res = await apiTestConnection({
        providerId: selectedProviderId,
        apiKey,
        modelId: selectedModelId,
      });
      setKeyStatus(res.message);
      setIsValidKey(res.success);

      // Auto-persist updated connection state to DB
      await apiUpdateVyraSettings(currentWorkspace?.id, {
        selectedProviderId,
        selectedModelId,
        apiKey,
        keyStatus: res.message,
        isValidKey: res.success,
      });

      // If connection succeeded, refresh models dynamically from provider's live endpoint
      if (res.success && selectedProviderId && apiKey.trim()) {
        fetchModels(selectedProviderId, apiKey.trim(), true);
      }
    } catch {
      setKeyStatus("Connection test failed");
      setIsValidKey(false);
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Apply template
  const handleApplyTemplate = (template: VyraTemplate) => {
    if (template?.instructions) {
      setInstructions(template.instructions);
    }
  };

  // Execute test prompt
  const handleExecutePrompt = async (prompt: string, mode: "chat" | "structured") => {
    const res = await apiTestVyraPrompt({
      prompt,
      providerId: selectedProviderId,
      modelId: selectedModelId,
      apiKey: apiKey.trim(),
      mode,
      systemPrompt: instructions.core,
    });
    return {
      output: res.output,
      structuredOutput: res.structuredOutput,
      tokensUsed: res.tokensUsed,
      latencyMs: res.latencyMs,
    };
  };

  if (isLoading) {
    return (
      <div className="w-full h-full min-h-[70vh] flex flex-col items-center justify-center p-8 space-y-3">
        <div className="w-10 h-10 rounded-full border-3 border-[#8a2be2] dark:border-[#c084fc] border-t-transparent animate-spin" />
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Loading VYRA Agent Configuration...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full px-5 sm:px-8 xl:px-10 py-5 sm:py-7 space-y-6">
      {/* Top Banner & Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/80 dark:border-[#1d273f]">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-purple-100 dark:bg-[#201538] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/80 dark:border-[#7c3aed]/40">
              Agent Orchestration
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Enterprise Configuration
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
            VYRA Agent Settings
          </h1>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-[#8a2be2] hover:bg-[#7823c9] text-white text-xs font-bold transition-all shadow-md shadow-[#8a2be2]/30 flex items-center gap-2 cursor-pointer disabled:opacity-60 active:scale-95"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saveSuccess ? "Saved to Database" : isSaving ? "Saving..." : "Save Changes"}</span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout (Matching the Reference Image exactly) */}
      <div className="w-full flex flex-col lg:flex-row items-start gap-5 xl:gap-6">
        {/* Left Column: Cybernetic VYRA Banner Card */}
        <VyraBannerCard
          quote={vyraSettings?.quote}
          traits={vyraSettings?.traits}
        />

        {/* Right Column: 01, 02, 03 Sections */}
        <div className="flex-1 w-full space-y-5 xl:space-y-6 min-w-0">
          {/* 01: Intelligence & Provider Selection */}
          <IntelligenceSection
            providers={providers}
            selectedProviderId={selectedProviderId}
            onSelectProvider={handleSelectProvider}
            availableModels={availableModels}
            isLoadingModels={isLoadingModels}
            selectedModelId={selectedModelId}
            onSelectModel={setSelectedModelId}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            onApiKeyBlur={handleApiKeyBlur}
            onOpenModelSelection={handleOpenModelSelection}
            keyStatus={keyStatus}
            isValidKey={isValidKey}
            onTestConnection={handleTestConnection}
            isTestingConnection={isTestingConnection}
          />

          {/* 02: Personality & Instructions */}
          <PersonalityInstructionsSection
            instructions={instructions}
            onInstructionsChange={setInstructions}
            templates={vyraSettings?.templates || []}
            onApplyTemplate={handleApplyTemplate}
          />

          {/* 03: Test & Preview */}
          <TestPreviewSection
            previewMode={previewMode}
            onPreviewModeChange={setPreviewMode}
            onExecutePrompt={handleExecutePrompt}
          />
        </div>
      </div>
    </div>
  );
};
