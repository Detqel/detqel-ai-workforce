"use client";

import { useEffect, useState } from "react";
import { Gauge, Loader2, Minimize2 } from "lucide-react";
import { apiGetDiscussionContext, type ConversationContext } from "@/lib/api/discussions";
import { formatTokens, formatTokensExact } from "./discussionView";

export function ContextTracker({ workspaceId, sessionId, context, busy, onContext }: {
  workspaceId: string; sessionId: string; context: ConversationContext | null | undefined; busy: boolean; onContext: (value: ConversationContext | null) => void;
}) {
  const [stored, setStored] = useState<ConversationContext | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    apiGetDiscussionContext(workspaceId, sessionId).then(value => { if (active) { setStored(value); setError(null); } }, failure => { if (active) setError(failure instanceof Error ? failure.message : "Context could not be loaded."); });
    return () => { active = false; };
  }, [workspaceId, sessionId, version]);
  const current = context === undefined ? stored : context;
  const capacity = current ? Math.max(1, current.maxInputTokens - current.reservedOutputTokens) : 0;
  const percent = current ? Math.round(current.inputTokens / capacity * 100) : 0;
  const compact = async () => {
    setPending(true); setError(null); setNotice(null);
    try {
      const value = await apiGetDiscussionContext(workspaceId, sessionId, true);
      setNotice((value?.compactionCount ?? 0) > (current?.compactionCount ?? 0) ? "Older messages summarized; full chat history is preserved." : "No older messages need compaction yet.");
      setStored(value); onContext(value);
    }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Context compaction failed."); }
    finally { setPending(false); }
  };
  return <div className="flex min-w-0 flex-wrap items-center gap-2 text-[10px] text-slate-500" aria-live="polite">
    <Gauge className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span title={current ? `Measured by LiteLLM: ${formatTokensExact(current.inputTokens)} active input tokens. Model limit: ${formatTokensExact(current.maxInputTokens)}. Reserved for reply: ${formatTokensExact(current.reservedOutputTokens)}. Automatic compaction threshold: ${formatTokensExact(current.thresholdTokens)}. Compactions: ${current.compactionCount}.` : "LiteLLM measures context when the first model request starts."}>
      {current ? `Context ${percent === 0 && current.inputTokens > 0 ? "<1" : percent}% · ${formatTokens(current.inputTokens)} / ${formatTokens(capacity)}` : "Context not measured yet"}
    </span>
    {current && <><span className="h-1 w-14 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Active context usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, percent)}><span className={`block h-full ${percent >= 80 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(100, percent)}%` }} /></span>
      <button type="button" onClick={() => { void compact(); }} disabled={busy || pending} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-slate-100 disabled:opacity-40 cursor-pointer" title="Summarize older messages to free active context. The full chat remains saved.">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Minimize2 className="h-3 w-3" />}Compact
      </button>
      {current.compactionCount > 0 && <span title={current.lastCompactedAt ? `Last compacted ${new Date(current.lastCompactedAt).toLocaleString()}` : undefined}>Compacted {current.compactionCount}×</span>}
    </>}
    {notice && <span role="status">{notice}</span>}
    {error && <span role="alert" className="max-w-72 text-red-600">{error} <button type="button" className="underline cursor-pointer" onClick={() => setVersion(value => value + 1)}>Retry</button></span>}
  </div>;
}
