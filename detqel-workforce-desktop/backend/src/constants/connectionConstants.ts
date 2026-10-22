import { MAXIMUM_TCP_PORT } from "./networkConstants.js";

export const CONNECTOR_TYPES = {
    data: "data", mcp: "mcp", environment: "environment", enterprise: "enterprise",
} as const;

export const CONNECTOR_ADAPTER_KEYS = {
    postgres: "postgres",
    http: "http",
    file: "filesystem.file",
    directory: "filesystem.directory",
    github: "github",
    mcpStdio: "mcp.stdio",
    mcpStreamableHttp: "mcp.streamable-http",
    mcpSse: "mcp.sse",
    environmentLocal: "environment.local",
    environmentHttp: "environment.http",
    environmentDocker: "environment.docker",
} as const;

export const MCP_TRANSPORTS = { stdio: "STDIO", streamableHttp: "Streamable HTTP", sse: "SSE" } as const;
export const MCP_CLIENT_IDENTITY = { name: "detqel-connector", version: "1.0.0" } as const;
export const CONNECTOR_AUTHENTICATION = { none: "none", bearer: "bearer", basic: "basic", header: "header" } as const;
export const CONNECTOR_CRYPTO = {
    algorithm: "aes-256-gcm", keyBytes: 32, ivBytes: 12, envelopePrefix: "enc", envelopeVersion: "v1",
    encoding: "base64url", envelopeSeparator: ":",
} as const;
export const CONNECTION_FIELD_LIMITS = { name: 255, dataStream: 255, connectorType: 50, category: 100 } as const;
export const MAX_VERIFICATION_RESPONSE_BYTES = 1024 * 1024;
export const CONNECTOR_TCP_PORT_RANGE = { minimum: 1, maximum: MAXIMUM_TCP_PORT } as const;
export const CONNECTOR_MILLISECONDS_PER_SECOND = 1_000;
export const GITHUB_ACCEPT_HEADER = "application/vnd.github+json";
export const RESERVED_AUTHENTICATION_HEADERS: readonly string[] = [
    "host", "content-length", "connection", "transfer-encoding", "cookie", "set-cookie", "proxy-authorization",
];
export const FORBIDDEN_RESPONSE_PROPERTY_NAMES: readonly string[] = ["__proto__", "prototype", "constructor"];
