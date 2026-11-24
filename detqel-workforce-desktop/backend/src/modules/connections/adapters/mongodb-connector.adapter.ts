import { BSON, MongoClient } from "mongodb";
import { z } from "zod";
import { CONNECTOR_ADAPTER_KEYS } from "../../../constants/connectionConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../constants/connectorOperationConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorHandle, ConnectorOperationRequest, ConnectorRuntimeOptions } from "../../../shared/types/connection-adapter.js";
import { requiredString } from "./adapter-configuration.js";

const databaseName = z.string().trim().min(1).max(120).regex(/^[^/\\. "$*<>:|?\0]+$/);
const collectionName = z.string().trim().min(1).max(200).refine(value => !value.includes("\0") && !value.startsWith("system."));
const findSchema = z.object({ database: databaseName, collection: collectionName, filter: z.record(z.string(), z.unknown()).default({}),
    projection: z.record(z.string().max(200), z.union([z.literal(0), z.literal(1)])).optional(), limit: z.number().int().min(1).max(100).default(25) }).strict();
const tools = [
    { name: "list_databases", description: "List databases visible to the configured MongoDB account.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, readOnly: true },
    { name: "list_collections", description: "List collections in a MongoDB database.", inputSchema: { type: "object", properties: { database: { type: "string" } }, required: ["database"], additionalProperties: false }, readOnly: true },
    { name: "find_documents", description: "Read up to 100 documents using a MongoDB filter. No JavaScript predicates or writes are permitted.", inputSchema: z.toJSONSchema(findSchema), readOnly: true },
];

function safeFilter(value: unknown, depth = 0): void {
    if (depth > 20) throw new AppError(400, "The MongoDB filter is nested too deeply.");
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
        if (["$where", "$function", "$accumulator", "__proto__", "constructor", "prototype"].includes(key)) throw new AppError(403, "JavaScript predicates are not permitted in MongoDB filters.");
        safeFilter(item, depth + 1);
    }
}

/** A real driver handshake and bounded read operations. No arbitrary MongoDB commands or scripts. */
export class MongoDbConnectorAdapter implements ConnectorAdapter {
    readonly key = CONNECTOR_ADAPTER_KEYS.mongodb;
    constructor(private readonly options: ConnectorRuntimeOptions) {}
    async connect(configuration: Record<string, unknown>): Promise<ConnectorHandle> {
        const uri = requiredString(configuration, "connectionString");
        if (!/^mongodb(?:\+srv)?:\/\//i.test(uri)) throw new AppError(400, "Enter a mongodb:// or mongodb+srv:// connection string.");
        const selectedDatabase = configuration.database === undefined ? undefined : databaseName.parse(configuration.database);
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: this.options.requestTimeoutMs, connectTimeoutMS: this.options.requestTimeoutMs,
            socketTimeoutMS: this.options.requestTimeoutMs, maxPoolSize: 2, minPoolSize: 0, monitorCommands: false });
        const db = (name: string) => {
            if (selectedDatabase && name !== selectedDatabase) throw new AppError(403, "This connection is scoped to its configured database.");
            return client.db(name);
        };
        try {
            await client.connect();
            await client.db(selectedDatabase).command({ ping: 1 }, { timeoutMS: this.options.requestTimeoutMs });
            return {
                metadata: { verification: "mongodb-ping", ...(selectedDatabase ? { database: selectedDatabase } : {}), tools: tools.map(tool => tool.name) },
                close: () => client.close(),
                execute: async (request: ConnectorOperationRequest) => {
                    if (request.operation === CONNECTOR_OPERATIONS.list) return { data: tools, metadata: { count: tools.length } };
                    if (request.operation !== CONNECTOR_OPERATIONS.invokeTool) throw new AppError(422, "MongoDB supports listing tools and bounded read-only tool calls.");
                    const args = request.parameters.arguments ?? {};
                    if (request.parameters.name === "list_databases") {
                        z.object({}).strict().parse(args);
                        const databases = selectedDatabase ? [{ name: selectedDatabase }] : (await client.db().admin().listDatabases({ nameOnly: true, authorizedDatabases: true, timeoutMS: this.options.requestTimeoutMs })).databases;
                        return { data: databases.slice(0, 200), metadata: { readOnly: true, truncated: databases.length > 200 } };
                    }
                    if (request.parameters.name === "list_collections") {
                        const input = z.object({ database: databaseName }).strict().parse(args);
                        const cursor = db(input.database).listCollections({}, { nameOnly: true, authorizedCollections: true, timeoutMS: this.options.requestTimeoutMs });
                        const collections = [];
                        try { for await (const collection of cursor) { collections.push(collection); if (collections.length === 200) break; } }
                        finally { await cursor.close(); }
                        return { data: collections, metadata: { readOnly: true, limit: 200 } };
                    }
                    if (request.parameters.name === "find_documents") {
                        const input = findSchema.parse(args);
                        if (JSON.stringify(input.filter).length > 16_384) throw new AppError(400, "The MongoDB filter is too large.");
                        safeFilter(input.filter);
                        const cursor = db(input.database).collection(input.collection).find(input.filter, { projection: input.projection,
                            maxTimeMS: this.options.requestTimeoutMs, timeoutMS: this.options.requestTimeoutMs }).batchSize(1).limit(input.limit);
                        const documents: unknown[] = [];
                        let bytes = 0, truncated = false;
                        try {
                            for await (const document of cursor) {
                                const safe = BSON.EJSON.serialize(document, { relaxed: true });
                                bytes += Buffer.byteLength(JSON.stringify(safe));
                                if (bytes > 2 * 1024 * 1024) { truncated = true; break; }
                                documents.push(safe);
                            }
                        } finally { await cursor.close(); }
                        return { data: documents, metadata: { readOnly: true, limit: input.limit, truncated } };
                    }
                    throw new AppError(404, "The MongoDB connector does not offer that read operation.");
                },
            };
        } catch (error) { await client.close(); throw error; }
    }
}
