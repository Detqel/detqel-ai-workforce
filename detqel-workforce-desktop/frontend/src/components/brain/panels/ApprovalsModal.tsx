"use client";

import React, { useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { brainApi, type BrainApproval } from "@/lib/api/brain";
import { useWorkspaceQuery } from "@/hooks/useBrainQuery";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { BrainModal } from "./BrainModal";
import { formatDateTime, inputClass, PanelState, Pill } from "./panelParts";

const TIER_TONE: Record<string, "red" | "amber" | "blue" | "slate"> = { critical: "red", high: "amber", moderate: "blue", low: "slate" };
const HIDDEN_PREVIEW_KEYS = new Set(["workflow", "step", "action"]);
const errorText = (error: unknown) => (error instanceof Error ? error.message : "The request failed.");

const previewValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map(previewValue).join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** The human-in-the-loop queue: each action shows exactly what it will do, and the decision applies to that payload only. */
export const ApprovalsModal: React.FC<{ onClose: () => void; onDataChanged: () => void }> = ({ onClose, onDataChanged }) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const approvals = useWorkspaceQuery(workspaceId, brainApi.pendingApprovals);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const decide = async (approval: BrainApproval, decision: "approved" | "rejected") => {
    setBusyId(approval.id);
    setError(null);
    try {
      await brainApi.decideApproval(workspaceId!, approval, decision, notes[approval.id]?.trim() || undefined);
      approvals.reload();
      onDataChanged();
    } catch (failure) {
      setError(errorText(failure));
      approvals.reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BrainModal
      title="Approval queue"
      subtitle="Actions waiting for a person. Nothing runs until it is approved."
      icon={ShieldAlert}
      iconClassName="bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/60"
      size="lg"
      onClose={onClose}
    >
      <div className="p-6 space-y-3">
        {!workspaceId && <PanelState empty emptyText="Select a workspace to see its approvals." />}
        {error && <PanelState error={error} />}
        {workspaceId && (
          <PanelState loading={approvals.loading} error={approvals.error} empty={(approvals.data ?? []).length === 0} emptyText="Nothing is waiting for a decision.">
            <ul className="space-y-3">
              {(approvals.data ?? []).map((approval) => {
                const preview = Object.entries(approval.preview).filter(([key]) => !HIDDEN_PREVIEW_KEYS.has(key));
                const approvedCount = approval.decisions.filter((item) => item.decision === "approved").length;
                return (
                  <li key={approval.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{approval.title}</span>
                      <span className="flex items-center gap-1.5">
                        <Pill tone={TIER_TONE[approval.riskTier] ?? "slate"}>{approval.riskTier}</Pill>
                        <Pill tone="slate">{`${approvedCount}/${approval.requiredApprovals} approvals`}</Pill>
                      </span>
                    </div>
                    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1 text-[11px]">
                      {preview.map(([key, value]) => (
                        <React.Fragment key={key}>
                          <dt className="font-semibold text-slate-500 dark:text-slate-400">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</dt>
                          <dd className="text-slate-700 dark:text-slate-200 break-words">{previewValue(value)}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                    <p className="text-[10px] text-slate-400">
                      {approval.action} · requested {formatDateTime(approval.createdAt)} · expires {formatDateTime(approval.expiresAt)}
                    </p>
                    {approval.canDecide ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <input
                          className={`${inputClass} flex-1 min-w-[160px]`}
                          placeholder="Note (optional)"
                          maxLength={1_000}
                          value={notes[approval.id] ?? ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [approval.id]: event.target.value }))}
                        />
                        <SecondaryButton value="Reject" icon={<X className="w-3 h-3" />} iconPosition="left" className="px-3 py-1.5 text-[11px]" disabled={busyId !== null} onClick={() => void decide(approval, "rejected")} />
                        <PrimaryButton value="Approve" icon={<Check className="w-3 h-3" />} iconPosition="left" className="px-3 py-1.5 text-[11px]" disabled={busyId !== null} onClick={() => void decide(approval, "approved")} />
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">Your role cannot decide this approval.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </PanelState>
        )}
      </div>
    </BrainModal>
  );
};
