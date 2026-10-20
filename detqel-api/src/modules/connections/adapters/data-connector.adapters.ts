import postgres from "postgres";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConnectorAdapter, ConnectorContext, ConnectorHandle, ConnectorRuntimeOptions } from "../../../shared/types/connector-catalog.js";
import { allowedFilesystemPath, authenticationHeaders, bounded, httpEndpoint, requiredBoolean, requiredPort, requiredString } from "./adapter-configuration.js";
import { responseHasProperty, verifiedHttpResponse } from "./http-verification.js";

function verifiedHandle(metadata: Record<string, unknown>): ConnectorHandle {
    return { metadata, close: async () => {} };
}

export class PostgresConnectorAdapter implements ConnectorAdapter {
    readonly key = "postgres";
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
            connect_timeout: this.options.requestTimeoutMs / 1000,
            idle_timeout: this.options.requestTimeoutMs / 1000,
            prepare: false,
            fetch_types: false,
            onnotice: () => {},
            connection: { statement_timeout: this.options.requestTimeoutMs },
        });
        try {
            await bounded(sql`SELECT 1 AS connection_verified`, this.options.requestTimeoutMs, () => { void sql.end({ timeout: 0 }); });
            return verifiedHandle({ verification: "database-query", database: requiredString(configuration, "database") });
        } finally { await sql.end({ timeout: this.options.requestTimeoutMs / 1000 }); }
    }
}

export class HttpConnectorAdapter implements ConnectorAdapter {
    readonly key = "http";
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
        return verifiedHandle({ verification: "http-response", origin: endpoint.origin });
    }
}

export class FilesystemConnectorAdapter implements ConnectorAdapter {
    readonly key: string;
    constructor(private readonly kind: "file" | "directory", private readonly options: ConnectorRuntimeOptions) {
        this.key = `filesystem.${kind}`;
    }

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        await allowedFilesystemPath(requiredString(configuration, "path"), this.options.allowedFilesystemRoots, this.kind);
        return verifiedHandle({ verification: "filesystem-access", kind: this.kind });
    }
}

export class GithubConnectorAdapter implements ConnectorAdapter {
    readonly key = "github";
    constructor(private readonly options: ConnectorRuntimeOptions) {}

    async connect(configuration: Record<string, unknown>, _context: ConnectorContext): Promise<ConnectorHandle> {
        const endpoint = httpEndpoint(requiredString(configuration, "endpoint"));
        const headers = new Headers({ Accept: "application/vnd.github+json", Authorization: `Bearer ${requiredString(configuration, "token")}` });
        const response = await verifiedHttpResponse(endpoint, headers, this.options.requestTimeoutMs, true);
        if (response === null || typeof response !== "object" || typeof (response as Record<string, unknown>).login !== "string" || typeof (response as Record<string, unknown>).id !== "number") {
            throw new AppError(422, "The endpoint did not return a verified GitHub user response.");
        }
        return verifiedHandle({ verification: "github-user", origin: endpoint.origin });
    }
}
