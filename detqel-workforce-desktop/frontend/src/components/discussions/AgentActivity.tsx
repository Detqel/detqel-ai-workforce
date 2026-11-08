"use client";

import React, { useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FilePen,
  Globe,
  Layers,
  Loader2,
  MessageSquareText,
  PenLine,
  ScanSearch,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ActivityKind, ActivityStep } from "@/lib/api/discussions";
import { ACTIVITY_LABELS } from "@/constants/discussionConstants";
import { formatDuration, workedFor } from "./discussionView";

const ICONS: Readonly<Record<ActivityKind, LucideIcon>> = {
  understanding: ScanSearch,
  coordinating: Users,
  assigned: ClipboardList,
  searchingKnowledge: BookOpen,
  searchingWeb: Globe,
  drafting: PenLine,
  reviewing: ShieldCheck,
  writing: MessageSquareText,
  consolidating: Layers,
  writingDocument: FilePen,
  savingDocument: FileCheck2,
};

/** The line describing a step, as it reads right now. */
export function stepLabel(step: ActivityStep): string {
  const detail = step.detail ?? {};
  const labels = ACTIVITY_LABELS[step.kind];
  if (step.status === "failed") return `${labels.running(detail)} failed`;
  return step.status === "running" ? labels.running(detail) : labels.done(detail);
}

function StepRow({ step }: { step: ActivityStep }) {
  const detail = step.detail ?? {};
  const Icon = ICONS[step.kind];
  return (
    <li className="flex items-start gap-2 min-w-0">
      <span className="mt-px shrink-0" aria-hidden="true">
        {step.status === "running" ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary" />
        ) : step.status === "failed" ? (
          <X className="h-3 w-3 text-red-500" />
        ) : (
          <Icon className="h-3 w-3 text-slate-400 dark:text-slate-500" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={step.status === "running" ? "text-slate-700 dark:text-slate-200" : step.status === "failed" ? "text-red-600 dark:text-red-400" : undefined}>
          {stepLabel(step)}
        </span>
        {step.kind === "assigned" && detail.task && (
          <span className="block truncate text-slate-400 dark:text-slate-500" title={detail.task}>{detail.task}</span>
        )}
      </span>
      {step.status !== "running" && typeof step.durationMs === "number" && step.durationMs > 0 && (
        <span className="shrink-0 tabular-nums text-slate-400 dark:text-slate-500">{formatDuration(step.durationMs)}</span>
      )}
    </li>
  );
}

interface AgentActivityProps {
  steps: ActivityStep[];
  /** While the reply is being written the steps stay open; afterwards they fold into one summary line. */
  live: boolean;
}

/** The steps an agent worked through for a reply, one line each, the way an IDE agent shows its work. */
export function AgentActivity({ steps, live }: AgentActivityProps) {
  const [expanded, setExpanded] = useState(false);
  if (steps.length === 0) return null;
  const total = workedFor(steps);
  const failed = steps.some((step) => step.status === "failed");
  const open = live || expanded;

  return (
    <div className="text-[11px] text-slate-500 dark:text-slate-400">
      {!live && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded-md -ml-1 px-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
          {failed ? <X className="h-3 w-3 text-red-500" aria-hidden="true" /> : <Check className="h-3 w-3 text-emerald-500" aria-hidden="true" />}
          <span>
            {total > 0 ? `Worked for ${formatDuration(total)}` : "Worked"} · {steps.length} {steps.length === 1 ? "step" : "steps"}
          </span>
        </button>
      )}
      {open && (
        <ul className={`space-y-1 ${live ? "" : "mt-1 pl-4 border-l border-slate-200 dark:border-slate-700 ml-1.5"}`} aria-live={live ? "polite" : undefined}>
          {steps.map((step) => <StepRow key={step.id} step={step} />)}
        </ul>
      )}
    </div>
  );
}
