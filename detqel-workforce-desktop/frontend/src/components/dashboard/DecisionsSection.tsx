"use client";

import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2, MessageCircleQuestion } from "lucide-react";
import { apiListDiscussionQuestions, type PendingQuestion } from "@/lib/api/discussions";
import { setDiscussionSessionTarget } from "@/lib/discussionStore";
import { useNavigation } from "@/context/NavigationContext";
import { useDashboardResource } from "@/hooks/useDashboardResource";
import { SecondaryButton } from "@/components/ui/secondary-button";

export function DecisionsSection({ workspaceId }: { workspaceId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = expanded ? 20 : 5;
  const { navigate } = useNavigation();
  const load = useCallback((signal: AbortSignal) => apiListDiscussionQuestions(workspaceId, { limit, offset }, signal), [workspaceId, limit, offset]);
  return <DecisionsPage key={`${workspaceId}:${limit}:${offset}`} load={load} expanded={expanded} offset={offset} limit={limit}
    onExpand={() => { setExpanded(value => !value); setOffset(0); }} onPage={setOffset}
    onOpen={question => { setDiscussionSessionTarget({ workspaceId, sessionId: question.sessionId, questionId: question.id }); navigate("discussions"); }} />;
}

function DecisionsPage({ load, expanded, offset, limit, onExpand, onPage, onOpen }: {
  load: (signal: AbortSignal) => ReturnType<typeof apiListDiscussionQuestions>;
  expanded: boolean; offset: number; limit: number; onExpand: () => void; onPage: (offset: number) => void; onOpen: (question: PendingQuestion) => void;
}) {
  const { data, error, loading, reload } = useDashboardResource(load);
  return <section aria-labelledby="pending-decisions-title" className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#182234]">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
      <div className="flex items-center gap-2.5"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" /><div>
        <h2 id="pending-decisions-title" className="text-sm font-bold">Decisions Waiting for You</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{data ? `${data.total} unanswered agent ${data.total === 1 ? "request" : "requests"}` : "Questions from your discussions that need your input."}</p>
      </div></div>
      {(expanded || (data?.total ?? 0) > 5) && <button type="button" onClick={onExpand} className="shrink-0 text-xs font-semibold text-primary">{expanded ? "Show fewer" : "View all"}</button>}
    </div>
    {error && <div role="alert" className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"><p>{error}</p><div className="flex gap-2"><SecondaryButton value="Try again" onClick={reload} />{offset > 0 && <SecondaryButton value="Previous page" onClick={() => onPage(Math.max(0, offset - limit))} />}</div></div>}
    {loading ? <p role="status" className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading unanswered questions...</p>
      : data?.items.length ? <div className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">{data.items.map(question => <button key={question.id} type="button" onClick={() => onOpen(question)} className="group flex w-full items-start gap-3 py-4 text-left focus-visible:outline-2 focus-visible:outline-primary">
        <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold group-hover:text-primary">{question.sessionTitle}</span>
          <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-300">{question.questions[0].question}</span>
          <span className="mt-1.5 block text-[10px] text-slate-500 dark:text-slate-400">{question.speakerName ?? "Agent"} ? {new Date(question.createdAt).toLocaleString()}{question.questions.length > 1 ? ` ? ${question.questions.length} questions` : ""}</span>
        </span><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 group-hover:text-primary" />
      </button>)}</div>
      : data && <div role="status" className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center"><MessageCircleQuestion className="h-8 w-8 text-slate-400" /><p className="text-sm font-semibold">{data.total ? "No questions on this page" : "No unanswered questions"}</p><p className="max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">When an agent needs your input, the discussion will appear here. Open it to answer and continue the work.</p></div>}
    {data && (offset > 0 || offset + limit < data.total) && <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"><SecondaryButton value="Previous" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - limit))} /><span className="text-[10px] text-slate-500">{offset + 1}?{Math.min(offset + limit, data.total)} of {data.total}</span><SecondaryButton value="Next" disabled={offset + limit >= data.total} onClick={() => onPage(offset + limit)} /></div>}
  </section>;
}
