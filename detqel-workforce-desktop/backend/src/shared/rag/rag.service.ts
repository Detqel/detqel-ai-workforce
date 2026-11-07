import { createHash } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import type { LiteLlmClient } from "../agents/litellm.client.js";
import type { VirtualKeyRegistry } from "../agents/virtual-key.registry.js";
import { chunkText } from "./chunker.js";
import type { MilvusClient, MilvusVectorRecord } from "./milvus.client.js";
import { AGENT_RUNTIME_PROCESSES } from "../../constants/agentRuntimeConstants.js";
import { RAG_COLLECTION_PREFIX, RAG_ERRORS, RAG_RETRIEVAL } from "../../constants/ragConstants.js";

const logger = createScopedLogger("rag-service");

export interface IngestDocumentInput {
    readonly workspaceId: string;
    readonly sessionId: string;
    readonly source: string;
    readonly text: string;
}

export interface RetrievedChunk {
    readonly text: string;
    readonly source: string;
    readonly score: number;
}

/** Collection name for a session, derived deterministically so it is unique and safe for Milvus. */
function collectionFor(sessionId: string): string {
    const hash = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
    return `${RAG_COLLECTION_PREFIX}${hash}`;
}

/** Deterministic primary key for a chunk so re-ingesting the same source replaces rather than duplicates. */
function chunkId(source: string, chunkIndex: number): string {
    return createHash("sha256").update(`${source}#${chunkIndex}`).digest("hex").slice(0, 63);
}

/**
 * Per-session retrieval-augmented generation. Embeddings are produced by the workspace's embeddings model
 * through the LiteLLM gateway (backed by the managed Ollama model). Each session has its own Milvus collection
 * so retrieval is strictly isolated to that session. Ingestion chunks and upserts a document; retrieval
 * embeds the query and returns the most similar chunks; cleanup drops the collection.
 */
export class RagService {
    constructor(
        private readonly gateway: LiteLlmClient,
        private readonly keys: VirtualKeyRegistry,
        private readonly milvus: MilvusClient,
    ) {}

    /** Embeds and upserts a document's chunks into the session collection. Returns the number of chunks stored. */
    async ingestDocument(input: IngestDocumentInput, signal?: AbortSignal): Promise<number> {
        const chunks = chunkText(input.text);
        if (chunks.length === 0) throw new AppError(400, RAG_ERRORS.emptyDocument);

        const vectors = await this.embed(input.workspaceId, chunks.map(chunk => chunk.text), signal);
        const collection = collectionFor(input.sessionId);
        await this.milvus.createCollection(collection, vectors[0].length, signal);

        const records: MilvusVectorRecord[] = chunks.map((chunk, position) => ({
            id: chunkId(input.source, chunk.index),
            vector: vectors[position],
            text: chunk.text,
            source: input.source,
            chunkIndex: chunk.index,
        }));
        const stored = await this.milvus.insert(collection, records, signal);
        logger.info({ workspaceId: input.workspaceId, sessionId: input.sessionId, source: input.source, chunks: stored }, "Ingested document into session collection");
        return stored;
    }

    /** Retrieves the most relevant chunks for a query within one session. Returns [] when the session has none. */
    async retrieve(workspaceId: string, sessionId: string, query: string, topK: number = RAG_RETRIEVAL.defaultTopK, signal?: AbortSignal): Promise<RetrievedChunk[]> {
        if (!Number.isInteger(topK) || topK < 1 || topK > RAG_RETRIEVAL.maxTopK) throw new AppError(400, RAG_ERRORS.invalidTopK);
        const collection = collectionFor(sessionId);
        if (!(await this.milvus.hasCollection(collection, signal))) return [];
        const [vector] = await this.embed(workspaceId, [query], signal);
        const hits = await this.milvus.search(collection, vector, topK, signal);
        return hits.map(hit => ({ text: hit.text, source: hit.source, score: hit.score }));
    }

    /** Drops a session's collection. Part of full session cleanup alongside the file-server folder removal. */
    async deleteSession(sessionId: string, signal?: AbortSignal): Promise<void> {
        await this.milvus.dropCollection(collectionFor(sessionId), signal);
    }

    private async embed(workspaceId: string, inputs: ReadonlyArray<string>, signal?: AbortSignal): Promise<number[][]> {
        const { virtualKey, modelAlias } = await this.keys.resolveProcessKey(workspaceId, AGENT_RUNTIME_PROCESSES.embeddings);
        const result = await this.gateway.embeddings(virtualKey, { model: modelAlias, input: [...inputs] }, signal);
        return result.vectors.map(vector => [...vector]);
    }
}
