"use client";

import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, FileText, X } from "lucide-react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import type { ExportFormat } from "@/lib/api/discussions";
import { AgentActivity } from "./AgentActivity";
import { ExportMenu } from "./ExportMenu";
import { MessageSources } from "./MessageSources";
import { documentOf, handoffTask, isSaved, type ChatMessage } from "./discussionView";

interface ReplyViewerProps {
  /** The replies the viewer moves between, in order: a turn's handoffs, or a single document. */
  replies: ChatMessage[];
  /** The one shown; null keeps the viewer closed. */
  openId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
  onExport: (message: ChatMessage, format: ExportFormat) => Promise<void>;
}

/**
 * Reads a handoff or a document in full: what the lead assigned, the steps the agent took, the reply and its
 * sources. A reply still being written updates live. Arrow keys or the buttons move between replies; Escape
 * closes.
 */
export function ReplyViewer({ replies, openId, onNavigate, onClose, onExport }: ReplyViewerProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const index = replies.findIndex((message) => message.id === openId);
  const message = index >= 0 ? replies[index] : null;
  const previous = index > 0 ? replies[index - 1] : null;
  const next = index >= 0 && index < replies.length - 1 ? replies[index + 1] : null;

  useEffect(() => {
    if (!message) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && previous) onNavigate(previous.id);
      else if (event.key === "ArrowRight" && next) onNavigate(next.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [message, previous, next, onClose, onNavigate]);

  // Focus moves into the viewer when it opens, so the keyboard and screen readers follow.
  const isOpen = Boolean(message);
  useEffect(() => {
    if (isOpen) dialog.current?.focus();
  }, [isOpen]);

  if (!message) return null;
  const task = handoffTask(message);
  const docInfo = documentOf(message);
  const title = docInfo ? docInfo.title : `${message.sender}'s handoff`;
  const subtitle = [
    docInfo ? message.sender : null,
    message.senderRole,
    task?.leadName ? `assigned by ${task.leadName}` : null,
    docInfo?.fileName ? `saved as ${docInfo.fileName}` : null,
    message.timestamp,
  ].filter(Boolean).join(" · ");
  const Icon = docInfo ? FileText : ClipboardList;
  const navigationLabel = (target: ChatMessage) => documentOf(target)?.title ?? target.sender;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reply-viewer-title"
        className="w-full max-w-3xl max-h-full flex flex-col bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden outline-none animate-in zoom-in-95 duration-150"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-bold text-sm bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100" aria-hidden="true">
              {docInfo ? <FileText className="h-4 w-4 text-primary" /> : message.senderAvatarLetter}
            </div>
            <div className="min-w-0">
              <h2 id="reply-viewer-title" className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{title}</h2>
              <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ExportMenu onExport={(format) => onExport(message, format)} disabled={!isSaved(message)} label={`Export ${title}`} />
            <IconOnlyButton onClick={onClose} className="p-1 rounded-lg" aria-label="Close viewer" icon={<X className="w-4 h-4" />} />
          </div>
        </header>

        {task?.task && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex gap-2.5 text-xs">
            <Icon className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" aria-hidden="true" />
            <div>
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Assignment</span>
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{task.task}</p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-xs text-slate-800 dark:text-slate-200">
          {message.activity && message.activity.length > 0 && <AgentActivity steps={message.activity} live={Boolean(message.streaming)} />}
          {message.content ? <MarkdownContent content={message.content} /> : <p className="text-slate-400">The reply is on its way…</p>}
          {message.sources && <MessageSources sources={message.sources} idPrefix={message.id} />}
        </div>

        {replies.length > 1 && (
          <footer className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-[#0e1422] text-[11px] text-slate-500 dark:text-slate-400">
            <button
              type="button"
              disabled={!previous}
              onClick={() => previous && onNavigate(previous.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" /> {previous ? navigationLabel(previous) : "Previous"}
            </button>
            <span aria-live="polite">{index + 1} of {replies.length}</span>
            <button
              type="button"
              disabled={!next}
              onClick={() => next && onNavigate(next.id)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {next ? navigationLabel(next) : "Next"} <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
