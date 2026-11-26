"use client";

import React, { useCallback } from "react";
import { useWorkspace } from "@/context/WorkspaceContext";
import type { BrainCapabilityItem } from "@/constants/brainConstants";
import { brainApi, type BrainAnalysisKind, type BrainAnalysisRun } from "@/lib/api/brain";
import { useWorkspaceQuery } from "@/hooks/useBrainQuery";
import { CAPABILITY_ICON_MAP } from "../brainIcons";
import { BrainModal } from "./BrainModal";
import { formatDateTime, PanelState, Pill, SectionTitle, statusTone } from "./panelParts";

/** The analysis kind whose runs each analytical capability shows. Recommendations come from forecast runs. */
const RUN_KIND: Partial<Record<BrainCapabilityItem["id"], BrainAnalysisKind>> = {
  forecasting: "forecast",
  simulations: "simulation",
  optimization: "optimisation",
  "root-cause": "root_cause",
  recommendations: "forecast",
};
const STATEMENT_TONE: Record<string, "emerald" | "primary" | "amber" | "blue" | "slate"> = {
  fact: "emerald", estimate: "primary", assumption: "amber", recommendation: "blue", caveat: "slate",
};
const ASK_HINT = "Ask the assistant in the chat to run a new analysis; every run is listed here with its method and evidence.";

/** What an analytical or automation capability is, with the workspace's recent runs or workflows for it. */
export const CapabilityModal: React.FC<{ capability: BrainCapabilityItem; onClose: () => void }> = ({ capability, onClose }) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const kind = RUN_KIND[capability.id];
  const loadRuns = useCallback((id: string, signal: AbortSignal) => brainApi.analysisRuns(id, kind!, signal), [kind]);
  const runs = useWorkspaceQuery(workspaceId, loadRuns, { enabled: Boolean(kind) });
  const workflows = useWorkspaceQuery(workspaceId, brainApi.workflows, { enabled: capability.id === "automations" });

  return (
    <BrainModal title={capability.title} subtitle={capability.subtitle} icon={CAPABILITY_ICON_MAP[capability.icon]} iconClassName={capability.badgeClass} size="lg" onClose={onClose}>
      <div className="p-6 space-y-5">
        <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{capability.description}</p>
        {!workspaceId && <PanelState empty emptyText="Select a workspace to see its activity." />}
        {workspaceId && kind && (
          <section>
            <SectionTitle>{capability.id === "recommendations" ? "Recent recommendations" : "Recent runs"}</SectionTitle>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">{ASK_HINT}</p>
            <PanelState loading={runs.loading} error={runs.error} empty={(runs.data ?? []).length === 0} emptyText="No runs yet.">
              {capability.id === "recommendations" ? <Recommendations runs={runs.data ?? []} /> : <RunList runs={runs.data ?? []} />}
            </PanelState>
          </section>
        )}
        {workspaceId && capability.id === "automations" && (
          <section>
            <SectionTitle>Workflows</SectionTitle>
            <PanelState loading={workflows.loading} error={workflows.error} empty={(workflows.data ?? []).length === 0} emptyText="No workflows yet. Ask the assistant to draft one from a template.">
              <ul className="space-y-1.5">
                {(workflows.data ?? []).map((workflow) => (
                  <li key={workflow.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{workflow.name}</span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                        {workflow.trigger.type ?? "manual"} trigger · v{workflow.version}
                        {workflow.nextRunAt ? ` · next run ${formatDateTime(workflow.nextRunAt)}` : ""}
                      </span>
                    </span>
                    <Pill tone={statusTone(workflow.status)}>{workflow.status}</Pill>
                  </li>
                ))}
              </ul>
            </PanelState>
          </section>
        )}
      </div>
    </BrainModal>
  );
};

const RunList: React.FC<{ runs: BrainAnalysisRun[] }> = ({ runs }) => (
  <ul className="space-y-2">
    {runs.map((run) => (
      <li key={run.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 px-3 py-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{run.result?.headline?.label ?? run.kind.replace("_", " ")}</span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400">{run.method.key} v{run.method.version} · {formatDateTime(run.createdAt)}</span>
            <Pill tone={statusTone(run.status)}>{run.status}</Pill>
          </span>
        </div>
        {(run.result?.statements ?? []).slice(0, 4).map((statement, index) => (
          <p key={index} className="flex items-start gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <Pill tone={STATEMENT_TONE[statement.kind] ?? "slate"}>{statement.kind}</Pill>
            <span>{statement.text}</span>
          </p>
        ))}
        {run.warnings.map((warning) => (
          <p key={warning} className="text-[10px] text-amber-600 dark:text-amber-400">{warning}</p>
        ))}
      </li>
    ))}
  </ul>
);

const Recommendations: React.FC<{ runs: BrainAnalysisRun[] }> = ({ runs }) => {
  const items = runs.flatMap((run) => (run.result?.recommendations ?? []).map((item, index) => ({ ...item, key: `${run.id}-${index}`, createdAt: run.createdAt })));
  if (!items.length) return <PanelState empty emptyText="No recommendations yet. They are produced with each governed forecast." />;
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.key} className="rounded-xl border border-slate-200/80 dark:border-slate-800 px-3 py-2.5 space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{item.title}</span>
            <span className="flex items-center gap-1.5">
              <Pill tone="slate">{`${item.effort} effort`}</Pill>
              <Pill tone="primary">{`${item.confidence} confidence`}</Pill>
              {item.requiresApproval && <Pill tone="amber">needs approval</Pill>}
            </span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300">{item.rationale}</p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">Expected impact: {item.expectedImpact}</p>
        </li>
      ))}
    </ul>
  );
};
