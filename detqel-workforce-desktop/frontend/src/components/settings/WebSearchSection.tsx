import React, { useId, useState } from "react";
import { CheckCircle2, Eye, EyeOff, Globe, Loader2 } from "lucide-react";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { IconOnlyButton } from "@/components/ui/icon-only-button";

interface WebSearchSectionProps {
  apiKey: string;
  /** A Tavily key is saved on the server; it can be used without being typed again. */
  hasSavedKey: boolean;
  /** Last characters of the saved key, when it is long enough to show any. */
  savedKeyHint?: string | null;
  onApiKeyChange: (key: string) => void;
  keyStatus: string;
  isValidKey: boolean;
  onTestConnection: () => Promise<void>;
  isTestingConnection: boolean;
}

/** 04: the Tavily key agents use to search the web in Expert mode. */
export const WebSearchSection: React.FC<WebSearchSectionProps> = ({
  apiKey,
  hasSavedKey,
  savedKeyHint,
  onApiKeyChange,
  keyStatus,
  isValidKey,
  onTestConnection,
  isTestingConnection,
}) => {
  const [showKey, setShowKey] = useState<boolean>(false);
  const inputId = useId();
  const hasUsableKey = Boolean(apiKey.trim()) || hasSavedKey;

  return (
    <div className="w-full p-5 sm:p-6 rounded-3xl bg-white/95 dark:bg-[#0c1222]/90 border border-slate-200/90 dark:border-[#1c273e] shadow-sm dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 relative z-10">
      {/* Header */}
      <div className="w-full flex items-center justify-between pb-4 sm:pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center font-bold text-xs bg-purple-100 dark:bg-[#1e1335] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/70 dark:border-[#7c3aed]/40 shadow-xs">
            04
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
              Web Search
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Let agents search the web in Expert mode, with cited sources.
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-purple-50 dark:bg-[#151128] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/70 dark:border-[#382660]">
          <Globe className="w-3.5 h-3.5 text-[#8a2be2] dark:text-[#c084fc]" aria-hidden="true" />
          <span>Powered by Tavily</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-2 border-t border-slate-100 dark:border-[#182236]">
        <div className="flex flex-col space-y-1.5 pt-2">
          <label htmlFor={inputId} className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Tavily API Key
          </label>

          <div className="relative flex items-center">
            <input
              id={inputId}
              type={showKey ? "text" : "password"}
              value={apiKey}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder={
                hasSavedKey
                  ? `Saved key in use${savedKeyHint ? ` (…${savedKeyHint})` : ""} · enter a new key to replace it`
                  : "Enter Tavily API key (tvly-...)"
              }
              className="w-full h-11 pl-3.5 pr-10 rounded-xl bg-slate-50 dark:bg-[#101729] border border-slate-200 dark:border-[#202c46] focus:border-[#8a2be2] focus:ring-1 focus:ring-[#8a2be2] text-xs font-mono text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 transition-colors outline-hidden cursor-text"
            />
            <IconOnlyButton
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? "Hide Tavily API key" : "Show Tavily API key"}
              className="absolute right-3 p-1"
              icon={showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            />
          </div>

          {/* Status badge & Test Connection button */}
          <div className="flex items-center justify-between pt-1 min-h-[30px]">
            <div role="status" aria-live="polite">
              {keyStatus.trim() ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${isValidKey ? "text-emerald-500" : "text-amber-500"}`} aria-hidden="true" />
                  <span className={`text-[11px] font-medium ${isValidKey ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {keyStatus}
                  </span>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {hasSavedKey ? "Key saved · not tested yet" : "Key not connected"}
                </span>
              )}
            </div>

            <SecondaryButton
              onClick={onTestConnection}
              disabled={isTestingConnection || !hasUsableKey}
              value="Test Connection"
              icon={isTestingConnection ? <Loader2 className="w-3 h-3 animate-spin text-[#8a2be2]" /> : undefined}
              iconPosition="left"
            />
          </div>
        </div>

        <div className="flex flex-col justify-center space-y-1.5 pt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          <p>
            Turn on <span className="font-semibold text-slate-700 dark:text-slate-300">Web</span> in an Expert discussion and agents ground their answers in live search results.
          </p>
          <p>
            The key is stored encrypted, is never shown again, and is sent only to Tavily. Each search uses Tavily credits, and testing the key uses one.
          </p>
        </div>
      </div>
    </div>
  );
};
