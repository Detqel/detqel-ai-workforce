/**
 * Text preparation for rendering agent replies as Markdown with LaTeX math.
 *
 * Models write math with several delimiters. The renderer understands $…$ and $$…$$, so \( … \) and \[ … \] are
 * rewritten to those. A dollar sign that starts a money amount ($120,000, $5.50, $3M) is escaped so it is shown as
 * money rather than opening an equation. Code spans and fenced code blocks are left exactly as written.
 */

// Fenced blocks (closed, or still open at the end of the text) and inline code spans.
const CODE_SEGMENTS = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]+`)/g;
const DISPLAY_MATH = /\\\[([\s\S]+?)\\\]/g;
const INLINE_MATH = /\\\(([\s\S]+?)\\\)/g;
// "$" + amount, optionally with a scale suffix, followed by a boundary: whitespace, punctuation, or the end.
const MONEY = /(^|[^\\$])\$(?=\d[\d,]*(?:\.\d+)?(?:[kKmMbB]n?)?(?=[\s.,;:!?)\]/-]|$))/g;

function prepareProse(prose: string): string {
  return prose
    .replace(DISPLAY_MATH, (_match, body: string) => `\n$$\n${body.trim()}\n$$\n`)
    .replace(INLINE_MATH, (_match, body: string) => `$${body.trim()}$`)
    .replace(MONEY, (_match, before: string) => `${before}\\$`);
}

/** Prepares an agent reply for the Markdown and math renderer. */
export function prepareMarkdown(text: string): string {
  return text
    .split(CODE_SEGMENTS)
    .map((segment, index) => (index % 2 === 1 ? segment : prepareProse(segment)))
    .join("");
}
