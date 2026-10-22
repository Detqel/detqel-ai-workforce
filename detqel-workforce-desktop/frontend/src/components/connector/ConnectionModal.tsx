"use client";

import { CONNECTION_FIELD_MAX_LENGTH } from "@/constants/connectorConstants";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { connectorCatalogApi, type ConnectorCatalogDetail } from "@/lib/api/connector-catalog";
import { connectorsApi, type ConnectorRecord } from "@/lib/api/connectors";
import { ConnectionDialog, connectionErrorClass, connectionInputClass } from "./ConnectionDialog";
import { ConfigurationSchemaForm, missingConfigurationFields, visibleConfiguration } from "./ConfigurationSchemaForm";
import { ConnectorCatalogIcon } from "./ConnectorCatalogIcon";

interface ConnectionModalProps {
  workspaceId: string;
  catalogId?: string;
  connector?: ConnectorRecord;
  onClose: () => void;
  onSaved: (connector: ConnectorRecord) => void;
}

export function ConnectionModal({ workspaceId, catalogId: selectedCatalogId, connector, onClose, onSaved }: ConnectionModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const catalogId = connector?.catalogId ?? selectedCatalogId;
  const [catalog, setCatalog] = useState<ConnectorCatalogDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(catalogId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [name, setName] = useState(connector?.name ?? "");
  const [dataStream, setDataStream] = useState(connector?.dataStream ?? "");
  const [configuration, setConfiguration] = useState<Record<string, unknown>>(connector?.configuration ?? {});
  const [action, setAction] = useState<"verify" | "save" | null>(null);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = action !== null;
  const configuredSecrets = connector?.configuredSecretFields ?? [];

  useEffect(() => {
    if (!catalogId) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    connectorCatalogApi.get(catalogId, workspaceId, controller.signal).then(item => {
      if (active) setCatalog(item);
    }).catch(cause => {
      if (active) setLoadError(cause instanceof Error ? cause.message : "Unable to load provider configuration");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [catalogId, workspaceId, version]);

  function connectionConfiguration() {
    if (!catalog) throw new Error("Provider configuration is unavailable.");
    const missing = missingConfigurationFields(catalog.configSchema, configuration, configuredSecrets);
    if (missing.length) throw new Error(`Complete the required configuration: ${missing.join(", ")}.`);
    return visibleConfiguration(catalog.configSchema, configuration);
  }

  async function verifyConnection() {
    if (busy || !formRef.current?.reportValidity()) return;
    setAction("verify");
    setError(null);
    setVerified(false);
    try {
      if (!catalogId) throw new Error("Select an integration before verification.");
      const result = await connectorsApi.verify({ workspaceId, catalogId, name: name.trim(), configuration: connectionConfiguration() });
      if (result.success !== true) throw new Error("The provider did not confirm connectivity.");
      setVerified(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to verify connection");
    } finally { setAction(null); }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setAction("save");
    setError(null);
    try {
      const details = { name: name.trim(), dataStream: dataStream.trim() || null };
      let saved: ConnectorRecord;
      if (connector) {
        saved = await connectorsApi.update(connector.id, workspaceId, { ...details, ...(catalogId ? { configuration: connectionConfiguration() } : {}) });
      } else {
        if (!catalogId) throw new Error("Select an integration before saving.");
        saved = await connectorsApi.create({ ...details, workspaceId, catalogId, configuration: connectionConfiguration() });
      }
      onSaved(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save connection");
    } finally { setAction(null); }
  }

  return (
    <ConnectionDialog title={connector ? "Edit connection" : "Configure connection"} description={catalog?.name ?? connector?.provider} icon={catalog ? <ConnectorCatalogIcon iconKey={catalog.iconKey} className="h-5 w-5" /> : undefined} busy={busy} onClose={onClose}>
      <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <fieldset disabled={busy} className="min-w-0 space-y-4 px-5 py-4">
          <label className="block space-y-1.5"><span className="text-xs font-semibold">Connection name <span className="text-red-500">*</span></span><input autoFocus required maxLength={CONNECTION_FIELD_MAX_LENGTH} value={name} onChange={event => { setName(event.target.value); setVerified(false); }} className={connectionInputClass} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-semibold">Data stream</span><input maxLength={CONNECTION_FIELD_MAX_LENGTH} value={dataStream} onChange={event => setDataStream(event.target.value)} className={connectionInputClass} /></label>
          {loading ? <p role="status" className="flex items-center gap-2 py-6 text-xs text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading provider configuration…</p> : loadError ? <div role="alert" className={`${connectionErrorClass} flex items-center justify-between gap-3`}><span>{loadError}</span><SecondaryButton value="Try again" onClick={() => setVersion(value => value + 1)} /></div> : catalog && <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-700/60"><h3 className="text-xs font-semibold">Provider configuration</h3><ConfigurationSchemaForm schema={catalog.configSchema} values={configuration} configuredSecretFields={configuredSecrets} onChange={values => { setConfiguration(values); setVerified(false); }} /><p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />Credentials are encrypted.</p></div>}
          {!catalogId && connector && <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">This existing connection has no catalog configuration. Its name and data stream can be updated here.</p>}
          {verified && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4 shrink-0" />Connection verified. Save to add it to this workspace.</p>}
          {error && <p role="alert" className={connectionErrorClass}>{error}</p>}
        </fieldset>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-700/60 dark:bg-[#131c2d]/50">
          <SecondaryButton value="Cancel" onClick={onClose} disabled={busy} />
          {!connector && <SecondaryButton value={action === "verify" ? "Verifying…" : "Verify connection"} onClick={verifyConnection} disabled={busy || loading || !catalog || !name.trim()} icon={action === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined} iconPosition="left" />}
          <PrimaryButton type="submit" value={action === "save" ? "Saving…" : catalogId ? "Verify & save" : "Save changes"} disabled={busy || loading || Boolean(loadError) || !name.trim() || (!connector && !catalog)} icon={action === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined} iconPosition="left" />
        </div>
      </form>
    </ConnectionDialog>
  );
}
