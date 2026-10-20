import type { ConfigurationProperty, ConfigurationSchema } from "../../../shared/types/connector-catalog.js";
import type { NewConnectorCatalog } from "../schema/connector-catalog.js";

const CONNECTOR_ICON_KEYS: Readonly<Record<string, string>> = {
    postgresql: "devicon:Postgresql",
    "sql-server": "lucide:Database",
    mysql: "devicon:MysqlIcon",
    mongodb: "devicon:MongodbIcon",
    cassandra: "devicon:Cassandra",
    "rest-api": "lucide:Globe",
    "soap-api": "lucide:CodeXml",
    "custom-api": "lucide:Webhook",
    files: "lucide:File",
    folders: "lucide:Folder",
    github: "devicon:GithubIcon",
    aws: "devicon:Aws",
    azure: "devicon:MicrosoftAzure",
    "google-cloud": "devicon:GoogleCloud",
    "google-drive": "devicon:GoogleDrive",
    "microsoft-365": "devicon:MicrosoftIcon",
    "microsoft-teams": "devicon:MicrosoftTeams",
    onedrive: "devicon:MicrosoftOnedrive",
    "mcp-stdio": "devicon:McpIcon",
    "mcp-streamable-http": "devicon:McpIcon",
    "mcp-sse": "devicon:McpIcon",
    "environment-local": "lucide:Monitor",
    "environment-http": "lucide:Server",
    "environment-docker": "devicon:DockerIcon",
};

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

const portField: ConfigurationProperty = { type: "integer", title: "Port", minimum: 1, maximum: 65535 };
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
            authentication: { type: "string", title: "Authentication", enum: ["none", "bearer", "basic", "header"] },
            token: secretField("Bearer token", "bearer"),
            username: secretField("Username", "basic"),
            password: secretField("Password", "basic"),
            headerName: { ...textField("Header name"), "x-visibleWhen": { authentication: "header" } },
            headerValue: secretField("Header value", "header"),
            expectedResponseProperty: textField("Required response property", "Optional top-level JSON property that must exist in the verification response."),
        }, [...extraRequired, "endpoint", "authentication"]),
        allOf: [
            { if: { properties: { authentication: { const: "bearer" } }, required: ["authentication"] }, then: { required: ["token"] } },
            { if: { properties: { authentication: { const: "basic" } }, required: ["authentication"] }, then: { required: ["username", "password"] } },
            { if: { properties: { authentication: { const: "header" } }, required: ["authentication"] }, then: { required: ["headerName", "headerValue"] } },
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
        authentication: { type: "string", title: "Authentication", enum: ["bearer"] },
        token: secretField("Access token"),
        expectedResponseProperty: textField("Required response property", "Enter a top-level JSON property that identifies the expected resource response."),
    }, ["endpoint", "authentication", "token", "expectedResponseProperty"]);
}

const mcpStdioSchema = objectSchema({
    serverName: textField("Server name"),
    transport: { type: "string", title: "Transport", enum: ["STDIO"] },
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
        code: "postgresql", name: "PostgreSQL", connectorType: "data", category: "Databases", adapterKey: "postgres",
        description: "Verify an authenticated PostgreSQL connection over the configured network and TLS settings.",
        configSchema: databaseSchema, isEnabled: true,
    },
    {
        code: "sql-server", name: "SQL Server", connectorType: "data", category: "Databases", adapterKey: "sql-server",
        description: "SQL Server integration is awaiting a provider verification adapter.", configSchema: databaseSchema, isEnabled: false,
    },
    {
        code: "mysql", name: "MySQL", connectorType: "data", category: "Databases", adapterKey: "mysql",
        description: "MySQL integration is awaiting a provider verification adapter.", configSchema: databaseSchema, isEnabled: false,
    },
    {
        code: "mongodb", name: "MongoDB", connectorType: "data", category: "Databases", adapterKey: "mongodb",
        description: "MongoDB integration is awaiting a provider verification adapter.", configSchema: databaseSchema, isEnabled: false,
    },
    {
        code: "cassandra", name: "Cassandra", connectorType: "data", category: "Databases", adapterKey: "cassandra",
        description: "Cassandra integration is awaiting a provider verification adapter.",
        configSchema: objectSchema({
            contactPoints: { type: "array", title: "Contact points", minItems: 1, items: { type: "string", minLength: 1 } },
            port: portField, keyspace: textField("Keyspace"), username: secretField("Username"), password: secretField("Password"), ssl: tlsField,
        }, ["contactPoints", "port", "keyspace", "username", "password", "ssl"]), isEnabled: false,
    },
    {
        code: "rest-api", name: "REST API", connectorType: "data", category: "APIs", adapterKey: "http",
        description: "Verify an HTTP API endpoint using the authentication method you select.", configSchema: httpSchema({}, []), isEnabled: true,
    },
    {
        code: "soap-api", name: "SOAP API", connectorType: "data", category: "APIs", adapterKey: "http",
        description: "Verify access to an HTTP SOAP service description endpoint. SOAP operation invocation is not included.",
        configSchema: httpSchema({}, []), isEnabled: true,
    },
    {
        code: "custom-api", name: "Custom API", connectorType: "data", category: "APIs", adapterKey: "http",
        description: "Verify a custom HTTP service endpoint and an optional JSON response property.", configSchema: httpSchema({}, []), isEnabled: true,
    },
    {
        code: "files", name: "Files", connectorType: "data", category: "Files and folders", adapterKey: "filesystem.file",
        description: "Verify a readable backend-host file inside an operator-permitted filesystem root.",
        configSchema: objectSchema({ path: textField("Absolute file path") }, ["path"]), isEnabled: true,
    },
    {
        code: "folders", name: "Folders", connectorType: "data", category: "Files and folders", adapterKey: "filesystem.directory",
        description: "Verify a readable backend-host directory inside an operator-permitted filesystem root.",
        configSchema: objectSchema({ path: textField("Absolute folder path") }, ["path"]), isEnabled: true,
    },
    {
        code: "github", name: "GitHub", connectorType: "data", category: "Developer tools", adapterKey: "github",
        description: "Verify a GitHub token against the supplied authenticated user API endpoint.",
        configSchema: objectSchema({
            endpoint: { ...textField("User API endpoint", "Complete authenticated user API URL for your GitHub service."), format: "uri" },
            token: secretField("Access token"),
        }, ["endpoint", "token"]), isEnabled: true,
    },
    {
        code: "aws", name: "AWS", connectorType: "enterprise", category: "Cloud platforms", adapterKey: "aws",
        description: "AWS integration is awaiting a provider verification adapter.",
        configSchema: objectSchema({
            region: textField("Region"), accessKeyId: secretField("Access key ID"), secretAccessKey: secretField("Secret access key"), sessionToken: secretField("Session token"),
        }, ["region", "accessKeyId", "secretAccessKey"]), isEnabled: false,
    },
    {
        code: "azure", name: "Azure", connectorType: "enterprise", category: "Cloud platforms", adapterKey: "http",
        description: "Verify read-only access to an Azure Resource Manager resource using an existing access token.",
        configSchema: enterpriseHttpSchema("Resource Manager endpoint", "Complete management.azure.com resource URL including its required API version query parameter.", "^https://management\\.azure\\.com/"), isEnabled: true,
    },
    {
        code: "google-cloud", name: "Google Cloud", connectorType: "enterprise", category: "Cloud platforms", adapterKey: "http",
        description: "Verify read-only access to a Google Cloud Resource Manager project using an existing access token.",
        configSchema: enterpriseHttpSchema("Project resource endpoint", "Complete Cloud Resource Manager v3 project resource URL.", "^https://cloudresourcemanager\\.googleapis\\.com/v3/projects/[^/?#]+(?:[?]|$)"), isEnabled: true,
    },
    {
        code: "google-drive", name: "Google Drive", connectorType: "enterprise", category: "Productivity", adapterKey: "http",
        description: "Verify read-only access to a Google Drive v3 resource using an existing access token.",
        configSchema: enterpriseHttpSchema("Drive API endpoint", "Complete www.googleapis.com/drive/v3 resource URL. Include required fields query parameters for the chosen resource.", "^https://www\\.googleapis\\.com/drive/v3/"), isEnabled: true,
    },
    {
        code: "microsoft-365", name: "Microsoft 365", connectorType: "enterprise", category: "Productivity", adapterKey: "http",
        description: "Verify read-only Microsoft Graph resource access using an existing access token.",
        configSchema: enterpriseHttpSchema("Microsoft Graph endpoint", "Complete graph.microsoft.com/v1.0 resource URL authorized by the supplied token.", "^https://graph\\.microsoft\\.com/v1\\.0/"), isEnabled: true,
    },
    {
        code: "microsoft-teams", name: "Microsoft Teams", connectorType: "enterprise", category: "Productivity", adapterKey: "http",
        description: "Verify read-only Microsoft Teams resource access using an existing Microsoft Graph access token.",
        configSchema: enterpriseHttpSchema("Teams resource endpoint", "Complete Microsoft Graph v1.0 team resource or joinedTeams URL.", "^https://graph\\.microsoft\\.com/v1\\.0/(?:teams/[^/?#]+|me/joinedTeams)(?:[/?]|$)"), isEnabled: true,
    },
    {
        code: "onedrive", name: "OneDrive", connectorType: "enterprise", category: "Productivity", adapterKey: "http",
        description: "Verify read-only OneDrive resource access using an existing Microsoft Graph access token.",
        configSchema: enterpriseHttpSchema("Drive resource endpoint", "Complete Microsoft Graph v1.0 drive resource URL for your user or drive ID.", "^https://graph\\.microsoft\\.com/v1\\.0/(?:me/drive|users/[^/?#]+/drive|drives/[^/?#]+)(?:[/?]|$)"), isEnabled: true,
    },
    {
        code: "mcp-stdio", name: "MCP STDIO", connectorType: "mcp", category: "Server transports", adapterKey: "mcp.stdio",
        description: "Launch an operator-permitted MCP executable and discover its capabilities using the official MCP SDK.",
        configSchema: mcpStdioSchema, isEnabled: true,
    },
    {
        code: "mcp-streamable-http", name: "MCP Streamable HTTP", connectorType: "mcp", category: "Server transports", adapterKey: "mcp.streamable-http",
        description: "Initialize an MCP server over Streamable HTTP and discover its advertised capabilities.",
        configSchema: mcpHttpSchema("Streamable HTTP"), isEnabled: true,
    },
    {
        code: "mcp-sse", name: "MCP SSE", connectorType: "mcp", category: "Server transports", adapterKey: "mcp.sse",
        description: "Initialize an MCP server over the explicitly selected legacy HTTP+SSE transport.",
        configSchema: mcpHttpSchema("SSE"), isEnabled: true,
    },
    {
        code: "environment-local", name: "Local Runtime", connectorType: "environment", category: "Local runtimes", adapterKey: "environment.local",
        description: "Inspect an operator-permitted backend-host runtime executable and readable working directory.",
        configSchema: localEnvironmentSchema, isEnabled: true,
    },
    {
        code: "environment-http", name: "Remote HTTP Environment", connectorType: "environment", category: "Remote runtimes", adapterKey: "environment.http",
        description: "Verify a remote or custom runtime using its supplied HTTP health endpoint and authentication.",
        configSchema: httpSchema({ environmentType: { type: "string", title: "Environment type", enum: ["remote", "custom"] } }, ["environmentType"]), isEnabled: true,
    },
    {
        code: "environment-docker", name: "Docker", connectorType: "environment", category: "Containers", adapterKey: "environment.docker",
        description: "Verify a Docker-compatible daemon using its read-only version and daemon-information APIs.",
        configSchema: dockerSchema, isEnabled: true,
    },
].map(entry => ({ ...entry, configSchema: { ...entry.configSchema, "x-icon": catalogIcon(entry.code) } }));
