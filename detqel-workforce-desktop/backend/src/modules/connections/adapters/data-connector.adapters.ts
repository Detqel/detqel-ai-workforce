import { CONNECTOR_ADAPTER_KEYS, CONNECTOR_MILLISECONDS_PER_SECOND } from "../../../constants/connectionConstants.js";
import postgres from "postgres";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorContext, ConnectorHandle, ConnectorRuntimeOptions } from "../../../shared/types/connector-catalog.js";
import { allowedFilesystemPath, authenticationHeaders, bounded, httpEndpoint, requiredBoolean, requiredPort, requiredString } from "./adapter-configuration.js";
import { responseHasProperty, verifiedHttpResponse } from "./http-verification.js";
import { filesystemOperations, httpOperations, postgresOperations } from "../operations/data-operations.js";

export class PostgresConnectorAdapter implements ConnectorAdapter {
    readonly key = CONNECTOR_ADAPTER_KEYS.postgres;
    constructor(private readonly options: ConnectorRuntimeOptions) {}

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const sql = postgres({
            host: requiredString(configuration, "host"),
            port: requiredPort(configuration),
            database: requiredString(configuration, "database"),
            username: requiredString(configuration, "username"),
            password: requiredString(configuration, "password"),
            ssl: requiredBoolean(configuration, "ssl") ? { rejectUnauthorized: true } : false,
            max: 1,
            connect_timeout: this.options.requestTimeoutMs / CONNECTOR_MILLISECONDS_PER_SECOND,
            idle_timeout: this.options.requestTimeoutMs / CONNECTOR_MILLISECONDS_PER_SECOND,
            prepare: false,
            fetch_types: false,
            onnotice: () => {},
            connection: { statement_timeout: this.options.requestTimeoutMs },
        });
        await bounded(sql`SELECT 1 AS connection_verified`, this.options.requestTimeoutMs, () => { void sql.end({ timeout: 0 }); });
        // The pool is kept open so the session can run operations; close() ends it when the session detaches.
        const execute = postgresOperations(sql);
        return {
            metadata: { verification: "database-query", database: requiredString(configuration, "database") },
            execute,
            close: async () => { await sql.end({ timeout: this.options.requestTimeoutMs / CONNECTOR_MILLISECONDS_PER_SECOND }); },
        };
    }
}

export class HttpConnectorAdapter implements ConnectorAdapter {
    readonly key = CONNECTOR_ADAPTER_KEYS.http;
    constructor(private readonly options: ConnectorRuntimeOptions) {}

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const endpoint = httpEndpoint(requiredString(configuration, "endpoint"));
        const expectedProperty = configuration.expectedResponseProperty;
        if (expectedProperty !== undefined && (typeof expectedProperty !== "string" || !expectedProperty.trim())) {
            throw new AppError(400, "The expected response property must be a nonempty property path.");
        }
        const response = await verifiedHttpResponse(endpoint, authenticationHeaders(configuration), this.options.requestTimeoutMs, expectedProperty !== undefined);
        if (typeof expectedProperty === "string" && !responseHasProperty(response, expectedProperty)) {
            throw new AppError(422, "The endpoint response does not contain the required provider verification property.");
        }
        return {
            metadata: { verification: "http-response", origin: endpoint.origin },
            execute: httpOperations(endpoint, authenticationHeaders(configuration), this.options.requestTimeoutMs),
            close: async () => {},
        };
    }
}

export class FilesystemConnectorAdapter implements ConnectorAdapter {
    readonly key: string;
    constructor(private readonly kind: "file" | "directory", private readonly options: ConnectorRuntimeOptions) {
        this.key = CONNECTOR_ADAPTER_KEYS[kind];
    }

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const path = await allowedFilesystemPath(requiredString(configuration, "path"), this.options.allowedFilesystemRoots, this.kind);
        return {
            metadata: { verification: "filesystem-access", kind: this.kind },
            // Operations are confined to the connected file or folder, not every root the operator allows.
            execute: filesystemOperations([path], this.kind),
            close: async () => {},
        };
    }
}
