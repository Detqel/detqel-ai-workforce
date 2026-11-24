"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { ConnectionDialog, connectionInputClass } from "./ConnectionDialog";
import { SecondaryButton } from "@/components/ui/secondary-button";
import type { DiscoveredConnection } from "@/lib/api/connection-discovery";
import { ConnectorDiscoveryResults } from "./ConnectorDiscoveryResults";

interface ConnectionSearchModalProps {
  workspaceId: string;
  onClose: () => void;
  onSelect: (entry: DiscoveredConnection) => void;
}

export function ConnectionSearchModal({ workspaceId, onClose, onSelect }: ConnectionSearchModalProps) {
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState<{ query: string; attempt: number } | null>(null);
  function searchWeb(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = search.trim();
    if (query.length >= 3) setSubmitted(current => ({ query, attempt: (current?.attempt ?? 0) + 1 }));
  }
  return <ConnectionDialog title="Add Connection" wide onClose={onClose}>
    <div className="shrink-0 px-5 pb-3 pt-4">
      <form onSubmit={searchWeb} className="flex min-w-0 items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search for a service or provider</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input autoFocus type="search" maxLength={100} value={search} onChange={event => { setSearch(event.target.value); setSubmitted(null); }}
            onKeyDown={event => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
            placeholder="Search for a service, e.g. Notion, Slack, MongoDB" aria-describedby="connection-search-help" className={`${connectionInputClass} pl-10`} />
        </label>
        <SecondaryButton type="submit" value="Search" disabled={search.trim().length < 3} className="shrink-0" />
      </form>
      <p id="connection-search-help" className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Enter a provider name, then press Enter or click Search to find its connectivity and required settings.</p>
    </div>
    <div className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-3 [scrollbar-gutter:stable]">
      {submitted && <ConnectorDiscoveryResults key={`${workspaceId}:${submitted.query}:${submitted.attempt}`} workspaceId={workspaceId} query={submitted.query} onSelect={onSelect} />}
    </div>
    <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-slate-700/60 dark:bg-slate-900/50"><SecondaryButton value="Cancel" onClick={onClose} /></div>
  </ConnectionDialog>;
}
