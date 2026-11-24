"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Globe, Loader2 } from "lucide-react";
import { connectionDiscoveryApi, type DiscoveredConnection } from "@/lib/api/connection-discovery";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { connectionErrorClass } from "./ConnectionDialog";

export function ConnectorDiscoveryResults({ workspaceId, query, onSelect }: {
  workspaceId: string; query: string; onSelect: (entry: DiscoveredConnection) => void;
}) {
  const [result, setResult] = useState<Awaited<ReturnType<typeof connectionDiscoveryApi.discover>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    connectionDiscoveryApi.discover({ workspaceId, query }, controller.signal).then(value => {
      if (active) setResult(value);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Connector discovery could not be completed."); });
    return () => { active = false; controller.abort(); };
  }, [workspaceId, query, version]);
  return <section className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-700">
    <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"><Globe className="h-3.5 w-3.5" />Discover from the web</h3>
    {error ? <div role="alert" className={connectionErrorClass}><p>{error}</p><SecondaryButton value="Try again" onClick={() => { setError(null); setResult(null); setVersion(value => value + 1); }} className="mt-2" /></div>
      : !result ? <p role="status" className="flex items-center gap-2 py-5 text-xs text-slate-500 dark:text-slate-400"><Loader2 className="h-4 w-4 animate-spin" />Finding {query} connectivity and preparing its configuration…</p>
      : <>
        {result.message && <p role="status" className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">{result.message}</p>}
        <div className="grid gap-3 sm:grid-cols-2">{result.entries.map(entry => <div key={entry.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <button type="button" onClick={() => onSelect(entry)} className="group flex w-full items-start justify-between gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-primary">
            <span><span className="block text-xs font-semibold group-hover:text-primary">{entry.name}</span><span className="mt-1 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{entry.description}</span></span><ArrowUpRight className="h-4 w-4 shrink-0 text-primary" />
          </button>
          {entry.discovery?.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 break-all text-[10px] text-primary underline underline-offset-2">{new URL(source.url).hostname}<ArrowUpRight className="h-3 w-3 shrink-0" /></a>)}
        </div>)}</div>
        {!result.entries.length && result.sources.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-1">{result.sources.slice(0, 3).map(source => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary underline underline-offset-2">{source.title}</a>)}</div>}
      </>}
  </section>;
}
