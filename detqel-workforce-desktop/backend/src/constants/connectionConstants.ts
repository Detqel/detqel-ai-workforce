import { MAXIMUM_TCP_PORT } from "./networkConstants.js";


export const CONNECTOR_ADAPTER_KEYS = {
    postgres: "postgres",
    mongodb: "mongodb",
    http: "http",
    file: "filesystem.file",
    directory: "filesystem.directory",
    github: "repository.github",
    azureDevops: "repository.azure-devops",
    gitlab: "repository.gitlab",
    bitbucketCloud: "repository.bitbucket-cloud",
    bitbucketDataCenter: "repository.bitbucket-data-center",
    gitea: "repository.gitea",
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
export const CONNECTION_FIELD_LIMITS = { name: 255, dataStream: 255 } as const;
export const MAX_VERIFICATION_RESPONSE_BYTES = 1024 * 1024;
export const CONNECTOR_TCP_PORT_RANGE = { minimum: 1, maximum: MAXIMUM_TCP_PORT } as const;
export const CONNECTOR_MILLISECONDS_PER_SECOND = 1_000;
// Repository providers: default public hosts, the API version each client pins, and response limits.
export const REPOSITORY_PROVIDER_DEFAULTS = {
    githubApiUrl: "https://api.github.com",
    gitlabServerUrl: "https://gitlab.com",
    bitbucketCloudApiUrl: "https://api.bitbucket.org/2.0",
} as const;
export const REPOSITORY_HEADERS = {
    githubAccept: "application/vnd.github+json",
    githubApiVersionName: "X-GitHub-Api-Version",
    githubApiVersion: "2022-11-28",
    gitlabToken: "PRIVATE-TOKEN",
    giteaTokenPrefix: "token ",
    json: "application/json",
} as const;
// 6.0 is served by Azure DevOps Services and by Azure DevOps Server 2020 and later.
export const AZURE_DEVOPS_API_VERSION = "6.0";
export const REPOSITORY_LIMITS = {
    maxResponseBytes: 2 * 1024 * 1024,
    defaultPageSize: 30,
    maxPageSize: 100,
    maxPathLength: 1_024,
    maxRefLength: 255,
} as const;
/** What the `list` operation of a repository connection can return. */
export const REPOSITORY_RESOURCES = {
    branches: "branches",
    files: "files",
    commits: "commits",
    pullRequests: "pull-requests",
} as const;
export const REPOSITORY_NAME_PATTERN = "^[A-Za-z0-9_.-]+$";
export const REPOSITORY_SEGMENT_PATTERN = "^(?!\\.{1,2}$)[A-Za-z0-9_.-]+$";
export const BITBUCKET_AUTHENTICATION = { apiToken: "api-token", accessToken: "access-token" } as const;
export const RESERVED_AUTHENTICATION_HEADERS: readonly string[] = [
    "host", "content-length", "connection", "transfer-encoding", "cookie", "set-cookie", "proxy-authorization",
];
export const FORBIDDEN_RESPONSE_PROPERTY_NAMES: readonly string[] = ["__proto__", "prototype", "constructor"];
