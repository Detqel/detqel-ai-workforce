import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "../../src/shared/rag/chunker.js";
import { MilvusClient } from "../../src/shared/rag/milvus.client.js";
import { RagService } from "../../src/shared/rag/rag.service.js";
import type { LiteLlmClient } from "../../src/shared/agents/litellm.client.js";
import type { VirtualKeyRegistry } from "../../src/shared/agents/virtual-key.registry.js";
import { RAG_CHUNK } from "../../src/constants/ragConstants.js";

describe("RAG chunker", () => {
    test("returns a single chunk for short text", () => {
        const chunks = chunkText("A short note.");
        assert.equal(chunks.length, 1);
        assert.equal(chunks[0].index, 0);
    });

    test("returns no chunks for whitespace only", () => {
        assert.deepEqual(chunkText("   \n  "), []);
    });

    test("splits long text into overlapping, ordered, bounded chunks", () => {
        const long = "sentence. ".repeat(600); // ~6000 chars
        const chunks = chunkText(long);
        assert.ok(chunks.length > 1);
        chunks.forEach((chunk, i) => {
            assert.equal(chunk.index, i);
            assert.ok(chunk.text.length <= RAG_CHUNK.targetCharacters, "no chunk exceeds the target size");
        });
    });
});

const originalFetch = globalThis.fetch;

describe("MilvusClient", () => {
    afterEach(() => { globalThis.fetch = originalFetch; });

    test("an unconfigured address fails fast at the point of use", async () => {
        await assert.rejects(() => new MilvusClient({ address: "" }).hasCollection("c"), /vector store is not configured/);
    });

    test("search maps rows into normalised hits", async () => {
        globalThis.fetch = (async (url: unknown) => {
            if (String(url).endsWith("/entities/search")) {
                return new Response(JSON.stringify({ code: 0, data: [{ text: "chunk a", source: "doc.txt", chunk_index: 0, distance: 0.9 }] }), { status: 200 });
            }
            return new Response(JSON.stringify({ code: 0 }), { status: 200 });
        }) as typeof fetch;
        const client = new MilvusClient({ address: "http://127.0.0.1:19530" });
        const hits = await client.search("c", [0.1, 0.2], 3);
        assert.equal(hits.length, 1);
        assert.equal(hits[0].text, "chunk a");
        assert.equal(hits[0].score, 0.9);
    });

    test("a non-zero Milvus code surfaces a clean error", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify({ code: 100, message: "boom" }), { status: 200 })) as typeof fetch;
        const client = new MilvusClient({ address: "http://127.0.0.1:19530" });
        await assert.rejects(() => client.hasCollection("c"), /vector store rejected a request/);
    });
});

/** A gateway whose embeddings return a fixed 3-dim vector per input, so RAG can be tested without Ollama. */
function fakeGateway(): LiteLlmClient {
    return {
        async embeddings(_key: string, request: { input: string[] }) {
            return { vectors: request.input.map(() => [0.1, 0.2, 0.3]), tokensUsed: request.input.length };
        },
    } as unknown as LiteLlmClient;
}

function fakeKeys(): VirtualKeyRegistry {
    return { async resolveProcessKey() { return { virtualKey: "sk-virtual-embed", modelAlias: "ollama-embed" }; } } as unknown as VirtualKeyRegistry;
}

/** An in-memory Milvus double recording inserts and returning them on search. */
function fakeMilvus() {
    const collections = new Map<string, { id: string; text: string; source: string }[]>();
    const client = {
        async hasCollection(c: string) { return collections.has(c); },
        async createCollection(c: string) { if (!collections.has(c)) collections.set(c, []); },
        async insert(c: string, records: Array<{ id: string; text: string; source: string }>) { collections.get(c)!.push(...records); return records.length; },
        async search(c: string, _v: number[], topK: number) { return (collections.get(c) ?? []).slice(0, topK).map(r => ({ text: r.text, source: r.source, chunkIndex: 0, score: 1 })); },
        async dropCollection(c: string) { collections.delete(c); },
    } as unknown as MilvusClient;
    return { client, collections };
}

describe("RagService", () => {
    test("ingesting a document stores chunks and retrieval is isolated per session", async () => {
        const { client, collections } = fakeMilvus();
        const rag = new RagService(fakeGateway(), fakeKeys(), client);
        const stored = await rag.ingestDocument({ workspaceId: "ws", sessionId: "s1", source: "doc.txt", text: "Hello world from the knowledge base." });
        assert.ok(stored >= 1);

        const sessionTwo = await rag.retrieve("ws", "s2", "hello");
        assert.deepEqual(sessionTwo, [], "a different session sees nothing");

        const sessionOne = await rag.retrieve("ws", "s1", "hello");
        assert.ok(sessionOne.length >= 1);
        assert.equal(collections.size, 1);
    });

    test("ingesting an empty document fails fast", async () => {
        const { client } = fakeMilvus();
        const rag = new RagService(fakeGateway(), fakeKeys(), client);
        await assert.rejects(() => rag.ingestDocument({ workspaceId: "ws", sessionId: "s1", source: "empty.txt", text: "   " }), /no text to index/);
    });

    test("deleting a session drops its collection", async () => {
        const { client, collections } = fakeMilvus();
        const rag = new RagService(fakeGateway(), fakeKeys(), client);
        await rag.ingestDocument({ workspaceId: "ws", sessionId: "s1", source: "d.txt", text: "content here" });
        await rag.deleteSession("s1");
        assert.equal(collections.size, 0);
    });

    test("retrieve rejects an out-of-range result count", async () => {
        const { client } = fakeMilvus();
        const rag = new RagService(fakeGateway(), fakeKeys(), client);
        await assert.rejects(() => rag.retrieve("ws", "s1", "q", 999), /out of range/);
    });
});
