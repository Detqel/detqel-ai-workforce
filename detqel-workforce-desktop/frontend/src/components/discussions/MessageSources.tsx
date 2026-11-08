import React from "react";
import { ExternalLink } from "lucide-react";
import type { ChatMessageSource } from "./discussionView";

/** The sources a reply cites; web sources open in the browser. */
export function MessageSources({ sources, idPrefix }: { sources: ChatMessageSource[]; idPrefix: string }) {
  if (sources.length === 0) return null;
  return (
    <div className="pt-1.5 mt-1 border-t border-slate-100 dark:border-slate-800/80 space-y-1">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Sources</span>
      <ul className="space-y-0.5">
        {sources.map((source, index) => (
          <li key={`${idPrefix}-src-${index}`} className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
            {source.url ? (
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline truncate">
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{source.title || source.url}</span>
              </a>
            ) : (
              <span className="truncate">{source.title || source.reference}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
