"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { brainApi, type BrainAccessPolicy, type BrainAccessPolicyInput, type BrainPolicySettings } from "@/lib/api/brain";
import { canAccess } from "@/lib/brain-view";
import { useWorkspaceQuery } from "@/hooks/useBrainQuery";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import { IconOnlyButton } from "@/components/ui/icon-only-button";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Field, formatDateTime, inputClass, PanelState, Pill, SectionTitle, Tabs } from "./panelParts";
import { BrainModal } from "./BrainModal";

type AdminTab = "approvals" | "access" | "audit";
const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "approvals", label: "Approval policy" },
  { id: "access", label: "Access policies" },
  { id: "audit", label: "Audit trail" },
];
const ROLE_OPTIONS = [
  { value: "*", label: "Everyone below owner" },
  { value: "admin", label: "Administrators" },
  { value: "manager", label: "Managers" },
  { value: "analyst", label: "Analysts" },
  { value: "employee", label: "Employees" },
];
const EFFECT_OPTIONS = [
  { value: "deny", label: "Hide completely", description: "The role cannot see this resource." },
  { value: "mask", label: "Mask fields", description: "Listed fields are hidden from the role." },
  { value: "row_filter", label: "Filter rows", description: "The role only sees matching records." },
];
const RESOURCE_OPTIONS = [
  { value: "dataset", label: "Dataset" },
  { value: "metric", label: "Metric" },
  { value: "entity_type", label: "Entity type" },
];
const OPERATOR_OPTIONS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "does not equal" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "at least" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "at most" },
];
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const errorText = (error: unknown) => (error instanceof Error ? error.message : "The request failed.");

/** Business Brain administration: action-risk approval rules, row and column access policies, and the audit trail. */
export const AdminModal: React.FC<{ onClose: () => void; onDataChanged: () => void }> = ({ onClose, onDataChanged }) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const canManage = canAccess(currentWorkspace?.role, "manage");
  const [tab, setTab] = useState<AdminTab>("approvals");

  return (
    <BrainModal
      title="Admin"
      subtitle="Governance for the Business Brain in this workspace."
      icon={ShieldCheck}
      iconClassName="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
      size="lg"
      onClose={onClose}
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6">
        {!workspaceId && <PanelState empty emptyText="Select a workspace to manage its governance." />}
        {workspaceId && tab === "approvals" && <ApprovalPolicyTab workspaceId={workspaceId} canManage={canManage} />}
        {workspaceId && tab === "access" && (canManage ? <AccessPoliciesTab workspaceId={workspaceId} onChanged={onDataChanged} /> : <ManageOnly />)}
        {workspaceId && tab === "audit" && (canManage ? <AuditTab workspaceId={workspaceId} /> : <ManageOnly />)}
      </div>
    </BrainModal>
  );
};

const ManageOnly = () => <PanelState empty emptyText="Owner or administrator access is required." />;

const Toggle: React.FC<{ label: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }> = ({ label, description, checked, disabled, onChange }) => (
  <label className="flex items-start justify-between gap-4 rounded-xl border border-slate-200/80 dark:border-slate-800 px-3 py-2.5 cursor-pointer">
    <span>
      <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{label}</span>
      <span className="block text-[11px] text-slate-500 dark:text-slate-400">{description}</span>
    </span>
    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-primary cursor-pointer disabled:cursor-not-allowed" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

const ApprovalPolicyTab: React.FC<{ workspaceId: string; canManage: boolean }> = ({ workspaceId, canManage }) => {
  const settings = useWorkspaceQuery(workspaceId, brainApi.policySettings);
  const [draft, setDraft] = useState<BrainPolicySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    if (settings.data) Promise.resolve().then(() => setDraft(settings.data));
  }, [settings.data]);

  const update = <K extends keyof BrainPolicySettings>(key: K, value: BrainPolicySettings[K]) => setDraft((current) => (current ? { ...current, [key]: value } : current));
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      // Per-action tier overrides are not edited here, so they are left untouched.
      setDraft(await brainApi.updatePolicySettings(workspaceId, {
        moderateRequiresApproval: draft.moderateRequiresApproval, criticalEnabled: draft.criticalEnabled,
        criticalRequiredApprovals: draft.criticalRequiredApprovals, approvalTtlHours: draft.approvalTtlHours,
        workflowsEnabled: draft.workflowsEnabled, externalSearchEnabled: draft.externalSearchEnabled,
      }));
      setMessage({ error: false, text: "Saved." });
    } catch (error) {
      setMessage({ error: true, text: errorText(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelState loading={!draft && settings.loading} error={settings.error}>
      {draft && (
        <div className="space-y-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Low-risk actions run on their own; high-risk and external actions always wait for a person, whatever is set here.
          </p>
          <Toggle label="Workflows enabled" description="Allow durable workflows to start in this workspace." checked={draft.workflowsEnabled} disabled={!canManage} onChange={(value) => update("workflowsEnabled", value)} />
          <Toggle label="Approve moderate-risk actions" description="Moderate actions, such as writing documents, wait for approval too." checked={draft.moderateRequiresApproval} disabled={!canManage} onChange={(value) => update("moderateRequiresApproval", value)} />
          <Toggle label="Allow critical actions" description="Off by default. When on, critical actions need several approvers." checked={draft.criticalEnabled} disabled={!canManage} onChange={(value) => update("criticalEnabled", value)} />
          <Toggle label="External web search" description="Let agents add public web context to answers." checked={draft.externalSearchEnabled} disabled={!canManage} onChange={(value) => update("externalSearchEnabled", value)} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Approvers for critical actions" hint="Between 2 and 5.">
              <input type="number" min={2} max={5} className={inputClass} value={draft.criticalRequiredApprovals} disabled={!canManage || !draft.criticalEnabled} onChange={(event) => update("criticalRequiredApprovals", Math.min(5, Math.max(2, Number(event.target.value) || 2)))} />
            </Field>
            <Field label="Approval expiry (hours)" hint="Unanswered approvals expire after this.">
              <input type="number" min={1} max={720} className={inputClass} value={draft.approvalTtlHours} disabled={!canManage} onChange={(event) => update("approvalTtlHours", Math.min(720, Math.max(1, Number(event.target.value) || 1)))} />
            </Field>
          </div>
          {message && (message.error ? <PanelState error={message.text} /> : <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{message.text}</p>)}
          {canManage ? (
            <div className="flex justify-end">
              <PrimaryButton value={saving ? "Saving…" : "Save policy"} disabled={saving} onClick={() => void save()} />
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Owner or administrator access is required to change the policy.</p>
          )}
        </div>
      )}
    </PanelState>
  );
};

const AccessPoliciesTab: React.FC<{ workspaceId: string; onChanged: () => void }> = ({ workspaceId, onChanged }) => {
  const policies = useWorkspaceQuery(workspaceId, brainApi.accessPolicies);
  const datasets = useWorkspaceQuery(workspaceId, brainApi.datasets);
  const metrics = useWorkspaceQuery(workspaceId, brainApi.metrics);
  const types = useWorkspaceQuery(workspaceId, brainApi.entityTypes);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const empty: BrainAccessPolicyInput = { name: "", role: "employee", resourceType: "dataset", resourceId: "", effect: "mask", maskedFields: [], rowFilter: null };
  const [draft, setDraft] = useState<BrainAccessPolicyInput>(empty);
  const [maskedText, setMaskedText] = useState("");
  const [filter, setFilter] = useState({ field: "", op: "eq", value: "" });

  const resources = useMemo(() => {
    if (draft.resourceType === "dataset") return (datasets.data ?? []).map((item) => ({ value: item.id, label: item.name }));
    if (draft.resourceType === "metric") return (metrics.data ?? []).map((item) => ({ value: item.id, label: item.name }));
    return (types.data ?? []).map((item) => ({ value: item.id, label: item.name }));
  }, [draft.resourceType, datasets.data, metrics.data, types.data]);
  const resourceName = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of datasets.data ?? []) names.set(item.id, item.name);
    for (const item of metrics.data ?? []) names.set(item.id, item.name);
    for (const item of types.data ?? []) names.set(item.id, item.name);
    return names;
  }, [datasets.data, metrics.data, types.data]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const maskedFields = maskedText.split(",").map((field) => field.trim()).filter(Boolean);
    if (!draft.name.trim() || !draft.resourceId) return setError("Name the policy and choose what it applies to.");
    if (maskedFields.some((field) => !FIELD_NAME.test(field))) return setError("Field names may contain letters, numbers and underscores only.");
    if (draft.effect === "mask" && !maskedFields.length) return setError("List at least one field to mask.");
    if (draft.effect === "row_filter" && (!FIELD_NAME.test(filter.field) || !filter.value.trim())) return setError("Give the row filter a field and a value.");
    const numeric = filter.value.trim() !== "" && Number.isFinite(Number(filter.value));
    setBusy(true);
    setError(null);
    try {
      await brainApi.createAccessPolicy(workspaceId, {
        ...draft, name: draft.name.trim(), maskedFields: draft.effect === "mask" ? maskedFields : [],
        rowFilter: draft.effect === "row_filter" ? { field: filter.field, op: filter.op, value: numeric ? Number(filter.value) : filter.value.trim() } : null,
      });
      setDraft(empty);
      setMaskedText("");
      setFilter({ field: "", op: "eq", value: "" });
      policies.reload();
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (policy: BrainAccessPolicy) => {
    setBusy(true);
    setError(null);
    try {
      await brainApi.deleteAccessPolicy(workspaceId, policy.id);
      policies.reload();
      onChanged();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };

  const describe = (policy: BrainAccessPolicy) =>
    policy.effect === "deny" ? "hidden" : policy.effect === "mask" ? `masks ${policy.maskedFields.join(", ")}` : `only rows where ${policy.rowFilter?.field} ${policy.rowFilter?.op} ${String(policy.rowFilter?.value)}`;

  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Active policies</SectionTitle>
        <PanelState loading={policies.loading} error={policies.error} empty={(policies.data ?? []).length === 0} emptyText="No access policies. Every member sees everything their role allows.">
          <ul className="space-y-1.5">
            {(policies.data ?? []).map((policy) => (
              <li key={policy.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{policy.name}</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {ROLE_OPTIONS.find((role) => role.value === policy.role)?.label ?? policy.role} · {resourceName.get(policy.resourceId) ?? policy.resourceType} · {describe(policy)}
                  </span>
                </span>
                <IconOnlyButton aria-label={`Delete ${policy.name}`} disabled={busy} onClick={() => void remove(policy)} icon={<Trash2 className="w-3.5 h-3.5" />} className="rounded-lg shrink-0" />
              </li>
            ))}
          </ul>
        </PanelState>
      </section>

      <form onSubmit={submit} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#131c2d] p-4 space-y-3">
        <SectionTitle>New policy</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <input className={inputClass} value={draft.name} maxLength={255} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Hide customer emails" />
          </Field>
          <Field label="Applies to role">
            <CustomDropdown options={ROLE_OPTIONS} value={draft.role} onChange={(role) => setDraft({ ...draft, role })} />
          </Field>
          <Field label="Resource type">
            <CustomDropdown options={RESOURCE_OPTIONS} value={draft.resourceType} onChange={(value) => setDraft({ ...draft, resourceType: value as BrainAccessPolicyInput["resourceType"], resourceId: "" })} />
          </Field>
          <Field label="Resource">
            <CustomDropdown options={resources} value={draft.resourceId} onChange={(resourceId) => setDraft({ ...draft, resourceId })} placeholder="Choose" emptyText="Nothing of this type yet" searchable />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Effect">
              <CustomDropdown options={EFFECT_OPTIONS} value={draft.effect} onChange={(value) => setDraft({ ...draft, effect: value as BrainAccessPolicyInput["effect"] })} />
            </Field>
          </div>
          {draft.effect === "mask" && (
            <div className="sm:col-span-2">
              <Field label="Fields to mask" hint="Comma separated, such as email, phone.">
                <input className={inputClass} value={maskedText} onChange={(event) => setMaskedText(event.target.value)} placeholder="email, phone" />
              </Field>
            </div>
          )}
          {draft.effect === "row_filter" && (
            <div className="sm:col-span-2 grid grid-cols-3 gap-2">
              <Field label="Field">
                <input className={inputClass} value={filter.field} onChange={(event) => setFilter({ ...filter, field: event.target.value.trim() })} placeholder="region" />
              </Field>
              <Field label="Operator">
                <CustomDropdown options={OPERATOR_OPTIONS} value={filter.op} onChange={(op) => setFilter({ ...filter, op })} />
              </Field>
              <Field label="Value">
                <input className={inputClass} value={filter.value} onChange={(event) => setFilter({ ...filter, value: event.target.value })} placeholder="EMEA" />
              </Field>
            </div>
          )}
        </div>
        {error && <PanelState error={error} />}
        <div className="flex justify-end">
          <PrimaryButton type="submit" value={busy ? "Saving…" : "Add policy"} icon={<Plus className="w-3.5 h-3.5" />} iconPosition="left" disabled={busy} />
        </div>
      </form>
    </div>
  );
};

const AuditTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const audit = useWorkspaceQuery(workspaceId, brainApi.audit);
  return (
    <PanelState loading={audit.loading} error={audit.error} empty={(audit.data ?? []).length === 0} emptyText="No audited activity yet.">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
              <th className="py-1.5 pr-2 font-semibold">When</th>
              <th className="py-1.5 px-2 font-semibold">Action</th>
              <th className="py-1.5 px-2 font-semibold">Actor</th>
              <th className="py-1.5 pl-2 font-semibold">Outcome</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
            {(audit.data ?? []).map((event) => (
              <tr key={event.id}>
                <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{formatDateTime(event.createdAt)}</td>
                <td className="py-1.5 px-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{event.action}</span>
                  <span className="block text-[10px] text-slate-400">{event.targetType}</span>
                </td>
                <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{event.actorType}</td>
                <td className="py-1.5 pl-2">
                  <Pill tone={event.outcome === "success" ? "emerald" : event.outcome === "failure" ? "red" : "slate"}>{event.outcome}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelState>
  );
};
