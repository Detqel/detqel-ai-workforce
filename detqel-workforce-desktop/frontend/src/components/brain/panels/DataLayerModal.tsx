"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Database, Link2, Lock, Pause, Play, RefreshCw, Unlink } from "lucide-react";
import { useWorkspace } from "@/context/WorkspaceContext";
import { brainApi, type BrainDataSource, type BrainDatasetView } from "@/lib/api/brain";
import { canAccess } from "@/lib/brain-view";
import { useBrainQuery } from "@/hooks/useBrainQuery";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { BrainModal } from "./BrainModal";
import { DatabaseLoadForm, EndpointLoadForm } from "./LoadDataForm";
import { formatDateTime, PanelState, Pill, SectionTitle, statusTone } from "./panelParts";

/** Datasets refresh this often while the panel is open, so a running sync shows its progress. */
const DATASET_POLL_MS = 4_000;
const KIND_LABEL: Record<string, string> = { database: "Database", api: "HTTP API", files: "Files" };
const errorText = (error: unknown) => (error instanceof Error ? error.message : "The request failed.");

interface DataLayerModalProps {
  onClose: () => void;
  /** Called after a change that affects the overview, such as linking a source or loading data. */
  onDataChanged: () => void;
}

/**
 * The Data Layer: choose which workspace connections are business sources, then load their data into the
 * Medallion pipeline. Connections that are not linked are never read by the Business Brain.
 */
export const DataLayerModal: React.FC<DataLayerModalProps> = ({ onClose, onDataChanged }) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id ?? null;
  const canManage = canAccess(currentWorkspace?.role, "manage");
  const canWrite = canAccess(currentWorkspace?.role, "write");

  const loadSources = useCallback((signal: AbortSignal) => brainApi.dataSources(workspaceId!, signal), [workspaceId]);
  const loadDatasets = useCallback((signal: AbortSignal) => brainApi.datasets(workspaceId!, signal), [workspaceId]);
  const sources = useBrainQuery(workspaceId ? loadSources : null);
  const datasets = useBrainQuery(workspaceId ? loadDatasets : null, DATASET_POLL_MS);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<BrainDataSource | null>(null);

  const linked = useMemo(() => (sources.data ?? []).filter((source) => source.linked), [sources.data]);
  const others = useMemo(() => (sources.data ?? []).filter((source) => !source.linked), [sources.data]);
  const selected = linked.find((source) => source.connectionId === selectedId) ?? linked[0] ?? null;

  const refresh = () => {
    sources.reload();
    datasets.reload();
    onDataChanged();
  };

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyId(key);
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setBusyId(null);
    }
  };

  const link = (source: BrainDataSource) =>
    run(source.connectionId, async () => {
      await brainApi.linkSource(workspaceId!, source.connectionId);
      setSelectedId(source.connectionId);
    });

  const confirmUnlink = async () => {
    const target = unlinkTarget;
    if (!target) return;
    await run(target.connectionId, () => brainApi.unlinkSource(workspaceId!, target.connectionId));
    setUnlinkTarget(null);
  };

  return (
    <>
      <BrainModal
        title="Data Layer"
        subtitle="Business sources the Brain may read. Only linked sources are queried and counted."
        icon={Database}
        iconClassName="bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/60"
        size="xl"
        onClose={onClose}
      >
        <div className="p-6 space-y-4">
          {!workspaceId && <PanelState empty emptyText="Select a workspace to manage its business sources." />}
          {actionError && <PanelState error={actionError} />}
          {workspaceId && (
            <PanelState loading={sources.loading} error={sources.error}>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-5">
                <div className="space-y-4">
                  <section>
                    <SectionTitle>Business sources</SectionTitle>
                    {linked.length === 0 && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        No business sources yet. Link a connection below to start loading its data.
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {linked.map((source) => (
                        <li key={source.connectionId}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(source.connectionId)}
                            aria-current={selected?.connectionId === source.connectionId}
                            className={`w-full text-left rounded-xl border px-3 py-2 transition-colors cursor-pointer ${
                              selected?.connectionId === source.connectionId
                                ? "border-primary bg-primary-surface dark:bg-[#1c263b]"
                                : "border-slate-200/80 dark:border-slate-800 hover:border-primary-border"
                            }`}
                          >
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{source.name}</span>
                              <Pill tone={statusTone(source.status)}>{source.status}</Pill>
                            </span>
                            <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                              {KIND_LABEL[source.sourceKind ?? ""] ?? source.provider} · {source.datasets} dataset{source.datasets === 1 ? "" : "s"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section>
                    <SectionTitle>Other connections</SectionTitle>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
                      These stay private to your other work. The Business Brain does not read or count them.
                    </p>
                    <PanelState empty={others.length === 0} emptyText="Every connection is linked.">
                      <ul className="space-y-1.5">
                        {others.map((source) => (
                          <li key={source.connectionId} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-800 px-3 py-2">
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{source.name}</span>
                              <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                                {source.sourceKind ? KIND_LABEL[source.sourceKind] : "Cannot supply business data"}
                              </span>
                            </span>
                            {source.sourceKind && (
                              <SecondaryButton
                                value="Link"
                                icon={<Link2 className="w-3 h-3" />}
                                iconPosition="left"
                                className="px-2.5 py-1 text-[11px] shrink-0"
                                disabled={!canManage || busyId !== null}
                                title={canManage ? "Use this connection as a business source" : "Owner or administrator access is required"}
                                onClick={() => void link(source)}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </PanelState>
                  </section>
                </div>

                <div className="min-w-0">
                  {selected ? (
                    <SourceDetail
                      workspaceId={workspaceId}
                      source={selected}
                      datasets={(datasets.data ?? []).filter((dataset) => dataset.connectionId === selected.connectionId)}
                    allDatasets={datasets.data ?? []}
                      datasetsError={datasets.error}
                      canManage={canManage}
                      canWrite={canWrite}
                      busyId={busyId}
                      onUnlink={() => setUnlinkTarget(selected)}
                      onAction={run}
                      onCreated={refresh}
                    />
                  ) : (
                    <div className="h-full min-h-[200px] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      Link a business source to load its tables or endpoints into Bronze, Silver and Gold.
                    </div>
                  )}
                </div>
              </div>
            </PanelState>
          )}
        </div>
      </BrainModal>
      {/* Outside the dialog frame, whose open animation transform would otherwise contain this fixed overlay. */}
      <ConfirmationModal
        isOpen={unlinkTarget !== null}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={confirmUnlink}
        title={`Unlink ${unlinkTarget?.name ?? "source"}?`}
        message="Every dataset loaded from this connection stops syncing. Data already processed is kept, and the connection itself is not changed."
        confirmText="Unlink"
        variant="danger"
        isLoading={busyId === unlinkTarget?.connectionId}
      />
    </>
  );
};

interface SourceDetailProps {
  workspaceId: string;
  source: BrainDataSource;
  datasets: BrainDatasetView[];
  /** Every dataset in the workspace, for domain suggestions. */
  allDatasets: BrainDatasetView[];
  datasetsError: string | null;
  canManage: boolean;
  canWrite: boolean;
  busyId: string | null;
  onUnlink: () => void;
  onAction: (key: string, action: () => Promise<unknown>) => Promise<void>;
  onCreated: () => void;
}

const SourceDetail: React.FC<SourceDetailProps> = ({ workspaceId, source, datasets, allDatasets, datasetsError, canManage, canWrite, busyId, onUnlink, onAction, onCreated }) => {
  const active = datasets.filter((dataset) => dataset.status !== "revoked");
  const domains = useMemo(() => [...new Set(allDatasets.map((dataset) => dataset.domain))], [allDatasets]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{source.name}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {KIND_LABEL[source.sourceKind ?? ""]} · linked {formatDateTime(source.linkedAt)}
          </p>
        </div>
        <SecondaryButton
          value="Unlink"
          icon={<Unlink className="w-3 h-3" />}
          iconPosition="left"
          className="px-2.5 py-1 text-[11px]"
          disabled={!canManage || busyId !== null}
          title={canManage ? "Stop using this connection as a business source" : "Owner or administrator access is required"}
          onClick={onUnlink}
        />
      </div>

      <section>
        <SectionTitle>Loaded datasets</SectionTitle>
        <PanelState error={datasetsError} empty={active.length === 0} emptyText="Nothing loaded from this source yet.">
          <ul className="space-y-2">
            {active.map((dataset) => (
              <li key={dataset.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{dataset.name}</span>
                    <Pill tone="primary">{dataset.domain}</Pill>
                    <Pill tone={statusTone(dataset.zone)}>{dataset.zone}</Pill>
                    {dataset.syncing ? <Pill tone="blue">syncing</Pill> : <Pill tone={statusTone(dataset.status)}>{dataset.status}</Pill>}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-1.5">
                      <SecondaryButton
                        value="Sync now"
                        icon={<RefreshCw className="w-3 h-3" />}
                        iconPosition="left"
                        className="px-2.5 py-1 text-[11px]"
                        disabled={dataset.syncing || dataset.status === "paused" || busyId !== null}
                        onClick={() => void onAction(dataset.id, () => brainApi.syncDataset(workspaceId, dataset.id))}
                      />
                      <SecondaryButton
                        value={dataset.status === "paused" ? "Resume" : "Pause"}
                        icon={dataset.status === "paused" ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                        iconPosition="left"
                        className="px-2.5 py-1 text-[11px]"
                        disabled={busyId !== null}
                        onClick={() => void onAction(dataset.id, () => brainApi.setDatasetPaused(workspaceId, dataset.id, dataset.status !== "paused"))}
                      />
                    </div>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  {dataset.counts ? `${dataset.counts.silver} validated · ${dataset.counts.quarantinedOpen} quarantined · ` : ""}
                  last run {dataset.lastRunStatus ?? "pending"} · last success {formatDateTime(dataset.lastSuccessAt)}
                </p>
                {dataset.protectedFields.length > 0 && (
                  <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400" title="Stored only as pseudonyms outside the sealed raw copy">
                    <Lock className="w-3 h-3" aria-hidden="true" />
                    Personal data pseudonymised: {dataset.protectedFields.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </PanelState>
      </section>

      {source.sourceKind === "database" ? (
        canManage ? (
          <DatabaseLoadForm key={source.connectionId} workspaceId={workspaceId} source={source} knownDomains={domains} onLoaded={onCreated} />
        ) : (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Owner or administrator access is required to load a database.</p>
        )
      ) : canWrite ? (
        <EndpointLoadForm key={source.connectionId} workspaceId={workspaceId} source={source} knownDomains={domains} onCreated={onCreated} />
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Owner, administrator or manager access is required to load data.</p>
      )}
    </div>
  );
};
