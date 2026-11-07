import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import { RAG_ERRORS, RAG_FIELDS, RAG_MILVUS, RAG_MILVUS_ENDPOINTS } from "../../constants/ragConstants.js";

const logger = createScopedLogger("milvus-client");

export interface MilvusConfig {
    readonly address: string;
    readonly token?: string;
}

export interface MilvusVectorRecord {
    readonly id: string;
    readonly vector: ReadonlyArray<number>;
    readonly text: string;
    readonly source: string;
    readonly chunkIndex: number;
}

export interface MilvusSearchHit {
    readonly text: string;
    readonly source: string;
    readonly chunkIndex: number;
    readonly score: number;
}

/**
 * Minimal Milvus REST client covering the operations RAG needs: create/has/drop a collection and insert/search
 * vectors. Kept dependency-free and bounded (timeouts + response-size cap) so a misbehaving vector store cannot
 * hang or exhaust the backend. Each session owns its own collection, isolating session knowledge.
 */
export class MilvusClient {
    private readonly baseUrl: string;

    constructor(private readonly config: MilvusConfig) {
        this.baseUrl = (config.address ?? "").replace(/\/+$/, "");
    }

    private assertConfigured(): void {
        if (!this.baseUrl) throw new AppError(503, RAG_ERRORS.milvusUnavailable);
    }

    async hasCollection(collection: string, signal?: AbortSignal): Promise<boolean> {
        this.assertConfigured();
        const payload = await this.request(RAG_MILVUS_ENDPOINTS.hasCollection, { collectionName: collection }, signal) as { data?: { has?: unknown } };
        return payload.data?.has === true;
    }

    /** Creates a session collection with a fixed schema for the given embedding dimension. Idempotent-safe. */
    async createCollection(collection: string, dimension: number, signal?: AbortSignal): Promise<void> {
        if (await this.hasCollection(collection, signal)) return;
        await this.request(RAG_MILVUS_ENDPOINTS.createCollection, {
            collectionName: collection,
            schema: {
                fields: [
                    { fieldName: RAG_FIELDS.id, dataType: "VarChar", isPrimary: true, elementTypeParams: { max_length: RAG_MILVUS.idMaxLength } },
                    { fieldName: RAG_FIELDS.vector, dataType: "FloatVector", elementTypeParams: { dim: dimension } },
                    { fieldName: RAG_FIELDS.text, dataType: "VarChar", elementTypeParams: { max_length: RAG_MILVUS.textMaxLength } },
                    { fieldName: RAG_FIELDS.source, dataType: "VarChar", elementTypeParams: { max_length: RAG_MILVUS.sourceMaxLength } },
                    { fieldName: RAG_FIELDS.chunkIndex, dataType: "Int64" },
                ],
            },
            indexParams: [{ fieldName: RAG_FIELDS.vector, metricType: RAG_MILVUS.metricType, indexName: `${RAG_FIELDS.vector}_idx` }],
        }, signal);
        logger.info({ collection, dimension }, "Created session vector collection");
    }

    async insert(collection: string, records: ReadonlyArray<MilvusVectorRecord>, signal?: AbortSignal): Promise<number> {
        if (records.length === 0) return 0;
        const data = records.map(record => ({
            [RAG_FIELDS.id]: record.id,
            [RAG_FIELDS.vector]: [...record.vector],
            [RAG_FIELDS.text]: record.text,
            [RAG_FIELDS.source]: record.source,
            [RAG_FIELDS.chunkIndex]: record.chunkIndex,
        }));
        await this.request(RAG_MILVUS_ENDPOINTS.insert, { collectionName: collection, data }, signal);
        return records.length;
    }

    async search(collection: string, vector: ReadonlyArray<number>, topK: number, signal?: AbortSignal): Promise<MilvusSearchHit[]> {
        const payload = await this.request(RAG_MILVUS_ENDPOINTS.search, {
            collectionName: collection,
            data: [[...vector]],
            annsField: RAG_FIELDS.vector,
            limit: topK,
            outputFields: [RAG_FIELDS.text, RAG_FIELDS.source, RAG_FIELDS.chunkIndex],
        }, signal) as { data?: Array<Record<string, unknown>> };
        const rows = Array.isArray(payload.data) ? payload.data : [];
        return rows.map(row => ({
            text: typeof row[RAG_FIELDS.text] === "string" ? (row[RAG_FIELDS.text] as string) : "",
            source: typeof row[RAG_FIELDS.source] === "string" ? (row[RAG_FIELDS.source] as string) : "",
            chunkIndex: typeof row[RAG_FIELDS.chunkIndex] === "number" ? (row[RAG_FIELDS.chunkIndex] as number) : 0,
            score: typeof row.distance === "number" ? (row.distance as number) : 0,
        }));
    }

    async dropCollection(collection: string, signal?: AbortSignal): Promise<void> {
        if (!(await this.hasCollection(collection, signal))) return;
        await this.request(RAG_MILVUS_ENDPOINTS.dropCollection, { collectionName: collection }, signal);
        logger.info({ collection }, "Dropped session vector collection");
    }

    private async request(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        const headers = new Headers({ "Content-Type": "application/json" });
        if (this.config.token) headers.set("Authorization", `Bearer ${this.config.token}`);
        const timeout = AbortSignal.timeout(RAG_MILVUS.requestTimeoutMs);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, { method: "POST", headers, body: JSON.stringify(body), redirect: "error", signal: combined });
        } catch {
            logger.error({ path }, "Vector store request did not complete");
            throw new AppError(502, RAG_ERRORS.milvusRequestFailed);
        }
        const text = await this.readBounded(response);
        if (!response.ok) throw new AppError(502, RAG_ERRORS.milvusRequestFailed);
        let payload: { code?: unknown };
        try {
            payload = JSON.parse(text) as { code?: unknown };
        } catch {
            throw new AppError(502, RAG_ERRORS.milvusRequestFailed);
        }
        if (typeof payload.code === "number" && payload.code !== RAG_MILVUS.successCode) {
            logger.error({ path, code: payload.code }, "Vector store returned an error code");
            throw new AppError(502, RAG_ERRORS.milvusRequestFailed);
        }
        return payload;
    }

    private async readBounded(response: Response): Promise<string> {
        if (response.body === null) return "";
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                length += chunk.value.byteLength;
                if (length > RAG_MILVUS.responseLimitBytes) {
                    await reader.cancel();
                    throw new AppError(502, RAG_ERRORS.oversizedResponse);
                }
                chunks.push(chunk.value);
            }
        } finally {
            reader.releaseLock();
        }
        return Buffer.concat(chunks).toString("utf8");
    }
}
