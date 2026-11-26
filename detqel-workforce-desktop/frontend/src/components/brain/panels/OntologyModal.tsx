"use client";

import React, { useMemo, useState } from "react";
import { Check, Network, Sparkles, X } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { brainApi, type BrainDatasetView, type BrainMapping, type BrainOntologyTemplate } from "@/lib/api/brain";
import { canAccess } from "@/lib/brain-view";
import { useWorkspaceQuery, type BrainQueryResult } from "@/hooks/useBrainQuery";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { BrainModal } from "./BrainModal";
import { PanelState, Pill, SectionTitle, statusTone, Tabs } from "./panelParts";

type OntologyTab = "entities" | "relationships" | "mappings" | "templates";
const TABS: Array<{ id: OntologyTab; label: string }> = [
  { id: "entities", label: "Entity types" },
  { id: "relationships", label: "Relationships" },
  { id: "mappings", label: "Mappings" },
  { id: "templates", label: "Starter templates" },
];
const errorText = (error: unknown) => (error instanceof Error ? error.message : "The request failed.");

interface OntologyModalProps {
  initialTab?: OntologyTab;
  onClose: () => void;
  onDataChanged: () => void;
}

/** The canonical business model: entity types, relationships, source-to-canonical mappings and their review. */
export const OntologyModal: React.FC<OntologyModalProps> = ({ initialTab = "entities", onClose, onDataChanged }) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const canWrite = canAccess(currentWorkspace?.role, "write");
  const [tab, setTab] = useState<OntologyTab>(initialTab);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const summary = useWorkspaceQuery(workspaceId, brainApi.ontologySummary);
  const types = useWorkspaceQuery(workspaceId, brainApi.entityTypes);
  const relationships = useWorkspaceQuery(workspaceId, brainApi.relationshipTypes, { enabled: tab === "relationships" });
  const mappings = useWorkspaceQuery(workspaceId, brainApi.mappings, { enabled: tab === "mappings" });
  const datasets = useWorkspaceQuery(workspaceId, brainApi.datasets, { enabled: tab === "mappings" || tab === "templates" });
  const templates = useWorkspaceQuery(workspaceId, brainApi.ontologyTemplates, { enabled: tab === "templates" });

  const typeName = useMemo(() => new Map((types.data ?? []).map((type) => [type.id, type.name])), [types.data]);
  const datasetName = useMemo(() => new Map((datasets.data ?? []).map((dataset) => [dataset.id, dataset.name])), [datasets.data]);

  const run = async (key: string, action: () => Promise<unknown>, after: () => void) => {
    setBusyId(key);
    setActionError(null);
    try {
      await action();
      after();
      summary.reload();
      onDataChanged();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  const review = (mapping: BrainMapping, decision: "approved" | "rejected") =>
    run(mapping.id, () => brainApi.reviewMapping(workspaceId!, mapping.id, decision), mappings.reload);

  const stats = summary.data;
  return (
    <BrainModal title="Ontology & Rules" subtitle="The canonical model every source is mapped onto." icon={Network} size="xl" onClose={onClose}>
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-slate-200/80 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800">
          {[
            ["Entity types", stats.entityTypes],
            ["Entities", stats.entities],
            ["Relationship types", stats.relationshipTypes],
            ["Links", stats.relationships],
            ["Mappings to review", stats.pendingMappings],
          ].map(([label, value]) => (
            <div key={label} className="bg-white dark:bg-[#182234] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </div>
      )}
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="p-6 space-y-3">
        {!workspaceId && <PanelState empty emptyText="Select a workspace to view its ontology." />}
        {actionError && <PanelState error={actionError} />}

        {workspaceId && tab === "entities" && (
          <PanelState loading={types.loading} error={types.error} empty={(types.data ?? []).length === 0} emptyText="No entity types yet. Apply a starter template to begin.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(types.data ?? []).map((type) => (
                <article key={type.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{type.name}</span>
                    <span className="flex items-center gap-1.5">
                      <Pill tone="primary">{`${type.entityCount} entities`}</Pill>
                      <Pill tone={statusTone(type.status)}>{`v${type.version}`}</Pill>
                    </span>
                  </div>
                  {type.description && <p className="text-[11px] text-slate-500 dark:text-slate-400">{type.description}</p>}
                  <div className="flex flex-wrap gap-1">
                    {type.attributes.map((attribute) => (
                      <Pill key={attribute.key} tone={attribute.identifier ? "emerald" : "slate"}>
                        {`${attribute.name}${attribute.identifier ? " · id" : ""}${attribute.classification !== "internal" ? ` · ${attribute.classification}` : ""}`}
                      </Pill>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </PanelState>
        )}

        {workspaceId && tab === "relationships" && (
          <PanelState loading={relationships.loading} error={relationships.error} empty={(relationships.data ?? []).length === 0} emptyText="No relationship types yet.">
            <ul className="space-y-1.5">
              {(relationships.data ?? []).map((relationship) => (
                <li key={relationship.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{relationship.name}</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {typeName.get(relationship.fromTypeId) ?? "?"}.{relationship.fromAttribute} → {typeName.get(relationship.toTypeId) ?? "?"} · {relationship.cardinality.replaceAll("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          </PanelState>
        )}

        {workspaceId && tab === "mappings" && (
          <PanelState loading={mappings.loading} error={mappings.error} empty={(mappings.data ?? []).length === 0} emptyText="No mappings yet. Suggest mappings for a loaded dataset from Starter templates.">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                    <th className="py-1.5 pr-2 font-semibold">Source field</th>
                    <th className="py-1.5 px-2 font-semibold">Canonical attribute</th>
                    <th className="py-1.5 px-2 font-semibold text-right">Confidence</th>
                    <th className="py-1.5 px-2 font-semibold">Status</th>
                    <th className="py-1.5 pl-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
                  {(mappings.data ?? []).map((mapping) => (
                    <tr key={mapping.id}>
                      <td className="py-1.5 pr-2">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{mapping.sourceField}</span>
                        <span className="block text-[10px] text-slate-400">{datasetName.get(mapping.datasetId) ?? "dataset"} · {mapping.method}</span>
                      </td>
                      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-300">{typeName.get(mapping.entityTypeId) ?? "?"}.{mapping.attributeKey}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{Math.round(mapping.confidence * 100)}%</td>
                      <td className="py-1.5 px-2"><Pill tone={statusTone(mapping.status)}>{mapping.status}</Pill></td>
                      <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                        {mapping.status === "proposed" && canWrite && (
                          <span className="inline-flex gap-1">
                            <SecondaryButton value="Approve" icon={<Check className="w-3 h-3" />} iconPosition="left" className="px-2 py-0.5 text-[10px]" disabled={busyId !== null} onClick={() => void review(mapping, "approved")} />
                            <SecondaryButton value="Reject" icon={<X className="w-3 h-3" />} iconPosition="left" className="px-2 py-0.5 text-[10px]" disabled={busyId !== null} onClick={() => void review(mapping, "rejected")} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelState>
        )}

        {workspaceId && tab === "templates" && (
          <TemplatesTab
            workspaceId={workspaceId}
            canWrite={canWrite}
            templates={templates}
            datasets={datasets}
            busyId={busyId}
            onAction={(key, action) => run(key, action, types.reload)}
          />
        )}
      </div>
    </BrainModal>
  );
};

interface TemplatesTabProps {
  workspaceId: string;
  canWrite: boolean;
  templates: BrainQueryResult<BrainOntologyTemplate[]>;
  datasets: BrainQueryResult<BrainDatasetView[]>;
  busyId: string | null;
  onAction: (key: string, action: () => Promise<unknown>) => Promise<void>;
}

const TemplatesTab: React.FC<TemplatesTabProps> = ({ workspaceId, canWrite, templates, datasets, busyId, onAction }) => {
  const loaded = (datasets.data ?? []).filter((dataset) => dataset.status !== "revoked" && dataset.schema.length > 0);
  return (
    <div className="space-y-5">
      <section>
        <SectionTitle>Starter templates</SectionTitle>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">Adds the template&apos;s missing entity types and relationships. Existing types are kept.</p>
        <PanelState loading={templates.loading} error={templates.error}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(templates.data ?? []).map((template) => (
              <article key={template.key} className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3 flex flex-col justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">{template.name}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{template.description}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{template.entities.join(", ")}</p>
                </div>
                {canWrite && (
                  <SecondaryButton value="Apply" className="self-end px-2.5 py-1 text-[11px]" disabled={busyId !== null} onClick={() => void onAction(template.key, () => brainApi.applyTemplate(workspaceId, template.key))} />
                )}
              </article>
            ))}
          </div>
        </PanelState>
      </section>
      <section>
        <SectionTitle>Map a loaded dataset</SectionTitle>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
          Proposes how each field maps onto the canonical model. Confident, unambiguous matches are approved; the rest wait in Mappings for review.
        </p>
        <PanelState loading={datasets.loading} error={datasets.error} empty={loaded.length === 0} emptyText="No synced datasets yet. Load data in the Data Layer first.">
          <ul className="space-y-1.5">
            {loaded.map((dataset) => (
              <li key={dataset.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {dataset.name} <span className="font-normal text-slate-400">· {dataset.schema.length} fields</span>
                </span>
                {canWrite && (
                  <PrimaryButton
                    value={busyId === dataset.id ? "Suggesting…" : "Suggest mappings"}
                    icon={<Sparkles className="w-3 h-3" />}
                    iconPosition="left"
                    className="px-2.5 py-1 text-[11px]"
                    disabled={busyId !== null}
                    onClick={() => void onAction(dataset.id, () => brainApi.suggestMappings(workspaceId, dataset.id))}
                  />
                )}
              </li>
            ))}
          </ul>
        </PanelState>
      </section>
    </div>
  );
};
