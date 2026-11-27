"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { CheckCircle2, Database, Eye, FileLock2, KeyRound, Lock, Plus, ShieldCheck, Table2, UserRoundX } from "lucide-react";
import { BRAIN_DOMAIN_SUGGESTIONS } from "@/constants/brainConstants";
import { brainApi, type BrainDatabaseLoadResult, type BrainDataSource, type BrainSourceTable } from "@/lib/api/brain";
import { useBrainQuery } from "@/hooks/useBrainQuery";
import { CustomDropdown } from "@/components/ui/custom-dropdown";
import { PrimaryButton } from "@/components/ui/primary-button";
import { Field, inputClass, PanelState, Pill, SectionTitle } from "./panelParts";

const SYNC_OPTIONS = [
  { value: "60", label: "Every hour" },
  { value: "360", label: "Every 6 hours" },
  { value: "1440", label: "Every day" },
];
const FILE_FORMATS = [
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "jsonl", label: "JSON Lines" },
];
/** Mirrors the backend's rule for domain labels, so mistakes show before submitting. */
const DOMAIN_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} &/_.,()-]*$/u;
const FIELD_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const errorText = (error: unknown) => (error instanceof Error ? error.message : "The request failed.");
const tableKey = (table: { schema: string; name: string }) => `${table.schema}.${table.name}`;
const domainProblem = (value: string) => (!value.trim() ? "Enter the business domain." : DOMAIN_PATTERN.test(value.trim()) ? null : "Use letters, numbers, spaces and & / - . , ( ) only.");

/** A domain input with suggestions from the workspace's existing domains and common business areas. */
const DomainInput: React.FC<{ value: string; onChange: (value: string) => void; suggestions: string[]; placeholder?: string; required?: boolean; label?: string }> = ({
  value,
  onChange,
  suggestions,
  placeholder = "Sales, Finance, Procurement…",
  required = true,
  label = "Business domain",
}) => {
  const listId = useId();
  return (
    <>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
        placeholder={placeholder}
        maxLength={120}
        list={listId}
        aria-label={label}
        aria-required={required}
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
      </datalist>
    </>
  );
};

const useDomainSuggestions = (knownDomains: string[]) =>
  useMemo(() => [...new Set([...knownDomains, ...BRAIN_DOMAIN_SUGGESTIONS])].filter(Boolean), [knownDomains]);

/** What happens to the data when it is loaded. Every line describes behaviour the backend enforces. */
const ProtectionSummary: React.FC = () => (
  <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30 p-3 space-y-1.5">
    <p className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
      <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
      How this data is protected
    </p>
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] leading-snug text-emerald-900/80 dark:text-emerald-200/80">
      <li className="flex gap-1.5"><Eye className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />Read-only: databases are read in read-only transactions and APIs with GET requests; the source is never changed.</li>
      <li className="flex gap-1.5"><FileLock2 className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />The raw copy is sealed with AES-256-GCM, tied to each record, using this installation&apos;s key.</li>
      <li className="flex gap-1.5"><UserRoundX className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />Personal data (e-mails, phones, people&apos;s names, addresses, birth dates, ID numbers) is replaced by irreversible pseudonyms for analysis, answers and AI.</li>
      <li className="flex gap-1.5"><KeyRound className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />Passwords, tokens, keys and card numbers are removed and never stored.</li>
      <li className="flex gap-1.5"><Lock className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />Only workspace members can see results; access policies can hide or filter data per role, and every load is audited.</li>
      <li className="flex gap-1.5"><Database className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />When you ask the assistant, the figures and records it uses go to your configured AI model with personal data already pseudonymised.</li>
    </ul>
  </div>
);

interface DatabaseLoadFormProps {
  workspaceId: string;
  source: BrainDataSource;
  knownDomains: string[];
  onLoaded: () => void;
}

/** Loads a whole database, or chosen tables, with a business domain for each schema. */
export const DatabaseLoadForm: React.FC<DatabaseLoadFormProps> = ({ workspaceId, source, knownDomains, onLoaded }) => {
  const suggestions = useDomainSuggestions(knownDomains);
  const [scope, setScope] = useState<"database" | "tables">("database");
  const [includeViews, setIncludeViews] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [schemaDomains, setSchemaDomains] = useState<Record<string, string>>({});
  const [syncInterval, setSyncInterval] = useState("1440");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrainDatabaseLoadResult | null>(null);

  const loadTables = useCallback((signal: AbortSignal) => brainApi.sourceTables(workspaceId, source.connectionId, signal), [workspaceId, source.connectionId]);
  const tables = useBrainQuery(loadTables);
  const all = useMemo(() => tables.data ?? [], [tables.data]);

  const included = useMemo<BrainSourceTable[]>(
    () => (scope === "database" ? all.filter((table) => includeViews || table.type === "table") : all.filter((table) => selected.has(tableKey(table)))),
    [scope, all, includeViews, selected],
  );
  const schemas = useMemo(() => [...new Set(included.map((table) => table.schema))].sort(), [included]);
  const bySchema = useMemo(() => {
    const term = search.trim().toLowerCase();
    const groups = new Map<string, BrainSourceTable[]>();
    for (const table of all) {
      if (term && !tableKey(table).toLowerCase().includes(term)) continue;
      groups.set(table.schema, [...(groups.get(table.schema) ?? []), table]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [all, search]);

  const toggle = (keys: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = domainProblem(domain)
      ?? Object.values(schemaDomains).map((value) => (value.trim() ? domainProblem(value) : null)).find(Boolean)
      ?? (included.length === 0 ? (scope === "tables" ? "Choose at least one table." : "This source has no tables to load.") : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const perSchema = Object.fromEntries(schemas.map((schema) => [schema, schemaDomains[schema]?.trim()]).filter(([, value]) => value));
      const loaded = await brainApi.loadDatabase(workspaceId, source.connectionId, {
        scope,
        ...(scope === "tables" ? { tables: included.map((table) => ({ schema: table.schema, name: table.name })) } : { includeViews }),
        domain: domain.trim(),
        ...(Object.keys(perSchema).length ? { schemaDomains: perSchema } : {}),
        syncIntervalMinutes: syncInterval ? Number(syncInterval) : null,
      });
      setResult(loaded);
      setSelected(new Set());
      onLoaded();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#131c2d] p-4 space-y-4">
      <div>
        <SectionTitle>Load business data</SectionTitle>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
          Each table becomes a dataset. Raw records land sealed in Bronze, pass quality checks into Silver, and publish to Gold.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="What to load">
        {([
          { id: "database", title: "Entire database", detail: "Every business table. Migration and system tables are left out.", icon: Database },
          { id: "tables", title: "Specific tables", detail: "Choose the tables and views to load.", icon: Table2 },
        ] as const).map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={scope === option.id}
            onClick={() => setScope(option.id)}
            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left cursor-pointer transition-colors ${
              scope === option.id ? "border-primary bg-primary-muted" : "border-slate-200/80 dark:border-slate-700 bg-white dark:bg-[#182234] hover:border-primary-border"
            }`}
          >
            <option.icon className={`w-4 h-4 mt-0.5 shrink-0 ${scope === option.id ? "text-primary" : "text-slate-400"}`} aria-hidden="true" />
            <span>
              <span className={`block text-xs font-semibold ${scope === option.id ? "text-primary" : "text-slate-800 dark:text-slate-100"}`}>{option.title}</span>
              <span className="block text-[10px] text-slate-500 dark:text-slate-400">{option.detail}</span>
            </span>
          </button>
        ))}
      </div>

      <PanelState loading={tables.loading} error={tables.error} empty={all.length === 0} emptyText="No business tables were found in this source.">
        {scope === "database" ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-[#182234] px-3 py-2">
            <span className="text-[11px] text-slate-600 dark:text-slate-300">
              <strong className="font-semibold">{included.length}</strong> table{included.length === 1 ? "" : "s"} across {schemas.length} schema{schemas.length === 1 ? "" : "s"} will be loaded.
            </span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
              <input type="checkbox" className="w-3.5 h-3.5 accent-primary" checked={includeViews} onChange={(event) => setIncludeViews(event.target.checked)} />
              Include views
            </label>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-[#182234]">
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <input value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputClass} max-w-xs`} placeholder="Filter tables" aria-label="Filter tables" />
              <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">{selected.size} selected</span>
            </div>
            <div className="max-h-56 overflow-y-auto px-3 py-2 space-y-3">
              {bySchema.map(([schema, items]) => {
                const keys = items.map(tableKey);
                const allOn = keys.every((key) => selected.has(key));
                return (
                  <fieldset key={schema}>
                    <legend className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {schema}
                      <button type="button" className="normal-case tracking-normal font-semibold text-primary cursor-pointer" onClick={() => toggle(keys, !allOn)}>
                        {allOn ? "Clear" : "Select all"}
                      </button>
                    </legend>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
                      {items.map((table) => (
                        <label key={tableKey(table)} className="flex items-center gap-1.5 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer min-w-0">
                          <input type="checkbox" className="w-3.5 h-3.5 accent-primary shrink-0" checked={selected.has(tableKey(table))} onChange={(event) => toggle([tableKey(table)], event.target.checked)} />
                          <span className="truncate">{table.name}</span>
                          {table.type === "view" && <Pill tone="slate">view</Pill>}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </div>
        )}
      </PanelState>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Business domain *" hint={schemas.length > 1 ? "Used for every schema without its own domain below." : "Groups these datasets for metrics, ontology and access."}>
          <DomainInput value={domain} onChange={setDomain} suggestions={suggestions} />
        </Field>
        <Field label="Sync schedule" hint="While the app is open, data last synced over 24 hours ago also syncs automatically.">
          <CustomDropdown options={SYNC_OPTIONS} value={syncInterval} onChange={setSyncInterval} />
        </Field>
      </div>

      {schemas.length > 1 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Domain per schema <span className="font-normal text-slate-400">(optional)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {schemas.map((schema) => (
              <label key={schema} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-[11px] font-mono text-slate-500 dark:text-slate-400" title={schema}>{schema}</span>
                <DomainInput
                  value={schemaDomains[schema] ?? ""}
                  onChange={(value) => setSchemaDomains((current) => ({ ...current, [schema]: value }))}
                  suggestions={suggestions}
                  placeholder={domain.trim() || "Same as above"}
                  required={false}
                  label={`Business domain for ${schema}`}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <ProtectionSummary />

      {error && <PanelState error={error} />}
      {result && <LoadResult result={result} />}
      <div className="flex justify-end">
        <PrimaryButton
          type="submit"
          value={saving ? "Loading…" : scope === "database" ? `Load ${included.length} table${included.length === 1 ? "" : "s"}` : `Load ${selected.size} selected`}
          icon={<Plus className="w-3.5 h-3.5" />}
          iconPosition="left"
          disabled={saving || tables.loading || included.length === 0}
        />
      </div>
    </form>
  );
};

const LoadResult: React.FC<{ result: BrainDatabaseLoadResult }> = ({ result }) => (
  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-[#182234] px-3 py-2 space-y-1">
    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-100">
      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
      {result.created.length} dataset{result.created.length === 1 ? "" : "s"} added. Syncing has started and continues in the background.
    </p>
    {result.skipped.length > 0 && (
      <details className="text-[10px] text-slate-500 dark:text-slate-400">
        <summary className="cursor-pointer">{result.skipped.length} skipped</summary>
        <ul className="mt-1 space-y-0.5">
          {result.skipped.map((item) => (
            <li key={item.table}><span className="font-mono">{item.table}</span> · {item.reason}</li>
          ))}
        </ul>
      </details>
    )}
  </div>
);

interface EndpointLoadFormProps {
  workspaceId: string;
  source: BrainDataSource;
  knownDomains: string[];
  onCreated: () => void;
}

/** Loads one HTTP endpoint or file as a dataset. */
export const EndpointLoadForm: React.FC<EndpointLoadFormProps> = ({ workspaceId, source, knownDomains, onCreated }) => {
  const suggestions = useDomainSuggestions(knownDomains);
  const isApi = source.sourceKind === "api";
  const [path, setPath] = useState("");
  const [recordsPath, setRecordsPath] = useState("");
  const [format, setFormat] = useState("csv");
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [primaryKey, setPrimaryKey] = useState("");
  const [timeField, setTimeField] = useState("");
  const [syncInterval, setSyncInterval] = useState("1440");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = !name.trim() ? "Give the dataset a name." : domainProblem(domain)
      ?? ([primaryKey, timeField].some((field) => field && !FIELD_PATTERN.test(field)) ? "Field names may contain letters, numbers and underscores only." : null)
      ?? (isApi && !path.trim() ? "Enter the endpoint path." : null);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await brainApi.createDataset(workspaceId, {
        connectionId: source.connectionId, name: name.trim(), domain: domain.trim(),
        source: isApi ? { path: path.trim(), ...(recordsPath.trim() ? { recordsPath: recordsPath.trim() } : {}) } : { ...(path.trim() ? { path: path.trim() } : {}), format },
        primaryKeyField: primaryKey || null, timeField: timeField || null, syncIntervalMinutes: syncInterval ? Number(syncInterval) : null,
      });
      setPath("");
      setName("");
      setPrimaryKey("");
      setTimeField("");
      onCreated();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-[#131c2d] p-4 space-y-3">
      <SectionTitle>Load business data</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isApi ? (
          <>
            <Field label="Endpoint path *" hint="Relative to the connection's base URL.">
              <input value={path} onChange={(event) => setPath(event.target.value)} className={inputClass} placeholder="/v1/orders" />
            </Field>
            <Field label="Records path" hint="Where the list sits in the response, such as data.items.">
              <input value={recordsPath} onChange={(event) => setRecordsPath(event.target.value)} className={inputClass} placeholder="data.items" />
            </Field>
          </>
        ) : (
          <>
            <Field label="File path" hint="Leave empty for a single-file connection.">
              <input value={path} onChange={(event) => setPath(event.target.value)} className={inputClass} placeholder="sales/orders.csv" />
            </Field>
            <Field label="Format">
              <CustomDropdown options={FILE_FORMATS} value={format} onChange={setFormat} />
            </Field>
          </>
        )}
        <Field label="Dataset name *">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="Orders" maxLength={255} />
        </Field>
        <Field label="Business domain *" hint="Groups datasets for metrics, ontology and access.">
          <DomainInput value={domain} onChange={setDomain} suggestions={suggestions} />
        </Field>
        <Field label="Record key field" hint="Identifies a record across syncs.">
          <input value={primaryKey} onChange={(event) => setPrimaryKey(event.target.value.trim())} className={inputClass} placeholder="id" />
        </Field>
        <Field label="Time field" hint="Used for trends and forecasts.">
          <input value={timeField} onChange={(event) => setTimeField(event.target.value.trim())} className={inputClass} placeholder="created_at" />
        </Field>
        <Field label="Sync schedule" hint="While the app is open, data last synced over 24 hours ago also syncs automatically.">
          <CustomDropdown options={SYNC_OPTIONS} value={syncInterval} onChange={setSyncInterval} />
        </Field>
      </div>
      <ProtectionSummary />
      {error && <PanelState error={error} />}
      <div className="flex justify-end">
        <PrimaryButton type="submit" value={saving ? "Loading…" : "Load data"} icon={<Plus className="w-3.5 h-3.5" />} iconPosition="left" disabled={saving} />
      </div>
    </form>
  );
};
