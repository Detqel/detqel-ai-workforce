"use client";

import { memo, useMemo, type ReactNode } from "react";
import { all, createLowlight } from "lowlight";
import type { RootContent } from "hast";

const highlighter = createLowlight(all);
highlighter.registerAlias({ powershell: ["ps1", "pwsh"], bash: ["shell", "zsh"], plaintext: ["text", "txt"], markdown: ["md", "mdown"] });

function tokens(nodes: ReadonlyArray<RootContent>): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.type === "text") return node.value;
    if (node.type !== "element") return null;
    // Only spans and classes from the tokenizer reach React. Source HTML is always text.
    const classes = node.properties.className;
    return <span key={index} className={Array.isArray(classes) ? classes.join(" ") : undefined}>{tokens(node.children)}</span>;
  });
}

/** Loaded only for source blocks; no language guessing, code execution, or HTML injection. */
export default memo(function HighlightedCode({ code, language }: { code: string; language: string }) {
  const highlighted = useMemo(() => highlighter.registered(language) ? tokens(highlighter.highlight(language, code).children) : code, [code, language]);
  return <>{highlighted}</>;
});
