import type { DocumentFormat } from "../../constants/documentConstants.js";

/** A pure packaging request reuses a completed response. Content changes always go through authoring. */
export function existingDocumentDelivery(message: string): { format: DocumentFormat } | null {
    const text = message.toLowerCase().replace(/\b(?:do not|don't|without)\s+(?:re-?)?(?:generat(?:e|ing)|writ(?:e|ing)|analy[sz](?:e|ing)|chang(?:e|ing)|edit(?:ting)?|alter(?:ing)?)(?:\s+(?:it|anything|the content))?/g, "");
    if (!/\b(?:compile|convert|export|save|package|format|download|turn|put|create)\b/.test(text)
        || !/\b(?:above|previous|existing|this|that|last|it|answer|response|content)\b/.test(text)
        || !/\b(?:document|file|pdf|word|docx|markdown|prd)\b/.test(text)
        || /\b(?:add|include|including|with|rewrite|regenerate|recreate|research|reanaly[sz]e|analy[sz]e|inspect|investigate|update|revise|change|edit|alter|expand|remove|replace|new|more|less|shorter|longer|improve|simplify|summarize|translate)\b/.test(text)
        || /\b(?:this|that|the)\s+(?:attached\s+|uploaded\s+)?(?:file|repository|codebase|upload)\b/.test(text)) return null;
    if (/\bpdf\b/.test(text) && /\b(?:word|docx)\b/.test(text)) return null;
    return { format: /\bpdf\b/.test(text) ? "pdf" : /\b(?:word|docx)\b/.test(text) ? "docx" : "md" };
}
