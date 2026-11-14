import { AGENT_CONTEXT_CACHE, AGENT_TOOL_LIMITS } from "../../constants/agentContextConstants.js";
import { AppError } from "../errors/app-error.js";
import { redactText } from "../agents/context/data-guard.js";
import type { FileServer, SessionLocation } from "./file-server.js";
import type { RagService, RetrievedChunk } from "./rag.service.js";

export interface KnowledgeDocument {
    readonly name: string;
    readonly size: number;
}

export interface KnowledgePage {
    readonly name: string;
    readonly page: number;
    readonly pages: number;
    readonly text: string;
}

/** Text documents only; anything with a NUL byte is binary and would reach the model as noise. */
export function knowledgeText(contents: Buffer): string {
    if (contents.includes(0)) throw new AppError(415, "This file is not a text document. Upload text, Markdown, CSV, JSON or code files, or save the document as text first.");
    const text = contents.toString("utf8");
    if (!text.trim()) throw new AppError(400, "The document contains no text to index.");
    return text;
}

/**
 * A discussion's uploaded knowledge, readable by its agents in three ways:
 * - CAG: when all documents fit the cache budget, they are preloaded whole into the cacheable prompt prefix.
 * - RAG: otherwise each question searches the documents' embedded chunks.
 * - Agentic: an agent can list the documents and read any of them page by page.
 * Everything handed to an agent is redacted for credentials first.
 */
export class SessionKnowledge {
    constructor(private readonly files: FileServer, private readonly rag: RagService) {}

    async documents(location: SessionLocation): Promise<KnowledgeDocument[]> {
        const stored = await this.files.listKnowledgeFiles(location);
        return stored.map(file => ({ name: file.name, size: file.size })).sort((left, right) => left.name.localeCompare(right.name));
    }

    /** The whole knowledge base when it fits the cache budget; null when it is too large and must be searched. */
    async cacheable(location: SessionLocation): Promise<string | null> {
        const documents = await this.documents(location);
        if (!documents.length) return null;
        if (documents.reduce((total, document) => total + document.size, 0) > AGENT_CONTEXT_CACHE.maxKnowledgeCharacters) return null;
        const parts: string[] = [];
        let used = 0;
        for (const document of documents) {
            const text = redactText((await this.files.readKnowledgeFile(location, document.name)).toString("utf8"));
            used += text.length;
            if (used > AGENT_CONTEXT_CACHE.maxKnowledgeCharacters) return null;
            parts.push(`### ${document.name}\n${text.trim()}`);
        }
        return parts.join("\n\n");
    }

    async read(location: SessionLocation, name: string, page = 1): Promise<KnowledgePage> {
        const documents = await this.documents(location);
        if (!documents.some(document => document.name === name)) throw new AppError(404, `No knowledge document is named "${name}". List the documents to see their names.`);
        const text = redactText((await this.files.readKnowledgeFile(location, name)).toString("utf8"));
        const size = AGENT_TOOL_LIMITS.knowledgePageCharacters;
        const pages = Math.max(1, Math.ceil(text.length / size));
        if (!Number.isInteger(page) || page < 1 || page > pages) throw new AppError(400, `Page must be from 1 to ${pages}.`);
        return { name, page, pages, text: text.slice((page - 1) * size, page * size) };
    }

    async search(workspaceId: string, sessionId: string, query: string, topK: number = AGENT_TOOL_LIMITS.knowledgeSearchResults): Promise<RetrievedChunk[]> {
        const hits = await this.rag.retrieve(workspaceId, sessionId, query, topK);
        return hits.map(hit => ({ ...hit, text: redactText(hit.text) }));
    }

    async remove(location: SessionLocation, name: string): Promise<boolean> {
        const removed = await this.files.deleteKnowledgeFile(location, name);
        if (removed) await this.rag.deleteDocument(location.sessionId, name);
        return removed;
    }
}
