"use client";

import React, { useCallback, useState } from "react";
import { ArrowRight, Layers } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { brainApi } from "@/lib/api/brain";
import { useBrainQuery } from "@/hooks/useBrainQuery";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { BrainModal } from "./BrainModal";
import { formatDateTime, PanelState, percentLabel, Pill, SectionTitle, statusTone } from "./panelParts";

interface LineageModalProps {
  initialDatasetId?: string | null;
  onClose: () => void;
  onOpenDataLayer: () => void;
}

const ZoneCard: React.FC<{ title: string; value: string; detail: string; tone: string }> = ({ title, value, detail, tone }) => (
  <div className={`flex-1 min-w-[120px] rounded-xl border px-3 py-2.5 ${tone}`}>
    <p className="text-[10px] font-bold uppercase tracking-wider">{title}</p>
    <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{detail}</p>
  </div>
);

/** Source-to-Gold lineage for a dataset: zone counts, column mappings and metrics, quarantine reasons and recent runs. */
export const LineageModal: React.FC<LineageModalProps> = ({ initialDatasetId, onClose, onOpenDataLayer }) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const loadDatasets = useCallback((signal: AbortSignal) => brainApi.datasets(workspaceId!, signal), [workspaceId]);
  const datasets = useBrainQuery(workspaceId ? loadDatasets : null);
  const [chosenId, setChosenId] = useState<string | null>(initialDatasetId ?? null);
  const list = (datasets.data ?? []).filter((dataset) => dataset.status !== "revoked" || dataset.id === chosenId);
  const datasetId = list.find((dataset) => dataset.id === chosenId)?.id ?? list[0]?.id ?? null;

  return (
    <BrainModal
      title="Data Lineage"
      subtitle="How each dataset flows from its source through Bronze, Silver and Gold."
      icon={Layers}
      iconClassName="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/60"
      size="xl"
      onClose={onClose}
    >
      <div className="p-6 space-y-5">
        <PanelState loading={datasets.loading} error={datasets.error}>
          {list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">No datasets yet. Load business data from a linked source first.</p>
              <SecondaryButton value="Open Data Layer" icon={<ArrowRight className="w-3 h-3" />} className="mx-auto px-3 py-1.5 text-[11px]" onClick={onOpenDataLayer} />
            </div>
          ) : (
            <>
              <div className="max-w-sm">
                <CustomDropdown
                  options={list.map((dataset) => ({ value: dataset.id, label: dataset.name, description: dataset.domain, badge: dataset.zone }))}
                  value={datasetId ?? ""}
                  onChange={setChosenId}
                  searchable
                />
              </div>

              {workspaceId && datasetId && <LineageDetail key={datasetId} workspaceId={workspaceId} datasetId={datasetId} />}
            </>
          )}
        </PanelState>
      </div>
    </BrainModal>
  );
};

/** Lineage of one dataset. Keyed by dataset, so switching datasets starts fresh. */
const LineageDetail: React.FC<{ workspaceId: string; datasetId: string }> = ({ workspaceId, datasetId }) => {
  const loadLineage = useCallback((signal: AbortSignal) => brainApi.lineage(workspaceId, datasetId, signal), [workspaceId, datasetId]);
  const loadDetail = useCallback((signal: AbortSignal) => brainApi.dataset(workspaceId, datasetId, signal), [workspaceId, datasetId]);
  const lineage = useBrainQuery(loadLineage);
  const detail = useBrainQuery(loadDetail);
  const view = lineage.data;
  const reasons = detail.data?.quarantineReasons ?? [];
  return (
    <PanelState loading={!view && lineage.loading} error={lineage.error}>
      {view && (
        <div className="space-y-5">
          <section>
            <SectionTitle>Flow</SectionTitle>
            <div className="flex flex-wrap items-stretch gap-2">
              <ZoneCard
                title="Source"
                value={view.source.connectionName ?? "Revoked"}
                detail={`${view.source.kind}${view.source.provider ? ` · ${view.source.provider}` : ""}`}
                tone="border-slate-200 dark:border-slate-700 text-slate-500"
              />
              <ZoneCard title="Bronze" value={String(view.zones.bronze.records)} detail="raw records landed" tone="border-amber-200/80 dark:border-amber-900/60 text-amber-700 dark:text-amber-400" />
              <ZoneCard
                title="Silver"
                value={String(view.zones.silver.records)}
                detail={`${view.zones.silver.quarantinedOpen} quarantined · transform v${view.zones.silver.transformationVersion}`}
                tone="border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"
              />
              <ZoneCard
                title="Gold"
                value={view.zones.gold.publishedVersion ? `v${view.zones.gold.publishedVersion}` : "Not published"}
                detail={`${view.zones.gold.metrics.length} governed metric${view.zones.gold.metrics.length === 1 ? "" : "s"}`}
                tone="border-emerald-200/80 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-400"
              />
            </div>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              Freshness {view.dataset.freshness} · last success {formatDateTime(view.dataset.lastSuccessAt)}
            </p>
          </section>

          {reasons.length > 0 && (
            <section>
              <SectionTitle>Quarantine reasons</SectionTitle>
              <div className="flex flex-wrap gap-1.5">
                {reasons.map((reason) => (
                  <Pill key={reason.code} tone="amber">{`${reason.code.replaceAll("_", " ")} · ${reason.count}`}</Pill>
                ))}
              </div>
            </section>
          )}

          {view.zones.gold.metrics.length > 0 && (
            <section>
              <SectionTitle>Gold metrics</SectionTitle>
              <ul className="space-y-1.5">
                {view.zones.gold.metrics.map((metric) => (
                  <li key={metric.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{metric.name}</span>
                    <span className="flex items-center gap-2">
                      <code className="text-[10px] text-slate-500 dark:text-slate-400">{metric.formula}</code>
                      <Pill tone={statusTone(metric.status)}>{metric.status}</Pill>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionTitle>Columns</SectionTitle>
            <PanelState empty={view.columns.length === 0} emptyText="The schema is detected on the first sync.">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="py-1.5 pr-2 font-semibold">Field</th>
                      <th className="py-1.5 px-2 font-semibold">Type</th>
                      <th className="py-1.5 px-2 font-semibold">Canonical mapping</th>
                      <th className="py-1.5 pl-2 font-semibold">Metrics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
                    {view.columns.map((column) => (
                      <tr key={column.field}>
                        <td className="py-1.5 pr-2 font-semibold text-slate-800 dark:text-slate-100">
                        <span className="inline-flex items-center gap-1.5">
                          {column.field}
                          {column.protected && <Pill tone="emerald">pseudonymised</Pill>}
                        </span>
                      </td>
                        <td className="py-1.5 px-2 text-slate-500 dark:text-slate-400">{column.type}</td>
                        <td className="py-1.5 px-2">
                          {column.mappings.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              {column.mappings.map((mapping) => (
                                <Pill key={mapping.target} tone={statusTone(mapping.status)}>{`${mapping.target} · ${Math.round(mapping.confidence * 100)}%`}</Pill>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pl-2 text-slate-500 dark:text-slate-400">{column.metrics.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelState>
          </section>

          <section>
            <SectionTitle>Recent pipeline runs</SectionTitle>
            <PanelState empty={view.recentRuns.length === 0} emptyText="No runs yet.">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                      <th className="py-1.5 pr-2 font-semibold">Started</th>
                      <th className="py-1.5 px-2 font-semibold">Status</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Extracted</th>
                      <th className="py-1.5 px-2 font-semibold text-right">Quarantined</th>
                      <th className="py-1.5 pl-2 font-semibold text-right">Pass rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800/80">
                    {view.recentRuns.map((run) => (
                      <tr key={run.id} title={run.errorMessage ?? undefined}>
                        <td className="py-1.5 pr-2 text-slate-600 dark:text-slate-300">{formatDateTime(run.startedAt)}</td>
                        <td className="py-1.5 px-2"><Pill tone={statusTone(run.status)}>{run.status}</Pill></td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{run.extractedCount}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{run.quarantinedCount}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums">{percentLabel(run.passRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelState>
          </section>
        </div>
      )}
    </PanelState>
  );
};
