import React, { useState } from "react";
import { Check, ChevronDown, Eye, EyeOff, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { renderProviderIcon } from "./ProviderIcons";
import type { AIProvider, AIProviderModel } from "@/lib/api";

interface IntelligenceSectionProps {
  providers: AIProvider[];
  selectedProviderId: string;
  onSelectProvider: (providerId: string) => void;
  availableModels: AIProviderModel[];
  isLoadingModels?: boolean;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  keyStatus?: string;
  isValidKey?: boolean;
  onTestConnection: () => Promise<void>;
  isTestingConnection?: boolean;
}

export const IntelligenceSection: React.FC<IntelligenceSectionProps> = ({
  providers,
  selectedProviderId,
  onSelectProvider,
  availableModels = [],
  isLoadingModels = false,
  selectedModelId,
  onSelectModel,
  apiKey,
  onApiKeyChange,
  keyStatus = "Valid key · Connected successfully",
  isValidKey = true,
  onTestConnection,
  isTestingConnection = false,
}) => {
  const [showKey, setShowKey] = useState<boolean>(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState<boolean>(false);

  // Find currently selected provider
  const selectedProvider = selectedProviderId ? providers.find((p) => p.id === selectedProviderId) || null : null;

  // Currently selected model
  const currentModel = selectedModelId ? availableModels.find((m) => m.id === selectedModelId) || null : null;

  return (
    <div
      className={`w-full p-5 sm:p-6 rounded-3xl bg-white/95 dark:bg-[#0c1222]/90 border border-slate-200/90 dark:border-[#1c273e] shadow-sm dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 relative ${
        modelDropdownOpen ? "z-40" : "z-20"
      }`}
    >
      {/* Header */}
      <div className="w-full flex items-center justify-between pb-4 sm:pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center font-bold text-xs bg-purple-100 dark:bg-[#1e1335] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/70 dark:border-[#7c3aed]/40 shadow-xs">
            01
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
              Intelligence
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Choose the brain behind your agent.
            </p>
          </div>
        </div>

        {/* Top right pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-[#151128] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/70 dark:border-[#382660]">
          <Sparkles className="w-3.5 h-3.5 text-[#8a2be2] dark:text-[#c084fc]" />
          <span>Connect a provider to get started</span>
        </div>
      </div>

      {/* Provider Cards Grid or Empty State */}
      {providers.length === 0 ? (
        <div className="w-full py-7 px-4 mb-4 rounded-2xl border border-dashed border-slate-200 dark:border-[#1e2a42] bg-slate-50/60 dark:bg-[#0e1424]/60 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-[#1a1430] border border-purple-200/50 dark:border-[#382660] flex items-center justify-center text-[#8a2be2] dark:text-[#c084fc] mb-2.5">
            <Sparkles className="w-5 h-5 text-[#8a2be2] dark:text-[#c084fc]" />
          </div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            No providers configured
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 max-w-sm">
            No AI providers configured in the system. Add your preferred providers to begin orchestrating agents.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 pt-1 pb-5">
          {providers.map((provider) => {
            const isSelected = provider.id === selectedProviderId;

            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => onSelectProvider(provider.id)}
                className={`relative flex flex-col items-center justify-center py-4 px-2 rounded-2xl cursor-pointer transition-all duration-200 select-none group ${
                  isSelected
                    ? "bg-purple-50/70 dark:bg-[#14122d] border-2 border-[#8a2be2] dark:border-[#8a2be2] shadow-sm dark:shadow-[0_0_20px_rgba(138,43,226,0.35)]"
                    : "bg-slate-50/80 dark:bg-[#101728]/80 border border-slate-200/80 dark:border-[#1d273f] hover:border-slate-300 dark:hover:border-[#2a3855] hover:bg-slate-100/60 dark:hover:bg-[#141d32]"
                }`}
              >
                {/* Checkmark badge on selected card */}
                {isSelected && (
                  <div className="absolute top-2 right-2 w-4.5 h-4.5 rounded-full bg-[#8a2be2] text-white flex items-center justify-center shadow-xs">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </div>
                )}

                {/* Provider Icon */}
                <div className="w-8 h-8 flex items-center justify-center mb-2 transition-transform duration-200 group-hover:scale-105">
                  {renderProviderIcon(
                    provider.iconKey,
                    isSelected
                      ? "w-7 h-7 text-[#8a2be2] dark:text-white"
                      : "w-7 h-7 text-slate-700 dark:text-slate-300"
                  )}
                </div>

                {/* Provider Name */}
                <span
                  className={`text-xs font-semibold tracking-tight ${
                    isSelected
                      ? "text-[#8a2be2] dark:text-white font-bold"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {provider.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Row: Model selector (left) & API Key (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2 border-t border-slate-100 dark:border-[#182236]">
        {/* Left Column: Model Dropdown */}
        <div className="flex flex-col space-y-1.5 relative z-30">
          <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Model
          </label>

          <div className="relative z-30">
            <button
              type="button"
              disabled={isLoadingModels || !selectedProviderId || availableModels.length === 0}
              onClick={() => {
                if (availableModels.length > 0) {
                  setModelDropdownOpen((prev) => !prev);
                }
              }}
              className="w-full h-11 px-3.5 rounded-xl bg-slate-50 dark:bg-[#101729] border border-slate-200 dark:border-[#202c46] hover:border-[#8a2be2]/40 dark:hover:border-[#8a2be2]/60 flex items-center justify-between text-xs font-medium text-slate-900 dark:text-slate-100 transition-colors cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2.5 truncate">
                {selectedProvider && renderProviderIcon(selectedProvider.iconKey, "w-4.5 h-4.5 text-[#8a2be2] shrink-0")}
                <span className={`truncate ${currentModel ? "font-semibold text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500 font-normal"}`}>
                  {isLoadingModels
                    ? "Fetching models from provider..."
                    : currentModel?.name || (selectedProvider ? "Select model" : "Select a provider first")}
                </span>
              </div>
              {isLoadingModels ? (
                <Loader2 className="w-4 h-4 text-[#8a2be2] animate-spin shrink-0" />
              ) : (
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 ${
                    modelDropdownOpen ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>

            {/* Model Dropdown Menu */}
            {modelDropdownOpen && availableModels.length > 0 && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setModelDropdownOpen(false)}
                />
                <div className="absolute top-full left-0 right-0 mt-1.5 p-1.5 rounded-2xl bg-white dark:bg-[#11182c] border border-slate-200 dark:border-[#22304c] shadow-xl z-50 animate-in fade-in slide-in-from-top-1 duration-150 max-h-56 overflow-y-auto">
                  {availableModels.map((m) => {
                    const isModelActive = m.id === selectedModelId;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          onSelectModel(m.id);
                          setModelDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl transition-colors cursor-pointer flex flex-col ${
                          isModelActive
                            ? "bg-purple-50 dark:bg-[#8a2be2]/15 text-[#8a2be2] dark:text-[#c084fc]"
                            : "hover:bg-slate-50 dark:hover:bg-[#172238] text-slate-800 dark:text-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold">{m.name}</span>
                          {isModelActive && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                          {m.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Model Description text */}
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight pt-0.5 min-h-[16px]">
            {currentModel?.description || ""}
          </p>
        </div>

        {/* Right Column: API Key */}
        <div className="flex flex-col space-y-1.5">
          <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            API Key
          </label>

          <div className="relative flex items-center">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="Enter API key..."
              className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-slate-50 dark:bg-[#101729] border border-slate-200 dark:border-[#202c46] focus:border-[#8a2be2] focus:ring-1 focus:ring-[#8a2be2] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors outline-hidden"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              className="absolute right-3 p-1 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Status badge & Test Connection button */}
          <div className="flex items-center justify-between pt-1 min-h-[30px]">
            <div>
              {keyStatus?.trim() ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isValidKey ? "text-emerald-500" : "text-amber-500"}`} />
                  <span className={`text-[11px] font-medium ${isValidKey ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {keyStatus}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {selectedProvider ? "Key not connected" : ""}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={onTestConnection}
              disabled={isTestingConnection || !apiKey?.trim()}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#141e33] dark:hover:bg-[#1b2844] border border-slate-200 dark:border-[#22314e] text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            >
              {isTestingConnection && <Loader2 className="w-3 h-3 animate-spin text-[#8a2be2]" />}
              <span>Test Connection</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
