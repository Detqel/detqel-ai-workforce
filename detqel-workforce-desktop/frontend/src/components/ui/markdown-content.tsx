"use client";

import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex, { type Options as KatexOptions } from "rehype-katex";
import "katex/dist/katex.min.css";
import { prepareMarkdown } from "@/lib/markdown";

/**
 * KaTeX runs untrusted model output: commands that could add links, classes, or styles (\href, \url, \htmlClass…)
 * stay disabled, sizes and macro expansion are bounded, and a malformed formula shows its source instead of
 * breaking the reply.
 */
const KATEX_OPTIONS: KatexOptions = { strict: "ignore", trust: false, maxSize: 20, maxExpand: 500 };

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: NonNullable<React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [[rehypeKatex, KATEX_OPTIONS]];

// Raw HTML in a reply is never rendered (react-markdown escapes it), and link targets pass its URL sanitiser.
const COMPONENTS: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }) => <h3 className="mt-3 mb-1.5 first:mt-0 text-sm font-bold text-slate-900 dark:text-slate-100">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-3 mb-1.5 first:mt-0 text-[13px] font-bold text-slate-900 dark:text-slate-100">{children}</h4>,
  h3: ({ children }) => <h5 className="mt-2.5 mb-1 first:mt-0 text-xs font-bold text-slate-900 dark:text-slate-100">{children}</h5>,
  h4: ({ children }) => <h6 className="mt-2 mb-1 first:mt-0 text-xs font-semibold text-slate-800 dark:text-slate-200">{children}</h6>,
  h5: ({ children }) => <h6 className="mt-2 mb-1 first:mt-0 text-xs font-semibold text-slate-800 dark:text-slate-200">{children}</h6>,
  h6: ({ children }) => <h6 className="mt-2 mb-1 first:mt-0 text-xs font-semibold text-slate-700 dark:text-slate-300">{children}</h6>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900 dark:text-slate-50">{children}</strong>,
  ul: ({ children }) => <ul className="my-2 first:mt-0 last:mb-0 pl-5 list-disc space-y-1 marker:text-slate-400">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 first:mt-0 last:mb-0 pl-5 list-decimal space-y-1 marker:text-slate-400">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed pl-0.5 [&>ul]:my-1 [&>ol]:my-1">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80 break-words">
      {children}
    </a>
  ),
  // Remote images are not loaded into the app; the reference stays available as a link.
  img: ({ src, alt }) => (typeof src === "string" && src ? (
    <a href={src} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{alt || src}</a>
  ) : null),
  blockquote: ({ children }) => (
    <blockquote className="my-2 pl-3 border-l-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-slate-200 dark:border-slate-700" />,
  code: ({ className, children }) => (
    <code className={`${className ?? ""} font-mono text-[11px] px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200`}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 p-3 rounded-xl overflow-x-auto bg-slate-900 dark:bg-black/40 text-slate-100 text-[11px] leading-relaxed [&>code]:p-0 [&>code]:bg-transparent [&>code]:text-slate-100 [&>code]:dark:text-slate-100">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="w-full border-collapse text-[11px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50 dark:bg-slate-800/60">{children}</thead>,
  th: ({ children, style }) => <th style={style} className="px-2.5 py-1.5 text-left font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">{children}</th>,
  td: ({ children, style }) => <td style={style} className="px-2.5 py-1.5 align-top border-t border-slate-100 dark:border-slate-800">{children}</td>,
};

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/** Renders an agent reply: GitHub-flavoured Markdown (tables, task lists, strikethrough) with LaTeX math. */
export const MarkdownContent = memo(function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={`min-w-0 break-words [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {prepareMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
});
