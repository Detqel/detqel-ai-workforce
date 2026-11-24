"use client";

import { CONNECTION_FIELD_MAX_LENGTH } from "@/constants/connectorConstants";

import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { PrimaryButton } from "@/components/ui/primary-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { connectionDiscoveryApi, type ConnectionDefinitionDetail } from "@/lib/api/connection-discovery";
import { connectorsApi, type ConnectorRecord } from "@/lib/api/connectors";
import { ConnectionDialog, connectionErrorClass, connectionInputClass } from "./ConnectionDialog";
import { ConfigurationSchemaForm, missingConfigurationFields, visibleConfiguration } from "./ConfigurationSchemaForm";
import { ConnectionDefinitionIcon } from "./ConnectionDefinitionIcon";

interface ConnectionModalProps {
  workspaceId: string;
  definitionId?: string;
  connector?: ConnectorRecord;
  onClose: () => void;
  onSaved: (connector: ConnectorRecord) => void;
}

export function ConnectionModal({ workspaceId, definitionId: selectedDefinitionId, connector, onClose, onSaved }: ConnectionModalProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const definitionId = connector?.definitionId ?? selectedDefinitionId;
  const [definition, setDefinition] = useState<ConnectionDefinitionDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(definitionId));
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
    if (!definitionId) return;
    let active = true;
    const controller = new AbortController();
    queueMicrotask(() => { if (active) { setLoading(true); setLoadError(null); } });
    connectionDiscoveryApi.get(definitionId, workspaceId, controller.signal).then(item => {
      if (active) {
        setDefinition(item);
        if (!connector) {
          setConfiguration(current => ({ ...Object.fromEntries(Object.entries(item.configSchema.properties ?? {}).filter(([, field]) => !field["x-secret"] && field.default !== undefined).map(([name, field]) => [name, field.default])), ...current }));
          setName(current => current || item.name);
        }
      }
    }).catch(cause => {
      if (active) setLoadError(cause instanceof Error ? cause.message : "Unable to load provider configuration");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [definitionId, workspaceId, version, connector]);

  function connectionConfiguration() {
    if (!definition) throw new Error("Provider configuration is unavailable.");
    const missing = missingConfigurationFields(definition.configSchema, configuration, configuredSecrets);
    if (missing.length) throw new Error(`Complete the required configuration: ${missing.join(", ")}.`);
    return visibleConfiguration(definition.configSchema, configuration);
  }

  async function verifyConnection() {
    if (busy || !formRef.current?.reportValidity()) return;
    setAction("verify");
    setError(null);
    setVerified(false);
    try {
      if (!definitionId) throw new Error("Select an integration before verification.");
      const result = await connectorsApi.verify({ workspaceId, definitionId, name: name.trim(), configuration: connectionConfiguration() });
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
        saved = await connectorsApi.update(connector.id, workspaceId, { ...details, configuration: connectionConfiguration(), ...(connector.credentialError ? { replaceCredentials: true } : {}) });
      } else {
        if (!definitionId) throw new Error("Select an integration before saving.");
        saved = await connectorsApi.create({ ...details, workspaceId, definitionId, configuration: connectionConfiguration() });
      }
      onSaved(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save connection");
    } finally { setAction(null); }
  }

  return (
    <ConnectionDialog title={connector ? "Edit connection" : "Configure connection"} description={definition?.name ?? connector?.provider} icon={definition ? <ConnectionDefinitionIcon iconKey={definition.iconKey} className="h-5 w-5" /> : undefined} busy={busy} onClose={onClose}>
      <form ref={formRef} onSubmit={handleSubmit} className="flex min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <fieldset disabled={busy} className="min-w-0 space-y-4 px-5 py-4">
          {connector?.credentialError && <p role="alert" className={connectionErrorClass}>{connector.credentialError}</p>}
          {definition?.configSchema["x-access-scope"] === "single-repository-read-only" && <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><p className="font-semibold">Single repository · Read only</p><p className="leading-relaxed">This connection can read only the owner and repository you configure below. Use a fine-grained PAT limited to that repository with Contents: Read-only. KIN cannot reduce permissions already granted to an existing PAT.</p></div>}
          {definition?.discovery && <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
            {definition.discovery.instructions && <p className="whitespace-pre-wrap leading-relaxed text-slate-600 dark:text-slate-300">{definition.discovery.instructions}</p>}
            {definition.discovery.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="block text-primary underline underline-offset-2">{source.title}</a>)}
          </div>}
          <label className="block space-y-1.5"><span className="text-xs font-semibold">Connection name <span className="text-red-500">*</span></span><input autoFocus required placeholder="e.g. Sales reports" maxLength={CONNECTION_FIELD_MAX_LENGTH} value={name} onChange={event => { setName(event.target.value); setVerified(false); }} className={connectionInputClass} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-semibold">Data stream</span><input placeholder="e.g. Monthly reporting" maxLength={CONNECTION_FIELD_MAX_LENGTH} value={dataStream} onChange={event => setDataStream(event.target.value)} className={connectionInputClass} /></label>
          {loading ? <p role="status" className="flex items-center gap-2 py-6 text-xs text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading provider configuration…</p> : loadError ? <div role="alert" className={`${connectionErrorClass} flex items-center justify-between gap-3`}><span>{loadError}</span><SecondaryButton value="Try again" onClick={() => setVersion(value => value + 1)} /></div> : definition && <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-700/60"><h3 className="text-xs font-semibold">Provider configuration</h3><ConfigurationSchemaForm schema={definition.configSchema} values={configuration} configuredSecretFields={configuredSecrets} onChange={values => { setConfiguration(values); setVerified(false); }} /><p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />Credentials are encrypted.</p></div>}
          {verified && <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4 shrink-0" />Connection verified. Save to add it to this workspace.</p>}
          {error && <p role="alert" className={connectionErrorClass}>{error}</p>}
        </fieldset>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-700/60 dark:bg-[#131c2d]/50">
          <SecondaryButton value="Cancel" onClick={onClose} disabled={busy} />
          {!connector && <SecondaryButton value={action === "verify" ? "Verifying…" : "Verify connection"} onClick={verifyConnection} disabled={busy || loading || !definition || !name.trim()} icon={action === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined} iconPosition="left" />}
          <PrimaryButton type="submit" value={action === "save" ? "Saving…" : "Verify & save"} disabled={busy || loading || Boolean(loadError) || !name.trim() || !definition} icon={action === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined} iconPosition="left" />
        </div>
      </form>
    </ConnectionDialog>
  );
}
