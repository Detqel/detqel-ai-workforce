"use client";

import { useDeferredValue } from "react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import type { DocumentAssetContext } from "@/components/ui/document-asset-image";
import { CHAT_COMPOSER_MAX_HEIGHT_PX } from "@/constants/discussionConstants";

const MARKDOWN_SYNTAX = /(?:^|\n)(?:\s{0,3}(?:#{1,6}\s|>\s|[-+*]\s|\d+[.)]\s|```|~~~)| {4}\S)|\*\*|__|~~|`|\*[^*\n]+\*|_[^_\n]+_|!?\[[^\]\n]*\]\(|\$[^$\n]+\$|\$\$|\\[([]|https?:\/\/|\|/m;

export function ComposerMarkdownPreview({ content, assetContext }: { content: string; assetContext?: DocumentAssetContext }) {
  const preview = useDeferredValue(content);
  if (!MARKDOWN_SYNTAX.test(preview)) return null;

  return <section aria-label="Live Markdown preview" className="w-full min-w-0 border-b border-slate-200/70 pb-2 dark:border-slate-700/70">
    <p className="mb-1 text-[10px] font-semibold text-slate-400">Markdown preview</p>
    <div tabIndex={0} aria-label="Rendered draft" style={{ maxHeight: CHAT_COMPOSER_MAX_HEIGHT_PX }} className="min-w-0 overflow-x-hidden overflow-y-auto rounded-lg px-1 text-xs text-slate-800 focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-200 [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_pre]:overflow-x-hidden">
      <MarkdownContent content={preview} assetContext={assetContext} />
    </div>
  </section>;
}
