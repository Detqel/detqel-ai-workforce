"use client";

import { lazy, memo, Suspense, useState, type ReactNode } from "react";
import { CopyTextButton } from "./copy-text-button";
import "./markdown-code.css";

const HighlightedCode = lazy(() => import("./highlighted-code"));
const HIGHLIGHT_CHARACTER_LIMIT = 50_000;
const LABELS: Readonly<Record<string, string>> = {
  text: "Text", plaintext: "Text", txt: "Text", py: "Python", python: "Python",
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript", jsx: "JSX", tsx: "TSX",
  sh: "Bash", bash: "Bash", shell: "Shell", zsh: "Zsh", ps1: "PowerShell", pwsh: "PowerShell", powershell: "PowerShell",
  console: "Terminal", "shell-session": "Terminal", dos: "Batch", bat: "Batch", cmd: "Batch",
  md: "Markdown", markdown: "Markdown", mdown: "Markdown", json: "JSON", jsonc: "JSONC", yaml: "YAML", yml: "YAML",
  html: "HTML", xml: "XML", css: "CSS", scss: "SCSS", sql: "SQL", csharp: "C#", cs: "C#", cpp: "C++",
  c: "C", java: "Java", go: "Go", rust: "Rust", rs: "Rust", ruby: "Ruby", rb: "Ruby", php: "PHP",
  dockerfile: "Dockerfile", docker: "Dockerfile", diff: "Diff", toml: "TOML", ini: "INI", graphql: "GraphQL",
};

interface MarkdownCodeBlockProps {
  code: string;
  language: string;
  preview?: ReactNode;
}

export const MarkdownCodeBlock = memo(function MarkdownCodeBlock({ code, language, preview }: MarkdownCodeBlockProps) {
  const [showSource, setShowSource] = useState(false);
  const label = LABELS[language] ?? language;
  const lines = code.split(/\r\n|\r|\n/).length;
  const canHighlight = code.length <= HIGHLIGHT_CHARACTER_LIMIT;
  const isPreview = preview !== undefined && !showSource;

  return <section aria-label={`${label} block`} className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-950/50">
    <header className="flex min-h-9 select-none items-center justify-between gap-3 border-b border-slate-200 bg-slate-100/70 px-3 py-1 dark:border-slate-700 dark:bg-slate-800/70">
      <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-slate-500 dark:text-slate-400">
        <span className="truncate font-medium uppercase tracking-wide">{label}</span>
        <span className="shrink-0 text-slate-400 dark:text-slate-500">{lines} {lines === 1 ? "line" : "lines"}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {preview !== undefined && <button type="button" aria-pressed={showSource} onClick={(event) => { event.stopPropagation(); setShowSource(!showSource); }}
          className="rounded px-1.5 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-400 dark:hover:bg-slate-700">
          {showSource ? "Show preview" : "Show source"}
        </button>}
        <CopyTextButton text={code} label={preview !== undefined ? "Copy Markdown source" : `Copy ${label} block`} className="h-6 w-6" />
      </div>
    </header>
    {isPreview ? <div className="px-4 py-3">{preview}</div> : <>
      {!canHighlight && <p className="border-b border-slate-200 px-3 py-1.5 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400">Syntax colors are limited to blocks of 50,000 characters. The complete source is displayed and copied.</p>}
      <div role="region" aria-label={`${label} source`} tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
        <div className="flex w-max min-w-full items-stretch font-mono text-xs leading-5">
          <pre aria-hidden="true" style={{ userSelect: "none", WebkitUserSelect: "none" }} className="sticky left-0 z-10 m-0 shrink-0 select-none border-r border-slate-200/70 bg-slate-50 px-3 py-3 text-right font-mono text-slate-400 dark:border-slate-700/70 dark:bg-slate-900 dark:text-slate-600">{Array.from({ length: lines }, (_, index) => index + 1).join("\n")}</pre>
          <pre className="m-0 flex-1 whitespace-pre break-normal px-3 py-3 font-mono [tab-size:4]"><code className="markdown-syntax font-mono text-slate-800 dark:text-slate-200">
            {canHighlight ? <Suspense fallback={code}><HighlightedCode code={code} language={language} /></Suspense> : code}
          </code></pre>
        </div>
      </div>
    </>}
  </section>;
});
