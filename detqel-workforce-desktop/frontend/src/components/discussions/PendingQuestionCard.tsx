"use client";

import { useState, type ReactNode } from "react";
import { Check, CornerDownLeft, MessageCircleQuestion, PenLine } from "lucide-react";
import type { PendingQuestion } from "@/lib/api/discussions";

type Question = PendingQuestion["questions"][number];
interface Answer { option: string | null; custom: string; writing: boolean }

/** The question list the server appends to the asking message; the card replaces it while the question is open. */
export function questionIntro(content: string, questions: Question[]): string {
  const block = questions.map((item, index) => `${index + 1}. ${item.question}${item.options.length ? `\n${item.options.map(option => `   - ${option}`).join("\n")}` : ""}`).join("\n\n");
  if (content.trim() === block) return "";
  return content.endsWith(`\n\n${block}`) ? content.slice(0, -block.length - 2) : content;
}

const valueOf = (answer: Answer) => (answer.writing ? answer.custom : answer.option ?? "").trim();

/** Numbered answers line up with the numbered questions kept in the asking message. */
function answerText(questions: Question[], answers: Answer[]): string {
  const values = answers.map(valueOf);
  return questions.length === 1 ? values[0] : values.map((value, index) => `${index + 1}. ${value}`).join("\n");
}

/**
 * An agent's open question, answered in place. Choices stay local until the user continues, and continuing
 * resumes the original request rather than starting a new one.
 */
export function PendingQuestionCard({ item, disabled, onSubmit }: {
  item: PendingQuestion;
  disabled: boolean;
  onSubmit: (questionId: string, text: string) => void;
}) {
  const [answers, setAnswers] = useState<Answer[]>(() => item.questions.map(question => ({ option: null, custom: "", writing: question.options.length === 0 })));
  const answered = answers.filter(answer => valueOf(answer)).length;
  const complete = answered === item.questions.length;
  const update = (index: number, change: Partial<Answer>) => setAnswers(current => current.map((answer, at) => at === index ? { ...answer, ...change } : answer));
  const submit = () => { if (complete && !disabled) onSubmit(item.id, answerText(item.questions, answers)); };
  const many = item.questions.length > 1;

  return <section aria-label={`${item.speakerName ?? "Agent"} needs your input`} className="ml-11 mr-12 max-w-3xl overflow-hidden rounded-2xl border border-primary-border bg-white text-xs shadow-xs dark:bg-slate-900">
    <header className="flex items-center justify-between gap-3 border-b border-primary-border bg-primary-surface px-4 py-2.5">
      <p className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100"><MessageCircleQuestion className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{item.speakerName ?? "Agent"} needs your input</p>
      {many && <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">{answered} of {item.questions.length} answered</span>}
    </header>

    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {item.questions.map((question, index) => {
        const answer = answers[index];
        const labelId = `${item.id}-q${index}`;
        return <fieldset key={index} disabled={disabled} className="space-y-2.5 px-4 py-3.5">
          <legend id={labelId} className="flex gap-2 font-medium leading-relaxed text-slate-800 dark:text-slate-100">
            {many && <span className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${valueOf(answer) ? "bg-primary text-primary-fg" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>{valueOf(answer) ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}</span>}
            <span className="whitespace-pre-wrap break-words">{question.question}</span>
          </legend>
          {question.options.length > 0 && <div role="radiogroup" aria-labelledby={labelId} className="grid gap-1.5 sm:grid-cols-2">
            {question.options.map(option => <Choice key={option} label={option} selected={!answer.writing && answer.option === option} onSelect={() => update(index, { option, writing: false })} />)}
            <Choice label="Something else" icon={<PenLine className="h-3 w-3" aria-hidden="true" />} selected={answer.writing} onSelect={() => update(index, { writing: true })} />
          </div>}
          {answer.writing && <input type="text" value={answer.custom} autoFocus={question.options.length > 0} maxLength={2000} aria-labelledby={labelId}
            onChange={event => update(index, { custom: event.target.value })}
            onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }}
            placeholder="Type your answer"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />}
        </fieldset>;
      })}
    </div>

    <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-800/40">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">Nothing is sent until you continue.</p>
      <button type="button" onClick={submit} disabled={!complete || disabled}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-fg shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
        Continue <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
      </button>
    </footer>
  </section>;
}

function Choice({ label, icon, selected, onSelect }: { label: string; icon?: ReactNode; selected: boolean; onSelect: () => void }) {
  return <button type="button" role="radio" aria-checked={selected} onClick={onSelect}
    className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${selected
      ? "border-primary bg-primary-muted font-medium text-primary"
      : "border-slate-200 text-slate-700 hover:border-primary-border hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-fg" : "border-slate-300 dark:border-slate-600"}`}>
      {selected && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
    </span>
    <span className="min-w-0 flex-1 break-words">{label}</span>{icon && <span className="shrink-0 text-slate-400">{icon}</span>}
  </button>;
}
