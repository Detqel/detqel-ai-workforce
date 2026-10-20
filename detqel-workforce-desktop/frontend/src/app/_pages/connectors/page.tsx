"use client";

import React, { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { ConnectionModal } from "@/components/connector/ConnectionModal";
import { ConnectorCatalogModal } from "@/components/connector/ConnectorCatalogModal";
import { ConnectorTable } from "@/components/connector/ConnectorTable";
import { ConfirmationModal } from "@/components/ui/ConfirmationModal";
import { OptionMenu } from "@/components/ui/option-menu";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { useWorkspace } from "@/context/WorkspaceContext";
import { connectorsApi, type ConnectorRecord } from "@/lib/api/connectors";
import { connectorTypesApi, type LookupItem } from "@/lib/api/lookups";

export default function ConnectorsPage() {
  const { currentWorkspace, isLoading: workspaceLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  const [types, setTypes] = useState<LookupItem[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [typesError, setTypesError] = useState<string | null>(null);
  const [lookupVersion, setLookupVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setTypesLoading(true);
    setTypesError(null);
    connectorTypesApi.list(undefined, controller.signal).then(items => {
      if (active) setTypes(items);
    }).catch(cause => {
      if (active) setTypesError(cause instanceof Error ? cause.message : "Unable to load connector types");
    }).finally(() => { if (active) setTypesLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [lookupVersion]);

  return <ConnectionsWorkspace key={workspaceId ?? "no-workspace"} workspaceId={workspaceId} workspaceLoading={workspaceLoading} types={types} typesLoading={typesLoading} typesError={typesError} reloadTypes={() => setLookupVersion(value => value + 1)} />;
}

interface ConnectionsWorkspaceProps {
  workspaceId?: string;
  workspaceLoading: boolean;
  types: LookupItem[];
  typesLoading: boolean;
  typesError: string | null;
  reloadTypes: () => void;
}

type ConnectionForm = { catalogId: string; connector?: never } | { connector: ConnectorRecord; catalogId?: never };

function ConnectionsWorkspace({ workspaceId, workspaceLoading, types, typesLoading, typesError, reloadTypes }: ConnectionsWorkspaceProps) {
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(workspaceId));
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [catalogType, setCatalogType] = useState<LookupItem | null>(null);
  const [form, setForm] = useState<ConnectionForm | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ConnectorRecord | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    connectorsApi.list({ workspaceId }, controller.signal).then(items => {
      if (active) setConnectors(items);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load connections");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, reloadVersion]);

  function saveRecord(record: ConnectorRecord) {
    setConnectors(items => items.some(item => item.id === record.id) ? items.map(item => item.id === record.id ? record : item) : [record, ...items]);
  }

  async function changeConnectionState(connector: ConnectorRecord, action: "reconnect" | "disconnect") {
    if (!workspaceId || actionId) return;
    setActionId(connector.id);
    setError(null);
    try { saveRecord(await connectorsApi[action](connector.id, workspaceId)); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update connection");
      setReloadVersion(value => value + 1);
    } finally { setActionId(null); }
  }

  async function deleteConnection() {
    if (!workspaceId || !deleting || deletingBusy) return;
    setDeletingBusy(true);
    setDeleteError(null);
    try {
      const result = await connectorsApi.remove(deleting.id, workspaceId);
      if (!result.success) throw new Error("Unable to delete connection");
      setConnectors(items => items.filter(item => item.id !== deleting.id));
      setDeleting(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "Unable to delete connection");
    } finally { setDeletingBusy(false); }
  }

  return (
    <div className="min-h-[calc(100vh-60px)] w-full space-y-6 bg-slate-50/60 px-6 py-6 text-slate-900 transition-colors select-none sm:px-8 sm:py-8 xl:px-10 dark:bg-[#0e1422] dark:text-slate-100">
      <div className="flex items-center justify-between"><OptionMenu primary label="Choose connector type" placeholder="Add New Connection" icon={<Plus className="h-4 w-4" />} disabled={!workspaceId} loading={typesLoading} error={typesError} onRetry={reloadTypes} options={types.map(type => ({ value: type.code, label: type.name, description: type.description }))} onSelect={code => { const type = types.find(item => item.code === code); if (type) setCatalogType(type); }} /></div>
      {!workspaceLoading && !workspaceId && <p role="status" className="text-sm text-slate-500 dark:text-slate-400">Select a workspace to manage connections.</p>}
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"><span>{error}</span><SecondaryButton value="Try again" onClick={() => { setError(null); setReloadVersion(value => value + 1); }} /></div>}
      <ConnectorTable connectors={connectors} types={types} loading={loading || workspaceLoading} actionId={actionId} onEdit={connector => setForm({ connector })} onReconnect={connector => { void changeConnectionState(connector, "reconnect"); }} onDisconnect={connector => { void changeConnectionState(connector, "disconnect"); }} onDelete={connector => { setDeleteError(null); setDeleting(connector); }} />
      {catalogType && workspaceId && <ConnectorCatalogModal workspaceId={workspaceId} type={catalogType} onClose={() => setCatalogType(null)} onSelect={entry => { setCatalogType(null); setForm({ catalogId: entry.id }); }} />}
      {form && workspaceId && <ConnectionModal workspaceId={workspaceId} catalogId={form.catalogId} connector={form.connector} onClose={() => setForm(null)} onSaved={saveRecord} />}
      <ConfirmationModal isOpen={Boolean(deleting)} onClose={() => { if (!deletingBusy) setDeleting(null); }} onConfirm={deleteConnection} title="Delete connection" message={'Delete “' + (deleting?.name ?? "") + '” from this workspace?'} confirmText="Delete connection" cancelText="Cancel" isLoading={deletingBusy} error={deleteError} />
    </div>
  );
}
