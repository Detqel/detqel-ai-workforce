"use client";

import React from "react";
import { CheckCircle2, ClipboardList, FileText, Loader2, PanelTopOpen } from "lucide-react";
import type { ExportFormat } from "@/lib/api/discussions";
import { stepLabel } from "./AgentActivity";
import { ExportMenu } from "./ExportMenu";
import { documentOf, formatDuration, handoffTask, isSaved, workedFor, type ChatMessage } from "./discussionView";

interface ReplyLineProps {
  message: ChatMessage;
  onView: () => void;
  onExport: (format: ExportFormat) => Promise<void>;
}

/**
 * A handoff or a document, folded into one line so the conversation stays short: who wrote what, its progress
 * while it is being written, and buttons to read it in the viewer or export it.
 */
export function ReplyLine({ message, onView, onExport }: ReplyLineProps) {
  const docInfo = documentOf(message);
  const task = handoffTask(message);
  const running = message.activity?.filter((step) => step.status === "running").at(-1);
  const duration = workedFor(message.activity);
  const status = message.streaming
    ? (running ? stepLabel(running) : "Working on it")
    : docInfo?.fileName
      ? `Saved as ${docInfo.fileName}`
      : `Done${duration > 0 ? ` · ${formatDuration(duration)}` : ""}`;
  const name = docInfo ? docInfo.title : message.sender;
  const Icon = docInfo ? FileText : ClipboardList;

  return (
    <div className="flex items-start gap-3 justify-start">
      <div className={`flex h-8 w-8 shrink-0 mt-0.5 items-center justify-center rounded-xl font-bold text-xs shadow-xs ${message.isLead ? "bg-amber-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100"}`} aria-hidden="true">
        {message.senderAvatarLetter}
      </div>
      <div className="max-w-xl w-full mr-12 flex items-center gap-3 rounded-2xl rounded-tl-none px-3.5 py-2.5 text-xs bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 shadow-xs">
        <Icon className={`h-4 w-4 shrink-0 ${docInfo ? "text-primary" : "text-slate-400"}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-slate-900 dark:text-slate-100 truncate" title={name}>{name}</span>
            <span className="text-[9px] font-bold px-1.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">
              {docInfo ? "Document" : "Handoff"}
            </span>
            {docInfo
              ? <span className="text-[10px] text-slate-400 truncate">by {message.sender}</span>
              : task?.leadName && <span className="text-[10px] text-slate-400 truncate">from {task.leadName}</span>}
          </div>
          {!docInfo && task?.task && <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={task.task}>{task.task}</p>}
          <p className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5" aria-live={message.streaming ? "polite" : undefined}>
            {message.streaming
              ? <Loader2 className="h-3 w-3 animate-spin text-primary" aria-hidden="true" />
              : <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden="true" />}
            <span className="truncate">{status}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onView}
          aria-label={`View ${docInfo ? docInfo.title : `${message.sender}'s handoff`}`}
          className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg border border-primary-border bg-primary-muted text-primary text-[11px] font-semibold hover:opacity-90 cursor-pointer"
        >
          <PanelTopOpen className="h-3.5 w-3.5" aria-hidden="true" /> View
        </button>
        <ExportMenu onExport={onExport} disabled={!isSaved(message)} label={`Export ${docInfo ? docInfo.title : `${message.sender}'s handoff`}`} />
      </div>
    </div>
  );
}
