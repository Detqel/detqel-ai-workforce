/**
 * Retrieval-augmented generation is scoped per chat session. Each session gets its own Milvus collection so
 * one session's knowledge can never leak into another. Embeddings are produced by the managed Ollama model
 * through the LiteLLM gateway. Documents are chunked, embedded, and upserted on ingestion, then retrieved by
 * vector similarity at query time. Deleting a session drops its collection and its file-server folder.
 */
export const RAG_CHUNK = {
    /** Target characters per chunk and overlap between consecutive chunks, tuned for retrieval quality. */
    targetCharacters: 1_200,
    overlapCharacters: 200,
    minCharacters: 1,
} as const;

export const RAG_RETRIEVAL = {
    defaultTopK: 5,
    maxTopK: 20,
} as const;

/** The collection name is derived from the session id so it is unique and traceable. */
export const RAG_COLLECTION_PREFIX = "detqel_session_";

export const RAG_FIELDS = {
    id: "id",
    vector: "vector",
    text: "text",
    source: "source",
    chunkIndex: "chunk_index",
} as const;

export const RAG_MILVUS_ENDPOINTS = {
    createCollection: "/v2/vectordb/collections/create",
    dropCollection: "/v2/vectordb/collections/drop",
    hasCollection: "/v2/vectordb/collections/has",
    insert: "/v2/vectordb/entities/insert",
    search: "/v2/vectordb/entities/search",
} as const;

export const RAG_MILVUS = {
    metricType: "COSINE",
    idMaxLength: 64,
    textMaxLength: 8192,
    sourceMaxLength: 512,
    requestTimeoutMs: 30_000,
    responseLimitBytes: 8 * 1024 * 1024,
    successCode: 0,
} as const;

export const RAG_ERRORS = {
    embeddingsUnavailable: "The embedding service is not configured. Ensure the managed Ollama model is running, then retry.",
    milvusUnavailable: "The vector store is not configured. Ensure the managed Milvus service is running, then retry.",
    milvusRequestFailed: "The vector store rejected a request.",
    oversizedResponse: "The vector store returned an unexpectedly large response.",
    emptyDocument: "The document contains no text to index.",
    invalidTopK: "The requested result count is out of range.",
} as const;
