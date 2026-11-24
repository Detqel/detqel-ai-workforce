"use client";

import { MessageCircleQuestion } from "lucide-react";
import type { PendingQuestion } from "@/lib/api/discussions";

export function PendingQuestionsPanel({ questions, selectedId, disabled, onSelect, onChoice }: {
  questions: PendingQuestion[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
  onChoice: (id: string, text: string) => void;
}) {
  if (!questions.length) return null;
  return <section aria-label="Unanswered agent questions" className="mb-3 max-h-60 space-y-2 overflow-y-auto rounded-xl border border-primary-border bg-primary-surface p-3 text-xs">
    {questions.map(item => <div key={item.id} className="space-y-2">
      <div className="flex items-center justify-between gap-3"><p className="flex items-center gap-2 font-semibold"><MessageCircleQuestion className="h-4 w-4 shrink-0 text-primary" />{item.speakerName ?? "Agent"} needs your input</p>
        <button type="button" disabled={disabled} onClick={() => onSelect(selectedId === item.id ? null : item.id)} className="shrink-0 font-semibold text-primary disabled:opacity-50">{selectedId === item.id ? "Send a new message instead" : "Answer this"}</button></div>
      {selectedId === item.id ? <>
        {item.questions.map((question, index) => <div key={index} className="space-y-2"><p className="whitespace-pre-wrap break-words leading-relaxed text-slate-800 dark:text-slate-200">{item.questions.length > 1 ? `${index + 1}. ` : ""}{question.question}</p>
          {question.options.length > 0 && <div className="flex flex-wrap gap-2">{question.options.map(option => <button type="button" key={option} disabled={disabled} onClick={() => onChoice(item.id, item.questions.length > 1 ? `${question.question}\n${option}` : option)} className="rounded-lg border border-primary-border bg-white px-2.5 py-1.5 text-left text-primary hover:bg-primary-muted disabled:opacity-50 dark:bg-slate-900">{option}</button>)}</div>}
        </div>)}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Reply below with an option or your own answer. Sending it continues the original request.</p>
      </> : <p className="truncate text-slate-600 dark:text-slate-400">{item.questions[0].question}</p>}
    </div>)}
  </section>;
}
