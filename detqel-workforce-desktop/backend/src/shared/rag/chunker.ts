import { RAG_CHUNK } from "../../constants/ragConstants.js";

export interface TextChunk {
    readonly index: number;
    readonly text: string;
}

/**
 * Splits document text into overlapping chunks suitable for embedding. Splitting prefers paragraph and
 * sentence boundaries, falling back to a hard character cut so no chunk exceeds the target size. Overlap keeps
 * context continuous across chunk boundaries. Returns an empty array for whitespace-only input.
 */
export function chunkText(input: string): TextChunk[] {
    const normalized = input.replace(/\r\n/g, "\n").trim();
    if (normalized.length === 0) return [];
    if (normalized.length <= RAG_CHUNK.targetCharacters) return [{ index: 0, text: normalized }];

    const chunks: TextChunk[] = [];
    let start = 0;
    let index = 0;
    while (start < normalized.length) {
        const end = Math.min(start + RAG_CHUNK.targetCharacters, normalized.length);
        const sliceEnd = end < normalized.length ? preferredBoundary(normalized, start, end) : end;
        const text = normalized.slice(start, sliceEnd).trim();
        if (text.length >= RAG_CHUNK.minCharacters) chunks.push({ index: index++, text });
        if (sliceEnd >= normalized.length) break;
        start = Math.max(sliceEnd - RAG_CHUNK.overlapCharacters, start + 1);
    }
    return chunks;
}

/** Finds the latest paragraph or sentence boundary within the window, or the hard end if none is found. */
function preferredBoundary(text: string, start: number, end: number): number {
    const window = text.slice(start, end);
    const paragraph = window.lastIndexOf("\n\n");
    if (paragraph > RAG_CHUNK.overlapCharacters) return start + paragraph + 2;
    const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf("\n"));
    if (sentence > RAG_CHUNK.overlapCharacters) return start + sentence + 1;
    return end;
}
