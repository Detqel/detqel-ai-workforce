"use client";

import React, { createContext, memo, useContext, useMemo } from "react";
import type { Element } from "hast";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import { DocumentAssetImage, type DocumentAssetContext } from "./document-asset-image";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex, { type Options as KatexOptions } from "rehype-katex";
import "katex/dist/katex.min.css";
import { prepareMarkdown } from "@/lib/markdown";
import { CopyTextButton } from "./copy-text-button";
import { MarkdownCodeBlock } from "./markdown-code-block";

/**
 * KaTeX runs untrusted model output: commands that could add links, classes, or styles (\href, \url, \htmlClass…)
 * stay disabled, sizes and macro expansion are bounded, and a malformed formula shows its source instead of
 * breaking the reply.
 */
const KATEX_OPTIONS: KatexOptions = { strict: "ignore", trust: false, maxSize: 20, maxExpand: 500 };

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS: NonNullable<React.ComponentProps<typeof ReactMarkdown>["rehypePlugins"]> = [[rehypeKatex, KATEX_OPTIONS]];
const MarkdownSource = createContext("");
const MARKDOWN_LANGUAGES = new Set(["markdown", "md", "mdown"]);
const MAX_PREVIEW_DEPTH = 4;

function tableMarkdown(node: Element | undefined, source: string): string {
  if (!node) return "";
  const rows = node.children.flatMap(group => group.type === "element" ? group.children.filter((row): row is Element => row.type === "element" && row.tagName === "tr") : []);
  if (!rows.length) return "";
  const values = rows.map(row => {
    const start = row.position?.start.offset;
    const end = row.position?.end.offset;
    return typeof start === "number" && typeof end === "number" ? source.slice(start, end) : "";
  });
  if (values.some(value => !value)) return "";
  const separator = rows[0].children.filter(cell => cell.type === "element").map(cell => {
    const align = cell.properties.align;
    return align === "center" ? ":---:" : align === "right" ? "---:" : align === "left" ? ":---" : "---";
  });
  // Row positions exclude surrounding list/blockquote markers, so the copy is a standalone GFM table.
  return [values[0], `| ${separator.join(" | ")} |`, ...values.slice(1)].join("\n");
}

function MarkdownTable({ children, node }: React.ComponentPropsWithoutRef<"table"> & { node?: Element }) {
  const source = useContext(MarkdownSource);
  const markdown = tableMarkdown(node, source);
  return <section aria-label="Table" className="my-3 min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
    <header className="flex min-h-8 select-none items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-0.5 dark:border-slate-700 dark:bg-slate-800/60">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Table</span>
      <CopyTextButton text={markdown} label="Copy table as Markdown" className="h-6 w-6" />
    </header>
    <div role="region" aria-label="Table contents" tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
      <table className="w-full min-w-[24rem] border-collapse text-xs leading-relaxed">{children}</table>
    </div>
  </section>;
}

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
  ol: ({ children, start }) => <ol start={start} className="my-2 first:mt-0 last:mb-0 pl-5 list-decimal space-y-1 marker:text-slate-400">{children}</ol>,
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
  table: MarkdownTable,
  thead: ({ children }) => <thead className="bg-slate-50 dark:bg-slate-800/60">{children}</thead>,
  th: ({ children, style }) => <th style={style} className="px-3 py-2.5 text-left align-top font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">{children}</th>,
  td: ({ children, style }) => <td style={style} className="px-3 py-2.5 align-top border-t border-slate-100 dark:border-slate-800">{children}</td>,
};

interface MarkdownContentProps {
  content: string;
  className?: string;
  assetContext?: DocumentAssetContext;
  previewDepth?: number;
}

/** Renders an agent reply: GitHub-flavoured Markdown (tables, task lists, strikethrough) with LaTeX math. */
export const MarkdownContent = memo(function MarkdownContent({ content, className, assetContext, previewDepth = 0 }: MarkdownContentProps) {
  const markdown = useMemo(() => prepareMarkdown(content), [content]);
  const components = useMemo<Components>(() => ({
    ...COMPONENTS,
    pre: ({ node, children }) => {
      const codeNode = node?.children.find((child): child is Element => child.type === "element" && child.tagName === "code");
      if (!codeNode) return <pre className="my-3 overflow-x-auto whitespace-pre font-mono text-xs">{children}</pre>;
      const code = codeNode.children.filter(child => child.type === "text").map(child => child.value).join("").replace(/\n$/, "");
      const classes = codeNode.properties.className;
      const languageClass = Array.isArray(classes) ? classes.find(value => typeof value === "string" && value.startsWith("language-")) : undefined;
      const language = typeof languageClass === "string" ? languageClass.slice(9).toLowerCase() : "text";
      return <MarkdownCodeBlock code={code} language={language}
        preview={MARKDOWN_LANGUAGES.has(language) && previewDepth < MAX_PREVIEW_DEPTH
          ? <MarkdownContent content={code} assetContext={assetContext} previewDepth={previewDepth + 1} /> : undefined} />;
    },
    img: ({ src, alt }) => {
      if (typeof src === "string" && /^kin-asset:[a-f0-9]{64}\.png$/.test(src)) {
        return assetContext ? <DocumentAssetImage key={assetContext.workspaceId + assetContext.sessionId + src} source={src} caption={alt ?? ""} context={assetContext} />
          : <span role="alert" className="text-xs text-rose-600">Open this document in its discussion to load its images.</span>;
      }
      return typeof src === "string" && src ? <a href={defaultUrlTransform(src)} target="_blank" rel="noopener noreferrer" className="text-primary underline">{alt || "Image reference"}</a> : null;
    },
  }), [assetContext, previewDepth]);
  return (
    <div data-chat-text className={`select-text cursor-text min-w-0 break-words [&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden [&_.katex-display]:py-1 ${className ?? ""}`}>
      <MarkdownSource.Provider value={markdown}>
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={components} urlTransform={(url, key) => key === "src" && /^kin-asset:[a-f0-9]{64}\.png$/.test(url) ? url : defaultUrlTransform(url)}>
          {markdown}
        </ReactMarkdown>
      </MarkdownSource.Provider>
    </div>
  );
});
