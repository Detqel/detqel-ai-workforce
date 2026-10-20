"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Loader2, Search } from "lucide-react";
import { ConnectionDialog, connectionErrorClass, connectionInputClass } from "./ConnectionDialog";
import { OptionMenu } from "@/components/ui/option-menu";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { connectorCatalogApi, type ConnectorCatalogEntry } from "@/lib/api/connector-catalog";
import type { LookupItem } from "@/lib/api/lookups";
import { ConnectorCatalogIcon } from "./ConnectorCatalogIcon";

interface ConnectorCatalogModalProps {
  workspaceId: string;
  type: LookupItem;
  onClose: () => void;
  onSelect: (entry: ConnectorCatalogEntry) => void;
}

export function ConnectorCatalogModal({ workspaceId, type, onClose, onSelect }: ConnectorCatalogModalProps) {
  const [entries, setEntries] = useState<ConnectorCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    connectorCatalogApi.list({ workspaceId, connectorType: type.code }, controller.signal).then(items => {
      if (active) setEntries(items);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to load connector catalog");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, type.code, version]);

  const categories = useMemo(() => Array.from(new Set(entries.map(entry => entry.category))).sort(), [entries]);
  const groups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return categories.filter(group => category === null || category === group).map(group => ({
      name: group,
      entries: entries.filter(entry => entry.category === group && [entry.name, entry.description, entry.category].some(value => value?.toLocaleLowerCase().includes(query))),
    })).filter(group => group.entries.length > 0);
  }, [entries, categories, category, search]);

  return (
    <ConnectionDialog title={`Add ${type.name} connection`} wide onClose={onClose}>
      <div className="shrink-0 px-5 pb-3 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Search integrations</span><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><input autoFocus type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search integrations" className={`${connectionInputClass} pl-10`} /></label>
          <div className="min-w-0 sm:w-56 sm:shrink-0"><OptionMenu label="Filter integration category" placeholder="All categories" value={category === null ? "" : category} options={[{ value: "", label: "All categories" }, ...categories.map(name => ({ value: name, label: name }))]} onSelect={value => setCategory(value === "" ? null : value)} disabled={loading || Boolean(error)} /></div>
        </div>
      </div>
      <div className="min-h-0 min-w-0 space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-3 [scrollbar-gutter:stable]">
        {loading ? <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Loading integrations…</p> : error ? <div role="alert" className={`${connectionErrorClass} flex items-center justify-between gap-3`}><span>{error}</span><SecondaryButton value="Try again" onClick={() => setVersion(value => value + 1)} /></div> : groups.length ? groups.map(group => (
          <section key={group.name} className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{group.name}</h3>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map(entry => <button key={entry.id} type="button" onClick={() => onSelect(entry)} className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50/40 p-2.5 text-left outline-none transition-colors hover:border-[#8a2be2]/40 hover:bg-purple-50/60 focus-visible:ring-2 focus-visible:ring-[#8a2be2] dark:border-slate-700 dark:bg-[#131c2d]/40 dark:hover:border-[#FFA500]/40 dark:hover:bg-[#FFA500]/5 dark:focus-visible:ring-[#FFA500]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-[#8a2be2] dark:bg-[#FFA500]/10 dark:text-[#FFA500]"><ConnectorCatalogIcon iconKey={entry.iconKey} className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1 break-words text-xs font-semibold">{entry.name}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-colors group-hover:text-[#8a2be2] dark:group-hover:text-[#FFA500]" />
              </button>)}
            </div>
          </section>
        )) : <p role="status" className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">{entries.length ? "No integrations match your search." : "No enabled integrations are available for this connector type."}</p>}
      </div>
      <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-700/60 dark:bg-[#131c2d]/50"><SecondaryButton value="Cancel" onClick={onClose} /></div>
    </ConnectionDialog>
  );
}
