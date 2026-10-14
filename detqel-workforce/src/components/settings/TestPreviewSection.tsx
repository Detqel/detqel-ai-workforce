import React, { useState } from "react";
import { User, Send, ChevronRight, Loader2, Sparkles, X, Terminal, Check } from "lucide-react";
import type { SamplePrompt } from "@/lib/api";

interface TestPreviewSectionProps {
  samplePrompts: SamplePrompt[];
  previewMode: "chat" | "structured";
  onPreviewModeChange: (mode: "chat" | "structured") => void;
  onExecutePrompt: (prompt: string, mode: "chat" | "structured") => Promise<{
    output: string;
    structuredOutput?: Record<string, unknown>;
    tokensUsed: number;
    latencyMs: number;
  }>;
}

const DEFAULT_FALLBACK_PROMPTS: SamplePrompt[] = [
  {
    id: "summarize",
    title: "Summarize a document",
    prompt: "Summarize the latest quarterly operations review and extract top 3 friction points.",
  },
  {
    id: "sql",
    title: "Write a SQL query",
    prompt: "Write an optimized SQL query to calculate 30-day user retention cohorts with active workspace counts.",
  },
  {
    id: "analyze",
    title: "Analyze this data",
    prompt: "Analyze our inventory turnover velocity across retail warehouses and flag critical stockout risks.",
  },
  {
    id: "pipeline",
    title: "Create a pipeline",
    prompt: "Create an autonomous pipeline to sync Shopify webhooks into the Business Brain knowledge base.",
  },
];

export const TestPreviewSection: React.FC<TestPreviewSectionProps> = ({
  samplePrompts,
  previewMode,
  onPreviewModeChange,
  onExecutePrompt,
}) => {
  const activePrompts = samplePrompts && samplePrompts.length > 0 ? samplePrompts : DEFAULT_FALLBACK_PROMPTS;
  const [promptInput, setPromptInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [testResponse, setTestResponse] = useState<{
    prompt: string;
    output: string;
    structuredOutput?: Record<string, unknown>;
    tokensUsed: number;
    latencyMs: number;
  } | null>(null);

  const handleSubmit = async (promptToRun?: string) => {
    const text = (promptToRun !== undefined ? promptToRun : promptInput).trim();
    if (!text || isLoading) return;

    setIsLoading(true);
    try {
      const res = await onExecutePrompt(text, previewMode);
      setTestResponse({
        prompt: text,
        ...res,
      });
      if (promptToRun !== undefined) {
        setPromptInput(promptToRun);
      }
    } catch {
      setTestResponse({
        prompt: text,
        output: "Failed to generate response. Please verify agent settings and connectivity.",
        tokensUsed: 0,
        latencyMs: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChipClick = (prompt: SamplePrompt) => {
    handleSubmit(prompt.prompt || prompt.title);
  };

  return (
    <div className="w-full p-5 sm:p-6 rounded-3xl bg-white/95 dark:bg-[#0c1222]/90 border border-slate-200/90 dark:border-[#1c273e] shadow-sm dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl transition-all duration-300 relative z-0">
      {/* Header */}
      <div className="w-full flex items-center justify-between pb-4 sm:pb-5">
        <div className="flex items-center gap-3">
          <div className="w-8.5 h-8.5 rounded-xl flex items-center justify-center font-bold text-xs bg-purple-100 dark:bg-[#1e1335] text-[#8a2be2] dark:text-[#c084fc] border border-purple-200/70 dark:border-[#7c3aed]/40 shadow-xs">
            03
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
              Test &amp; Preview
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Try a sample prompt to see how VYRA responds.
            </p>
          </div>
        </div>

        {/* View mode toggle: [Chat Preview] [Structured Output] */}
        <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-[#111728] border border-slate-200/80 dark:border-[#1d273f]">
          <button
            type="button"
            onClick={() => onPreviewModeChange("chat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              previewMode === "chat"
                ? "bg-purple-100 dark:bg-[#201538] text-[#8a2be2] dark:text-[#c084fc] shadow-2xs font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Chat Preview
          </button>
          <button
            type="button"
            onClick={() => onPreviewModeChange("structured")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              previewMode === "structured"
                ? "bg-purple-100 dark:bg-[#201538] text-[#8a2be2] dark:text-[#c084fc] shadow-2xs font-bold"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            Structured Output
          </button>
        </div>
      </div>

      {/* Main Input Box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        className="w-full h-12 rounded-2xl bg-slate-50 dark:bg-[#0c1220] border border-slate-200/90 dark:border-[#1d2941] focus-within:border-[#8a2be2] dark:focus-within:border-[#8a2be2] flex items-center px-3 gap-2.5 transition-colors shadow-2xs"
      >
        {/* User icon */}
        <div className="w-7 h-7 rounded-full bg-slate-200/80 dark:bg-[#162137] flex items-center justify-center text-slate-500 dark:text-slate-400 shrink-0">
          <User className="w-4 h-4" />
        </div>

        {/* Prompt input */}
        <input
          type="text"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder="Ask VYRA anything..."
          className="flex-1 bg-transparent text-xs sm:text-[13px] text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-hidden border-none focus:ring-0"
        />

        {/* Send button */}
        <button
          type="submit"
          disabled={!promptInput.trim() || isLoading}
          aria-label="Send prompt to VYRA"
          className="w-8 h-8 rounded-full bg-[#8a2be2] hover:bg-[#7823c9] text-white flex items-center justify-center shadow-md shadow-[#8a2be2]/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-95 shrink-0"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : (
            <Send className="w-3.5 h-3.5 -translate-x-px translate-y-px" />
          )}
        </button>
      </form>

      {/* Sample Prompt Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-3">
        {activePrompts.map((sample) => (
          <button
            key={sample.id}
            type="button"
            onClick={() => handleChipClick(sample)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100/70 hover:bg-purple-50 dark:bg-[#101728] dark:hover:bg-[#182136] border border-slate-200/80 dark:border-[#1e2a42] text-slate-700 dark:text-slate-300 hover:text-[#8a2be2] dark:hover:text-[#c084fc] transition-colors cursor-pointer group shadow-2xs"
          >
            <span>{sample.title}</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 group-hover:text-[#8a2be2] dark:group-hover:text-[#c084fc] group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>

      {/* Interactive Output Preview Panel */}
      {testResponse && (
        <div className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#090e1a] border border-purple-200/70 dark:border-[#8a2be2]/30 animate-in fade-in slide-in-from-top-2 duration-200 relative">
          {/* Top header of response */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/60 dark:border-[#1a253d]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                VYRA Response
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 dark:bg-[#8a2be2]/20 text-[#8a2be2] dark:text-[#c084fc] font-semibold">
                {testResponse.latencyMs}ms · {testResponse.tokensUsed} tokens
              </span>
            </div>

            <button
              type="button"
              onClick={() => setTestResponse(null)}
              className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Response body */}
          {previewMode === "structured" ? (
            <pre className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-white/70 dark:bg-[#070b14] p-3 rounded-xl overflow-x-auto border border-slate-200/70 dark:border-[#162238] max-h-60">
              {testResponse.output}
            </pre>
          ) : (
            <div className="text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
              {testResponse.output}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
