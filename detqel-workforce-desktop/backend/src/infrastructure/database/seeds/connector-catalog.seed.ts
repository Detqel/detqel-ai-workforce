import { CONNECTOR_ADAPTER_KEYS, CONNECTOR_AUTHENTICATION, CONNECTOR_TCP_PORT_RANGE, CONNECTOR_TYPES, MCP_TRANSPORTS } from "../../../constants/connectionConstants.js";
import { CONNECTOR_ICON_KEYS } from "../../../constants/databaseSeedConstants.js";
import type { ConfigurationProperty, ConfigurationSchema } from "../../../shared/types/connector-catalog.js";
import type { NewConnectorCatalog } from "../schema/connector-catalog.js";

function catalogIcon(code: string): string {
    const iconKey = CONNECTOR_ICON_KEYS[code];
    if (typeof iconKey !== "string") throw new Error(`Connector seed '${code}' requires icon metadata`);
    return iconKey;
}

function textField(title: string, description?: string): ConfigurationProperty {
    return { type: "string", title, minLength: 1, ...(description === undefined ? {} : { description }) };
}

function secretField(title: string, authentication?: string): ConfigurationProperty {
    return {
        ...textField(title),
        "x-secret": true,
        ...(authentication === undefined ? {} : { "x-visibleWhen": { authentication } }),
    };
}

function objectSchema(properties: Record<string, ConfigurationProperty>, required: string[]): ConfigurationSchema {
    return { type: "object", properties, required, additionalProperties: false };
}

const portField: ConfigurationProperty = { type: "integer", title: "Port", minimum: CONNECTOR_TCP_PORT_RANGE.minimum, maximum: CONNECTOR_TCP_PORT_RANGE.maximum };
const tlsField: ConfigurationProperty = { type: "boolean", title: "Use TLS" };
const databaseSchema = objectSchema({
    host: textField("Host"),
    port: portField,
    database: textField("Database"),
    username: secretField("Username"),
    password: secretField("Password"),
    ssl: tlsField,
}, ["host", "port", "database", "username", "password", "ssl"]);

function httpSchema(extraProperties: Record<string, ConfigurationProperty>, extraRequired: string[]): ConfigurationSchema {
    return {
        ...objectSchema({
            ...extraProperties,
            endpoint: { ...textField("Endpoint", "Enter the complete verification endpoint URL."), format: "uri" },
            authentication: { type: "string", title: "Authentication", enum: Object.values(CONNECTOR_AUTHENTICATION) },
            token: secretField("Bearer token", CONNECTOR_AUTHENTICATION.bearer),
            username: secretField("Username", CONNECTOR_AUTHENTICATION.basic),
            password: secretField("Password", CONNECTOR_AUTHENTICATION.basic),
            headerName: { ...textField("Header name"), "x-visibleWhen": { authentication: CONNECTOR_AUTHENTICATION.header } },
            headerValue: secretField("Header value", CONNECTOR_AUTHENTICATION.header),
            expectedResponseProperty: textField("Required response property", "Optional top-level JSON property that must exist in the verification response."),
        }, [...extraRequired, "endpoint", "authentication"]),
        allOf: [
            { if: { properties: { authentication: { const: CONNECTOR_AUTHENTICATION.bearer } }, required: ["authentication"] }, then: { required: ["token"] } },
            { if: { properties: { authentication: { const: CONNECTOR_AUTHENTICATION.basic } }, required: ["authentication"] }, then: { required: ["username", "password"] } },
            { if: { properties: { authentication: { const: CONNECTOR_AUTHENTICATION.header } }, required: ["authentication"] }, then: { required: ["headerName", "headerValue"] } },
        ],
    };
}

function mcpHttpSchema(transport: string): ConfigurationSchema {
    const schema = httpSchema({
        serverName: textField("Server name"),
        transport: { type: "string", title: "Transport", enum: [transport] },
    }, ["serverName", "transport"]);
    delete schema.properties.expectedResponseProperty;
    schema.properties.endpoint = {
        ...textField("Server URL", "Enter the complete MCP transport endpoint URL."), format: "uri",
    };
    return schema;
}

function enterpriseHttpSchema(endpointTitle: string, endpointDescription: string, pattern: string): ConfigurationSchema {
    return objectSchema({
        endpoint: { ...textField(endpointTitle, endpointDescription), format: "uri", pattern },
        authentication: { type: "string", title: "Authentication", enum: [CONNECTOR_AUTHENTICATION.bearer] },
        token: secretField("Access token"),
        expectedResponseProperty: textField("Required response property", "Enter a top-level JSON property that identifies the expected resource response."),
    }, ["endpoint", "authentication", "token", "expectedResponseProperty"]);
}

const mcpStdioSchema = objectSchema({
    serverName: textField("Server name"),
    transport: { type: "string", title: "Transport", enum: [MCP_TRANSPORTS.stdio] },
    command: textField("Executable path", "Absolute executable path permitted by the server operator."),
    arguments: { type: "array", title: "Arguments", items: { type: "string" }, "x-secret": true, description: "Provide an explicit array of process arguments." },
    environment: {
        type: "object", title: "Environment variables", additionalProperties: { type: "string" },
        "x-secret": true, description: "Provide the environment variables required by this MCP server as a JSON object.",
    },
}, ["serverName", "transport", "command", "arguments", "environment"]);

const localEnvironmentSchema = objectSchema({
    environmentType: { type: "string", title: "Environment type", enum: ["local"] },
    runtime: textField("Runtime executable", "Absolute runtime executable path permitted by the server operator."),
    workingDirectory: textField("Working directory", "Absolute directory within an operator-permitted filesystem root."),
}, ["environmentType", "runtime", "workingDirectory"]);

const dockerSchema = httpSchema({
    environmentType: { type: "string", title: "Environment type", enum: ["container"] },
}, ["environmentType"]);
delete dockerSchema.properties.expectedResponseProperty;
dockerSchema.properties.endpoint = {
    ...textField("Docker daemon endpoint", "HTTP or HTTPS base URL of a Docker-compatible daemon. Verification reads its version and daemon information."),
    format: "uri",
};

export const INITIAL_CONNECTOR_CATALOG: NewConnectorCatalog[] = [
    {
        code: "postgresql", name: "PostgreSQL", connectorType: CONNECTOR_TYPES.data, category: "Databases", adapterKey: CONNECTOR_ADAPTER_KEYS.postgres,
        description: "Verify an authenticated PostgreSQL connection over the configured network and TLS settings.",
        configSchema: databaseSchema, isEnabled: true,
    },
    {
        code: "sql-server", name: "SQL Server", connectorType: CONNECTOR_TYPES.data, category: "Databases", adapterKey: "sql-server",
        description: "SQL Server integration is awaiting a provider verification adapter.", configSchema: databaseSchema, isEnabled: false,
    },
    {
        code: "mysql", name: "MySQL", connectorType: CONNECTOR_TYPES.data, category: "Databases", adapterKey: "mysql",
        description: "MySQL integration is awaiting a provider verification adapter.", configSchema: databaseSchema, isEnabled: false,
    },
    {
        code: "mongodb", name: "MongoDB", connectorType: CONNECTOR_TYPES.data, category: "Databases", adapterKey: "mongodb",
        description: "MongoDB integration is awaiting a provider verification adapter.", configSchema: databaseSchema, isEnabled: false,
    },
    {
        code: "cassandra", name: "Cassandra", connectorType: CONNECTOR_TYPES.data, category: "Databases", adapterKey: "cassandra",
        description: "Cassandra integration is awaiting a provider verification adapter.",
        configSchema: objectSchema({
            contactPoints: { type: "array", title: "Contact points", minItems: 1, items: { type: "string", minLength: 1 } },
            port: portField, keyspace: textField("Keyspace"), username: secretField("Username"), password: secretField("Password"), ssl: tlsField,
        }, ["contactPoints", "port", "keyspace", "username", "password", "ssl"]), isEnabled: false,
    },
    {
        code: "rest-api", name: "REST API", connectorType: CONNECTOR_TYPES.data, category: "APIs", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify an HTTP API endpoint using the authentication method you select.", configSchema: httpSchema({}, []), isEnabled: true,
    },
    {
        code: "soap-api", name: "SOAP API", connectorType: CONNECTOR_TYPES.data, category: "APIs", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify access to an HTTP SOAP service description endpoint. SOAP operation invocation is not included.",
        configSchema: httpSchema({}, []), isEnabled: true,
    },
    {
        code: "custom-api", name: "Custom API", connectorType: CONNECTOR_TYPES.data, category: "APIs", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify a custom HTTP service endpoint and an optional JSON response property.", configSchema: httpSchema({}, []), isEnabled: true,
    },
    {
        code: "files", name: "Files", connectorType: CONNECTOR_TYPES.data, category: "Files and folders", adapterKey: CONNECTOR_ADAPTER_KEYS.file,
        description: "Verify a readable backend-host file inside an operator-permitted filesystem root.",
        configSchema: objectSchema({ path: textField("Absolute file path") }, ["path"]), isEnabled: true,
    },
    {
        code: "folders", name: "Folders", connectorType: CONNECTOR_TYPES.data, category: "Files and folders", adapterKey: CONNECTOR_ADAPTER_KEYS.directory,
        description: "Verify a readable backend-host directory inside an operator-permitted filesystem root.",
        configSchema: objectSchema({ path: textField("Absolute folder path") }, ["path"]), isEnabled: true,
    },
    {
        code: "github", name: "GitHub", connectorType: CONNECTOR_TYPES.data, category: "Developer tools", adapterKey: CONNECTOR_ADAPTER_KEYS.github,
        description: "Verify a GitHub token against the supplied authenticated user API endpoint.",
        configSchema: objectSchema({
            endpoint: { ...textField("User API endpoint", "Complete authenticated user API URL for your GitHub service."), format: "uri" },
            token: secretField("Access token"),
        }, ["endpoint", "token"]), isEnabled: true,
    },
    {
        code: "aws", name: "AWS", connectorType: CONNECTOR_TYPES.enterprise, category: "Cloud platforms", adapterKey: "aws",
        description: "AWS integration is awaiting a provider verification adapter.",
        configSchema: objectSchema({
            region: textField("Region"), accessKeyId: secretField("Access key ID"), secretAccessKey: secretField("Secret access key"), sessionToken: secretField("Session token"),
        }, ["region", "accessKeyId", "secretAccessKey"]), isEnabled: false,
    },
    {
        code: "azure", name: "Azure", connectorType: CONNECTOR_TYPES.enterprise, category: "Cloud platforms", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify read-only access to an Azure Resource Manager resource using an existing access token.",
        configSchema: enterpriseHttpSchema("Resource Manager endpoint", "Complete management.azure.com resource URL including its required API version query parameter.", "^https://management\\.azure\\.com/"), isEnabled: true,
    },
    {
        code: "google-cloud", name: "Google Cloud", connectorType: CONNECTOR_TYPES.enterprise, category: "Cloud platforms", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify read-only access to a Google Cloud Resource Manager project using an existing access token.",
        configSchema: enterpriseHttpSchema("Project resource endpoint", "Complete Cloud Resource Manager v3 project resource URL.", "^https://cloudresourcemanager\\.googleapis\\.com/v3/projects/[^/?#]+(?:[?]|$)"), isEnabled: true,
    },
    {
        code: "google-drive", name: "Google Drive", connectorType: CONNECTOR_TYPES.enterprise, category: "Productivity", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify read-only access to a Google Drive v3 resource using an existing access token.",
        configSchema: enterpriseHttpSchema("Drive API endpoint", "Complete www.googleapis.com/drive/v3 resource URL. Include required fields query parameters for the chosen resource.", "^https://www\\.googleapis\\.com/drive/v3/"), isEnabled: true,
    },
    {
        code: "microsoft-365", name: "Microsoft 365", connectorType: CONNECTOR_TYPES.enterprise, category: "Productivity", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify read-only Microsoft Graph resource access using an existing access token.",
        configSchema: enterpriseHttpSchema("Microsoft Graph endpoint", "Complete graph.microsoft.com/v1.0 resource URL authorized by the supplied token.", "^https://graph\\.microsoft\\.com/v1\\.0/"), isEnabled: true,
    },
    {
        code: "microsoft-teams", name: "Microsoft Teams", connectorType: CONNECTOR_TYPES.enterprise, category: "Productivity", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify read-only Microsoft Teams resource access using an existing Microsoft Graph access token.",
        configSchema: enterpriseHttpSchema("Teams resource endpoint", "Complete Microsoft Graph v1.0 team resource or joinedTeams URL.", "^https://graph\\.microsoft\\.com/v1\\.0/(?:teams/[^/?#]+|me/joinedTeams)(?:[/?]|$)"), isEnabled: true,
    },
    {
        code: "onedrive", name: "OneDrive", connectorType: CONNECTOR_TYPES.enterprise, category: "Productivity", adapterKey: CONNECTOR_ADAPTER_KEYS.http,
        description: "Verify read-only OneDrive resource access using an existing Microsoft Graph access token.",
        configSchema: enterpriseHttpSchema("Drive resource endpoint", "Complete Microsoft Graph v1.0 drive resource URL for your user or drive ID.", "^https://graph\\.microsoft\\.com/v1\\.0/(?:me/drive|users/[^/?#]+/drive|drives/[^/?#]+)(?:[/?]|$)"), isEnabled: true,
    },
    {
        code: "mcp-stdio", name: "MCP STDIO", connectorType: CONNECTOR_TYPES.mcp, category: "Server transports", adapterKey: CONNECTOR_ADAPTER_KEYS.mcpStdio,
        description: "Launch an operator-permitted MCP executable and discover its capabilities using the official MCP SDK.",
        configSchema: mcpStdioSchema, isEnabled: true,
    },
    {
        code: "mcp-streamable-http", name: "MCP Streamable HTTP", connectorType: CONNECTOR_TYPES.mcp, category: "Server transports", adapterKey: CONNECTOR_ADAPTER_KEYS.mcpStreamableHttp,
        description: "Initialize an MCP server over Streamable HTTP and discover its advertised capabilities.",
        configSchema: mcpHttpSchema(MCP_TRANSPORTS.streamableHttp), isEnabled: true,
    },
    {
        code: "mcp-sse", name: "MCP SSE", connectorType: CONNECTOR_TYPES.mcp, category: "Server transports", adapterKey: CONNECTOR_ADAPTER_KEYS.mcpSse,
        description: "Initialize an MCP server over the explicitly selected legacy HTTP+SSE transport.",
        configSchema: mcpHttpSchema(MCP_TRANSPORTS.sse), isEnabled: true,
    },
    {
        code: "environment-local", name: "Local Runtime", connectorType: CONNECTOR_TYPES.environment, category: "Local runtimes", adapterKey: CONNECTOR_ADAPTER_KEYS.environmentLocal,
        description: "Inspect an operator-permitted backend-host runtime executable and readable working directory.",
        configSchema: localEnvironmentSchema, isEnabled: true,
    },
    {
        code: "environment-http", name: "Remote HTTP Environment", connectorType: CONNECTOR_TYPES.environment, category: "Remote runtimes", adapterKey: CONNECTOR_ADAPTER_KEYS.environmentHttp,
        description: "Verify a remote or custom runtime using its supplied HTTP health endpoint and authentication.",
        configSchema: httpSchema({ environmentType: { type: "string", title: "Environment type", enum: ["remote", "custom"] } }, ["environmentType"]), isEnabled: true,
    },
    {
        code: "environment-docker", name: "Docker", connectorType: CONNECTOR_TYPES.environment, category: "Containers", adapterKey: CONNECTOR_ADAPTER_KEYS.environmentDocker,
        description: "Verify a Docker-compatible daemon using its read-only version and daemon-information APIs.",
        configSchema: dockerSchema, isEnabled: true,
    },
].map(entry => ({ ...entry, configSchema: { ...entry.configSchema, "x-icon": catalogIcon(entry.code) } }));
