import { Lexer, type Token, type Tokens } from "marked";

/** A run of text with its formatting. Math keeps its LaTeX source; files show it as a formula-styled run. */
export interface InlineRun {
    readonly text: string;
    readonly bold?: boolean;
    readonly italic?: boolean;
    readonly strike?: boolean;
    readonly code?: boolean;
    readonly math?: boolean;
    readonly link?: string;
}

export interface ListEntry {
    readonly runs: InlineRun[];
    /** Set for a task list item: whether it is ticked. */
    readonly checked?: boolean;
    readonly children: Block[];
}

export type Block =
    | { readonly type: "heading"; readonly level: number; readonly runs: InlineRun[] }
    | { readonly type: "paragraph"; readonly runs: InlineRun[] }
    | { readonly type: "list"; readonly ordered: boolean; readonly start: number; readonly items: ListEntry[] }
    | { readonly type: "code"; readonly text: string; readonly language?: string }
    | { readonly type: "math"; readonly text: string }
    | { readonly type: "quote"; readonly blocks: Block[] }
    | { readonly type: "table"; readonly header: InlineRun[][]; readonly rows: InlineRun[][][] }
    | { readonly type: "rule" };

type Style = Omit<InlineRun, "text">;

// A "$" that starts a money amount ($120,000, $5.50, $3M) is money, not the start of a formula.
const MONEY = /(^|[^\\$])\$(?=\d[\d,]*(?:\.\d+)?(?:[kKmMbB]n?)?(?=[\s.,;:!?)\]/-]|$))/g;
const MONEY_MARK = "\u0000";
const INLINE_MATH = /\\\((.+?)\\\)|\$([^$\n]+?)\$/g;
const DISPLAY_MATH = /^\s*(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])\s*$/;

const LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Only web and mail links are kept in exported files; anything else is shown as plain text. */
function safeLink(href: string): string | undefined {
    try {
        return LINK_PROTOCOLS.has(new URL(href).protocol) ? href : undefined;
    } catch {
        return undefined;
    }
}

/** Splits plain text into text and inline-math runs, leaving money amounts as text. */
function textRuns(text: string, style: Style): InlineRun[] {
    const marked = text.replace(MONEY, (_match, before: string) => `${before}${MONEY_MARK}`);
    const runs: InlineRun[] = [];
    let at = 0;
    for (const match of marked.matchAll(INLINE_MATH)) {
        if (match.index > at) runs.push({ ...style, text: marked.slice(at, match.index) });
        runs.push({ ...style, math: true, text: (match[1] ?? match[2]).trim() });
        at = match.index + match[0].length;
    }
    if (at < marked.length) runs.push({ ...style, text: marked.slice(at) });
    return runs.map(run => ({ ...run, text: run.text.replaceAll(MONEY_MARK, "$") })).filter(run => run.text.length > 0);
}

function inlineRuns(tokens: ReadonlyArray<Token> | undefined, style: Style = {}): InlineRun[] {
    const runs: InlineRun[] = [];
    for (const token of tokens ?? []) {
        switch (token.type) {
            case "strong": runs.push(...inlineRuns((token as Tokens.Strong).tokens, { ...style, bold: true })); break;
            case "em": runs.push(...inlineRuns((token as Tokens.Em).tokens, { ...style, italic: true })); break;
            case "del": runs.push(...inlineRuns((token as Tokens.Del).tokens, { ...style, strike: true })); break;
            case "codespan": runs.push({ ...style, code: true, text: (token as Tokens.Codespan).text }); break;
            case "br": runs.push({ ...style, text: "\n" }); break;
            case "link": {
                const link = token as Tokens.Link;
                runs.push(...inlineRuns(link.tokens, { ...style, link: safeLink(link.href) }));
                break;
            }
            // Images are not embedded: the reference stays readable as text.
            case "image": runs.push({ ...style, text: (token as Tokens.Image).text || (token as Tokens.Image).href }); break;
            case "text": {
                const text = token as Tokens.Text;
                if (text.tokens && text.tokens.length > 0) runs.push(...inlineRuns(text.tokens, style));
                else runs.push(...textRuns(decodeEntities(text.text), style));
                break;
            }
            case "escape": runs.push({ ...style, text: (token as Tokens.Escape).text }); break;
            // Raw HTML in a reply is kept as the literal text it was written as, never interpreted.
            case "html": runs.push({ ...style, text: (token as Tokens.HTML).text }); break;
            default: if ("text" in token && typeof token.text === "string") runs.push(...textRuns(token.text, style));
        }
    }
    return runs;
}

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };
const decodeEntities = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, entity => ENTITIES[entity]);

function listItem(item: Tokens.ListItem): ListEntry {
    const runs: InlineRun[] = [];
    const children: Block[] = [];
    for (const token of item.tokens) {
        if (token.type === "text" || token.type === "paragraph") {
            if (runs.length > 0) runs.push({ text: "\n" });
            runs.push(...inlineRuns((token as Tokens.Text).tokens ?? [token]));
        } else if (token.type !== "checkbox" && token.type !== "space") {
            children.push(...blocks([token]));
        }
    }
    return { runs, checked: item.task ? Boolean(item.checked) : undefined, children };
}

function blocks(tokens: ReadonlyArray<Token>): Block[] {
    const result: Block[] = [];
    for (const token of tokens) {
        switch (token.type) {
            case "heading": {
                const heading = token as Tokens.Heading;
                result.push({ type: "heading", level: Math.min(Math.max(heading.depth, 1), 6), runs: inlineRuns(heading.tokens) });
                break;
            }
            case "paragraph": {
                const paragraph = token as Tokens.Paragraph;
                const display = DISPLAY_MATH.exec(paragraph.text);
                if (display) result.push({ type: "math", text: (display[1] ?? display[2]).trim() });
                else result.push({ type: "paragraph", runs: inlineRuns(paragraph.tokens) });
                break;
            }
            case "list": {
                const list = token as Tokens.List;
                result.push({ type: "list", ordered: list.ordered, start: typeof list.start === "number" ? list.start : 1, items: list.items.map(listItem) });
                break;
            }
            case "code": {
                const code = token as Tokens.Code;
                // A fenced block tagged as math is a display formula.
                if (code.lang === "math" || code.lang === "latex") result.push({ type: "math", text: code.text });
                else result.push({ type: "code", text: code.text, language: code.lang || undefined });
                break;
            }
            case "blockquote": result.push({ type: "quote", blocks: blocks((token as Tokens.Blockquote).tokens) }); break;
            case "table": {
                const table = token as Tokens.Table;
                result.push({ type: "table", header: table.header.map(cell => inlineRuns(cell.tokens)), rows: table.rows.map(row => row.map(cell => inlineRuns(cell.tokens))) });
                break;
            }
            case "hr": result.push({ type: "rule" }); break;
            case "html": {
                const text = (token as Tokens.HTML).text.trim();
                if (text) result.push({ type: "paragraph", runs: [{ text }] });
                break;
            }
            case "text": result.push({ type: "paragraph", runs: inlineRuns((token as Tokens.Text).tokens ?? [token]) }); break;
            default: break;
        }
    }
    return result;
}

/** Reads a Markdown reply into blocks the Word and PDF renderers lay out. */
export function parseMarkdown(markdown: string): Block[] {
    return blocks(new Lexer({ gfm: true }).lex(markdown));
}

/** The plain text of some runs, for measuring and for fields that cannot hold formatting. */
export const plainText = (runs: ReadonlyArray<InlineRun>) => runs.map(run => run.text).join("");
