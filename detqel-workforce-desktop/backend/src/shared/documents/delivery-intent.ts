import type { DocumentFormat } from "../../constants/documentConstants.js";
export interface DeliveryIntent {
    readonly format: DocumentFormat;
    /** Font family the user asked for, such as "Raleway". */
    readonly font?: string;
}
const NOT_FONT_NAMES = new Set(["a", "an", "the", "this", "that", "same", "default", "any", "new", "nice", "good", "modern", "different", "bold", "italic", "large", "small", "bigger", "smaller", "body", "heading", "pdf", "word", "document", "throughout", "size", "style", "family", "color", "colour"]);
const FONT_PATTERNS = [
    /\b(?:in|with|using|use|apply|applying|set|choose|make\s+it)\s+(?:the\s+|a\s+)?([A-Za-z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2})\s+(?:font|typeface)(?:\s+(?:style|family))?\b/i,
    /\b(?:font|typeface)(?:\s+(?:style|family))?\s*(?:is|as|to|of|:|=|-)?\s*["']?([A-Za-z][A-Za-z0-9]*(?:\s+[A-Z][A-Za-z0-9]*){0,2})["']?/,
];
/** The font family named in a request ("use the Raleway font", "font: Open Sans"), or undefined. */
export function requestedFont(message: string): string | undefined {
    for (const pattern of FONT_PATTERNS) {
        const name = pattern.exec(message)?.[1]?.trim();
        if (name && !NOT_FONT_NAMES.has(name.toLowerCase()) && !NOT_FONT_NAMES.has(name.split(/\s+/)[0].toLowerCase())) return name;
    }
    return undefined;
}
/** The request with negated content changes ("without modifying the content") and any font choice removed. */
function packagingText(message: string): string {
    return message.toLowerCase()
        .replace(/\b(?:do not|don't|dont|without|no)\s+(?:any\s+)?(?:re-?)?(?:generat(?:e|ing)|writ(?:e|ing)|analy[sz](?:e|ing)|chang(?:e|es|ing)|edit(?:s|ing|ting)?|alter(?:ing|ations?)?|modif(?:y|ying|ications?)|rewrit(?:e|ing)|touch(?:ing)?)(?:\s+(?:it|anything|the\s+content|its\s+content|content|the\s+text|text|a\s+word|any\s+words?))?/g, "")
        .replace(fontPhrase(message), " ");
}
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches the font choice itself, so words such as "with" or "apply" around it are not read as content changes. */
function fontPhrase(message: string): RegExp {
    const font = requestedFont(message);
    const words = `\\b(?:font|typeface)(?:\\s+(?:style|family))?\\b${font ? `|\\b${escapeRegExp(font.toLowerCase()).replace(/\s+/g, "\\s+")}\\b` : ""}`;
    return new RegExp(`(?:\\b(?:apply|applying|use|using|with|in|set)\\s+)?(?:\\b(?:the|a)\\s+)?(?:${words})(?:\\s*(?:is|as|to|of|:|=)?\\s*["']?(?:${words})["']?)*(?:\\s+throughout(?:\\s+the\\s+(?:pdf|document|file))?)?`, "g");
}
const formatOf = (text: string): DocumentFormat => /\bpdf\b/.test(text) ? "pdf" : /\b(?:word|docx)\b/.test(text) ? "docx" : "md";
/** A pure packaging request reuses a completed response. Content changes always go through authoring. */
export function existingDocumentDelivery(message: string): DeliveryIntent | null {
    const text = packagingText(message);
    if (!/\b(?:compile|convert|export|save|package|format|download|turn|put|create)\b/.test(text)
        || !/\b(?:above|previous|existing|this|that|last|it|answer|response|content)\b/.test(text)
        || !/\b(?:document|file|pdf|word|docx|markdown|prd)\b/.test(text)
        || /\b(?:add|include|including|with|rewrite|regenerate|recreate|research|reanaly[sz]e|analy[sz]e|inspect|investigate|update|revise|change|edit|alter|expand|remove|replace|new|more|less|shorter|longer|improve|simplify|summarize|translate)\b/.test(text)
        || /\b(?:this|that|the)\s+(?:attached\s+|uploaded\s+)?(?:file|repository|codebase|upload)\b/.test(text)
        || /\battached\b/.test(text)) return null;
    if (/\bpdf\b/.test(text) && /\b(?:word|docx)\b/.test(text)) return null;
    const font = requestedFont(message);
    return { format: formatOf(text), ...(font ? { font } : {}) };
}
/**
 * Converting an attached document into a PDF or Word file, as written. Anything that asks for the content to be
 * changed, analysed or added to goes to the agents instead.
 */
export function attachmentConversion(message: string): DeliveryIntent | null {
    const text = packagingText(message);
    if (!/\b(?:convert|converted|export|turn|save|make|render|package|compile|create|generate|produce|give|need|want|change)\b/.test(text)
        || !/\b(?:pdf|word|docx)\b/.test(text)
        || /\b(?:add|include|including|rewrite|regenerate|recreate|research|analy[sz]e|review|inspect|investigate|update|revise|edit|alter|expand|remove|replace|improve|simplify|summari[sz]e|translate|explain|extract|compare|answer|fix|correct|shorten|lengthen|questions?)\b/.test(text)
        || /\b(?:bigger|smaller|larger|size|colou?rs?|margins?|spacing|layout|landscape|portrait|logo|header|footer)\b/.test(text)) return null;
    if (/\bpdf\b/.test(text) && /\b(?:word|docx)\b/.test(text)) return null;
    const font = requestedFont(message);
    return { format: formatOf(text), ...(font ? { font } : {}) };
}
