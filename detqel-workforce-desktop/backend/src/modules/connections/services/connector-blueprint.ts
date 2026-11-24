import { z } from "zod";
import { CONNECTOR_ADAPTER_KEYS, REPOSITORY_PROVIDER_DEFAULTS, REPOSITORY_SEGMENT_PATTERN, RESERVED_AUTHENTICATION_HEADERS } from "../../../constants/connectionConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { ConfigurationSchema } from "../../../shared/types/connection-adapter.js";

const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/).refine(value => !["constructor", "prototype", "__proto__"].includes(value));
export const connectorBlueprintSchema = z.object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(1200),
    documentationUrl: z.string().url().max(2048),
    instructions: z.string().trim().max(2000),
    protocol: z.enum(["mcp-http", "mcp-sse", "mcp-stdio", "http", "postgres", "mongodb", "github-repository"]),
    endpoint: z.string().max(2048).nullable(),
    authentication: z.enum(["none", "bearer", "basic", "header"]),
    headerName: z.string().max(128).nullable(),
    fields: z.array(z.object({
        name, title: z.string().trim().min(1).max(100), description: z.string().max(1000), placeholder: z.string().max(300),
        type: z.enum(["string", "integer", "boolean", "array", "object"]), required: z.boolean(), secret: z.boolean(),
        location: z.enum(["property", "header", "environment"]), target: z.string().min(1).max(128),
        defaultValue: z.string().max(3000).nullable(),
    }).strict()).max(24),
}).strict();
export type ConnectorBlueprint = z.infer<typeof connectorBlueprintSchema>;
export interface ConnectorDiscoveryMetadata {
    readonly blueprint: ConnectorBlueprint;
    readonly sources: ReadonlyArray<{ title: string; url: string }>;
    readonly discoveredAt: string;
}

export const discoveryAdapter = (protocol: ConnectorBlueprint["protocol"]) => ({
    "mcp-http": CONNECTOR_ADAPTER_KEYS.mcpStreamableHttp, "mcp-sse": CONNECTOR_ADAPTER_KEYS.mcpSse,
    "mcp-stdio": CONNECTOR_ADAPTER_KEYS.mcpStdio, http: CONNECTOR_ADAPTER_KEYS.http,
    postgres: CONNECTOR_ADAPTER_KEYS.postgres, mongodb: CONNECTOR_ADAPTER_KEYS.mongodb, "github-repository": CONNECTOR_ADAPTER_KEYS.github,
})[protocol];

const propertyTargets: Record<ConnectorBlueprint["protocol"], ReadonlyArray<string>> = {
    "mcp-http": ["endpoint", "token", "username", "password", "headerValue"],
    "mcp-sse": ["endpoint", "token", "username", "password", "headerValue"],
    "mcp-stdio": ["command", "arguments"],
    http: ["endpoint", "token", "username", "password", "headerValue"],
    postgres: ["host", "port", "database", "username", "password", "ssl"],
    mongodb: ["connectionString", "database"],
    "github-repository": ["owner", "repository", "token", "apiUrl"],
};
const secretTarget = /token|password|secret|credential|connectionstring|api.?key|authorization|headervalue/i;
const publicHeaders = new Set(["accept", "content-type", "notion-version", "api-version", "x-api-version", "mcp-protocol-version"]);

function secretField(field: ConnectorBlueprint["fields"][number]): boolean {
    return field.secret || secretTarget.test(field.target) || secretTarget.test(field.name)
        || field.location === "environment" || field.location === "header" && !publicHeaders.has(field.target.toLowerCase());
}

/** Credential values are never part of a discovered form, including examples returned as model defaults. */
export function normalizeBlueprint(blueprint: ConnectorBlueprint): ConnectorBlueprint {
    const repositoryScoped = blueprint.protocol === "github-repository";
    const apiRoot = REPOSITORY_PROVIDER_DEFAULTS.githubApiUrl;
    return { ...blueprint, endpoint: repositoryScoped && blueprint.endpoint === `${apiRoot}/` ? apiRoot : blueprint.endpoint, fields: blueprint.fields.map(field => {
        const secret = secretField(field);
        const userSelectedResource = repositoryScoped && field.location === "property" && ["owner", "repository"].includes(field.target);
        const defaultValue = secret || userSelectedResource ? null : repositoryScoped && field.target === "apiUrl" && field.defaultValue === `${apiRoot}/` ? apiRoot : field.defaultValue;
        return { ...field, secret, defaultValue };
    }) };
}

/** Compiles only declarative settings. No discovered code or executable schema keywords are accepted. */
export function blueprintConfiguration(metadata: ConnectorDiscoveryMetadata): ConfigurationSchema {
    const plan = normalizeBlueprint(metadata.blueprint);
    const repositoryScoped = plan.protocol === "github-repository";
    if (repositoryScoped && (plan.authentication !== "bearer" || plan.headerName !== null
        || plan.endpoint !== null && plan.endpoint !== REPOSITORY_PROVIDER_DEFAULTS.githubApiUrl
        || plan.fields.some(field => field.location !== "property" || field.target === "apiUrl" && field.defaultValue !== null && field.defaultValue !== REPOSITORY_PROVIDER_DEFAULTS.githubApiUrl))) {
        throw new AppError(422, "A GitHub repository connection must use the repository adapter with PAT authentication and the documented GitHub API root. Enterprise API URLs must be entered explicitly.");
    }
    const names = new Set<string>();
    const bindings = new Set<string>();
    for (const field of plan.fields) {
        const binding = `${field.location}:${field.target.toLowerCase()}`;
        if (names.has(field.name) || bindings.has(binding)) throw new AppError(422, "Discovery returned duplicate configuration fields. Refine the provider search.");
        names.add(field.name); bindings.add(binding);
        if (field.target === "command" && field.defaultValue !== null || field.target === "arguments" && field.defaultValue !== null && field.defaultValue !== "[]") throw new AppError(422, "Discovered process commands and arguments must be configured explicitly, never supplied by web content.");
        if (field.location === "property" && !propertyTargets[plan.protocol].includes(field.target)) throw new AppError(422, "Discovery returned a setting that the provider transport cannot use.");
        if (field.location === "property" && field.type !== (field.target === "port" ? "integer" : field.target === "ssl" ? "boolean" : field.target === "arguments" ? "array" : "string")) throw new AppError(422, "Discovery returned an incompatible configuration field type.");
        if (field.location !== "property" && field.type !== "string") throw new AppError(422, "Discovered headers and environment values must be text fields.");
        if (field.location === "header" && !["mcp-http", "mcp-sse", "http"].includes(plan.protocol)) throw new AppError(422, "This provider protocol does not support request headers.");
        if (field.location === "header" && (!/^[A-Za-z][A-Za-z0-9-]{0,100}$/.test(field.target) || /^(?:host|content-length|connection|transfer-encoding|cookie|set-cookie|proxy-authorization|authorization)$/i.test(field.target))) throw new AppError(422, "Discovery returned an unsafe HTTP header field.");
        if (field.location === "environment" && (plan.protocol !== "mcp-stdio" || !/^[A-Z][A-Z0-9_]{0,100}$/.test(field.target) || /^(?:PATH|NODE_OPTIONS|NODE_PATH|LD_.*|DYLD_.*|PYTHONPATH|PYTHONHOME|COMSPEC|SHELL|BASH_ENV|ENV)$/.test(field.target))) throw new AppError(422, "Discovery returned an unsafe process environment field.");
    }
    const requiredProperty = (target: string, type: string) => plan.fields.some(field => field.location === "property" && field.target === target && field.required && field.type === type);
    const required = repositoryScoped ? [["owner", "string"], ["repository", "string"], ["token", "string"]] : plan.protocol === "mongodb" ? [["connectionString", "string"]] : plan.protocol === "postgres"
        ? [["host", "string"], ["port", "integer"], ["database", "string"], ["username", "string"], ["password", "string"], ["ssl", "boolean"]]
        : plan.protocol === "mcp-stdio" ? [["command", "string"]] : [
            ...(!plan.endpoint ? [["endpoint", "string"]] : []), ...(plan.authentication === "bearer" ? [["token", "string"]] : []),
            ...(plan.authentication === "basic" ? [["username", "string"], ["password", "string"]] : []), ...(plan.authentication === "header" ? [["headerValue", "string"]] : []),
        ];
    if (required.some(([target, type]) => !requiredProperty(target, type))) throw new AppError(422, "Discovery omitted required connection fields. Refine the search; an incomplete form was not created.");
    if (plan.authentication === "header" && (!plan.headerName || !/^[A-Za-z][A-Za-z0-9-]{0,100}$/.test(plan.headerName) || RESERVED_AUTHENTICATION_HEADERS.includes(plan.headerName.toLowerCase()))) throw new AppError(422, "The documented authentication header is missing or invalid.");
    const properties = Object.fromEntries(plan.fields.map(field => {
        const secret = secretField(field);
        let value: unknown;
        if (field.defaultValue !== null) {
            try { value = field.type === "string" ? field.defaultValue : JSON.parse(field.defaultValue); }
            catch { throw new AppError(422, "Discovery returned an invalid field default."); }
            if (field.type === "integer" && (typeof value !== "number" || !Number.isSafeInteger(value)) || field.type === "boolean" && typeof value !== "boolean"
                || field.type === "array" && (!Array.isArray(value) || value.some(item => typeof item !== "string"))
                || field.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new AppError(422, "Discovery returned a default with an incompatible type.");
        }
        return [field.name, { type: field.type, title: field.title, description: field.description, "x-placeholder": field.placeholder,
            "x-secret": secret, ...(secret ? { format: "password" } : {}), ...(value !== undefined ? { default: value } : {}),
            ...(field.type === "string" ? { ...(field.required ? { minLength: 1 } : {}), maxLength: 16_384 } : {}),
            ...(field.type === "array" ? { items: { type: "string", maxLength: 3000 }, maxItems: 64 } : {}),
            ...(field.type === "object" ? { additionalProperties: { type: "string", maxLength: 16_384 }, maxProperties: 32 } : {}),
            ...(field.target === "port" ? { minimum: 1, maximum: 65535 } : {}),
            ...(repositoryScoped && ["owner", "repository"].includes(field.target) ? { pattern: REPOSITORY_SEGMENT_PATTERN, maxLength: 255 } : {}),
            ...(repositoryScoped && field.target === "apiUrl" ? { format: "uri", maxLength: 2048 } : {}),
        }];
    }));
    return { type: "object", properties, required: plan.fields.filter(field => field.required).map(field => field.name), additionalProperties: false,
        ...(repositoryScoped ? { "x-access-scope": "single-repository-read-only" } : {}),
        "x-icon": repositoryScoped ? "lucide:FolderGit2" : plan.protocol === "mongodb" ? "devicon:MongodbIcon" : plan.protocol === "postgres" ? "devicon:Postgresql" : plan.protocol.startsWith("mcp-") ? "devicon:McpIcon" : "lucide:Globe", "x-discovery": { ...metadata, blueprint: plan } };
}

export function discoveryOf(schema: ConfigurationSchema): ConnectorDiscoveryMetadata | null {
    const value = schema["x-discovery"];
    if (!value) return null;
    const parsed = z.object({ blueprint: connectorBlueprintSchema, sources: z.array(z.object({ title: z.string(), url: z.string().url() })).max(8), discoveredAt: z.string() }).strict().safeParse(value);
    if (!parsed.success) throw new AppError(409, "This discovered connector definition is invalid. Discover the provider again.");
    return parsed.data;
}

export function compileDiscoveredConfiguration(schema: ConfigurationSchema, values: Record<string, unknown>): Record<string, unknown> {
    const metadata = discoveryOf(schema);
    if (!metadata) return values;
    const plan = metadata.blueprint;
    const result: Record<string, unknown> = { serverName: plan.name, authentication: plan.authentication,
        ...(plan.endpoint ? { [plan.protocol === "github-repository" ? "apiUrl" : "endpoint"]: plan.endpoint } : {}), ...(plan.headerName ? { headerName: plan.headerName } : {}) };
    if (plan.protocol === "http") result.requireJsonResponse = true;
    const headers: Record<string, string> = {};
    const environment: Record<string, string> = {};
    for (const field of plan.fields) {
        const value = values[field.name];
        if (value === undefined || value === "") continue;
        if (field.location === "property") result[field.target] = value;
        else if (typeof value !== "string" || /[\r\n\0]/.test(value)) throw new AppError(400, `${field.title} contains unsupported characters.`);
        else if (field.location === "header") headers[field.target] = value;
        else environment[field.target] = value;
    }
    if (plan.protocol === "mcp-stdio") { result.environment = environment; result.arguments ??= []; }
    if (Object.keys(headers).length) result.additionalHeaders = headers;
    return result;
}
