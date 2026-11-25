"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUp,
  Brain,
  CheckCheck,
  FileText,
  Loader2,
  MessageSquareMore,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import {
  BRAIN_QUICK_SUGGESTIONS,
  type BrainAssistantMessage,
} from "@/constants/brainConstants";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import { ACTION_ICON_MAP, CAPABILITY_ICON_MAP } from "./brainIcons";

interface BrainAssistantPanelProps {
  messages: BrainAssistantMessage[];
  userInitials: string;
  isResponding: boolean;
  isDragging?: boolean;
  onSendMessage: (prompt: string, attachments?: string[]) => void;
}

export const BrainAssistantPanel: React.FC<BrainAssistantPanelProps> = ({
  messages,
  userInitials,
  isResponding,
  isDragging = false,
  onSendMessage,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    if (!hasInteractedRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isResponding]);

  const triggerSend = (prompt: string, files: string[] = []) => {
    const trimmed = prompt.trim();
    if (!trimmed || isResponding) return;
    hasInteractedRef.current = true;
    onSendMessage(trimmed, files.length > 0 ? files : undefined);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    const text =
      inputValue.trim() ||
      `Analyze attached file${attachedFiles.length > 1 ? "s" : ""}: ${attachedFiles.join(", ")}`;
    const filesToSend = [...attachedFiles];
    setInputValue("");
    setAttachedFiles([]);
    triggerSend(text, filesToSend);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setAttachedFiles((prev) => {
      const merged = new Set([...prev, ...files.map((file) => file.name)]);
      return Array.from(merged);
    });
  };

  const removeAttachedFile = (fileName: string) => {
    setAttachedFiles((prev) => prev.filter((name) => name !== fileName));
  };

  return (
    <aside
      aria-label="Business Brain Assistant"
      className={`@container w-full lg:w-[var(--brain-right-width,400px)] lg:min-w-[var(--brain-min-width,380px)] shrink-0 bg-white dark:bg-[#182234] border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col lg:h-full overflow-hidden ${
        isDragging ? "transition-none" : "transition-colors"
      }`}
    >
      {/* Assistant Header */}
      <header className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-primary text-primary-fg flex items-center justify-center shrink-0 shadow-xs">
          <MessageSquareMore className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight">
            Business Brain Assistant
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
            Your AI partner for business intelligence and action.
          </p>
        </div>
      </header>

      {/* Scrollable Conversation Thread */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Assistant messages"
        className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4 min-h-[340px]"
      >
        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="flex items-start justify-end gap-2.5">
                <div className="flex flex-col items-end max-w-[85%] lg:max-w-xl min-w-0">
                  <div className="rounded-2xl rounded-tr-sm px-4 py-2.5 bg-primary-muted border border-primary-border text-xs font-medium text-slate-900 dark:text-slate-100 leading-relaxed select-text cursor-text">
                    {message.attachments && message.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {message.attachments.map((fileName) => (
                          <span
                            key={fileName}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 dark:bg-[#131c2d] border border-primary-border text-[10px] font-semibold text-primary"
                          >
                            <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span className="truncate max-w-[140px]">{fileName}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <p>{message.content}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                    <span>{message.timestamp}</span>
                    <CheckCheck className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  </div>
                </div>

                <div
                  aria-hidden="true"
                  className="w-8 h-8 rounded-full bg-primary text-primary-fg flex items-center justify-center text-[11px] font-bold shrink-0 shadow-xs mt-0.5"
                >
                  {userInitials}
                </div>
              </div>
            );
          }

          const MetricIcon = message.metricCard
            ? CAPABILITY_ICON_MAP[message.metricCard.icon]
            : null;
          const isNegativeDelta = message.metricCard?.deltaValue.startsWith("-") ?? false;

          return (
            <div key={message.id} className="flex items-start justify-start gap-2.5">
              <div
                aria-hidden="true"
                className="w-8 h-8 rounded-xl bg-primary-muted border border-primary-border text-primary flex items-center justify-center shrink-0 mt-0.5"
              >
                <Brain className="w-4.5 h-4.5" />
              </div>

              <div className="flex-1 min-w-0 max-w-full lg:max-w-2xl rounded-2xl rounded-tl-sm bg-slate-50/90 dark:bg-[#131c2d] border border-slate-200/80 dark:border-slate-800 p-4 space-y-3.5 text-xs text-slate-700 dark:text-slate-200 select-text cursor-text">
                <p className="leading-relaxed">{message.content}</p>

                {message.metricCard && MetricIcon && (
                  <div className="grid grid-cols-1 @xs:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-3 bg-white dark:bg-[#182234] border border-slate-200/80 dark:border-slate-800 rounded-xl p-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-primary-muted text-primary border border-primary-border flex items-center justify-center shrink-0">
                        <MetricIcon className="w-4 h-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-base font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-100 leading-tight">
                          {message.metricCard.primaryValue}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {message.metricCard.primaryLabel}
                        </div>
                      </div>
                    </div>

                    <div className="@xs:border-l @xs:border-slate-100 dark:@xs:border-slate-800 @xs:pl-3 flex flex-col justify-center min-w-0">
                      <div
                        className={`inline-flex items-center gap-1 text-sm font-bold tabular-nums leading-tight ${
                          isNegativeDelta
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {isNegativeDelta ? (
                          <ArrowDownRight className="w-3.5 h-3.5 stroke-[2.5] shrink-0" aria-hidden="true" />
                        ) : (
                          <ArrowUp className="w-3.5 h-3.5 stroke-[2.5] shrink-0" aria-hidden="true" />
                        )}
                        <span>{message.metricCard.deltaValue}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {message.metricCard.deltaLabel}
                      </div>
                    </div>
                  </div>
                )}

                {message.insights && message.insights.length > 0 && (
                  <div className="space-y-1.5">
                    {message.insightsTitle && (
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {message.insightsTitle}
                      </h3>
                    )}
                    <ul className="space-y-1.5">
                      {message.insights.map((insight) => (
                        <li key={insight} className="flex items-start gap-2 leading-relaxed">
                          <span
                            aria-hidden="true"
                            className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1.5"
                          />
                          <span>{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {message.actions && message.actions.length > 0 && (
                  <div className="space-y-2 pt-0.5 select-none">
                    {message.actionsTitle && (
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {message.actionsTitle}
                      </h3>
                    )}
                    <div className="flex flex-col items-start gap-2">
                      {message.actions.map((action) => {
                        const ActionIcon = ACTION_ICON_MAP[action.icon];
                        return (
                          <button
                            key={action.id}
                            type="button"
                            disabled={isResponding}
                            onClick={() => triggerSend(action.prompt)}
                            className="max-w-full inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white dark:bg-[#182234] border border-primary-border hover:border-primary hover:bg-primary-muted text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-primary transition-all cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
                          >
                            <ActionIcon className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
                            <span>{action.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isResponding && (
          <div className="flex items-center gap-2.5" role="status" aria-live="polite">
            <div
              aria-hidden="true"
              className="w-8 h-8 rounded-xl bg-primary-muted border border-primary-border text-primary flex items-center justify-center shrink-0"
            >
              <Brain className="w-4.5 h-4.5" />
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-slate-50/90 dark:bg-[#131c2d] border border-slate-200/80 dark:border-slate-800 px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />
              <span>Analyzing business telemetry...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Composer & Quick Suggestion Chips */}
      <footer className="p-4 pt-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#182234] shrink-0 space-y-2.5">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachedFiles.map((fileName) => (
              <span
                key={fileName}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary-muted border border-primary-border text-[11px] font-medium text-primary"
              >
                <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-[160px]">{fileName}</span>
                <button
                  type="button"
                  onClick={() => removeAttachedFile(fileName)}
                  aria-label={`Remove ${fileName}`}
                  className="hover:text-primary-hover cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/80 dark:bg-[#131c2d] p-1.5 pl-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary-ring transition-all"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload business context files"
          />

          <IconOnlyButton
            onClick={() => fileInputRef.current?.click()}
            disabled={isResponding}
            aria-label="Attach file"
            title="Attach file"
            className="shrink-0 text-slate-400 hover:text-primary"
            icon={<Paperclip className="w-4 h-4" />}
          />

          <input
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            disabled={isResponding}
            placeholder="Ask anything about your business..."
            aria-label="Ask anything about your business"
            className="flex-1 min-w-0 bg-transparent text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none py-1.5 disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={isResponding || (!inputValue.trim() && attachedFiles.length === 0)}
            aria-label="Send message"
            title="Send message"
            className="w-8 h-8 rounded-xl bg-primary hover:bg-primary-hover text-primary-fg flex items-center justify-center shrink-0 transition-all shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          {BRAIN_QUICK_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              disabled={isResponding}
              onClick={() => triggerSend(suggestion.prompt)}
              className="px-2.5 py-1 rounded-lg bg-slate-100/90 dark:bg-[#131c2d] hover:bg-primary-muted border border-slate-200/80 dark:border-slate-700/70 hover:border-primary-border text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-ring"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      </footer>
    </aside>
  );
};
