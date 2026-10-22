import { CONNECTOR_TYPES } from "./connectionConstants.js";

export const INITIAL_CONNECTOR_TYPES = [
    { code: CONNECTOR_TYPES.data, name: "Data", description: "Databases, APIs, files, and data sources", sortOrder: 0 },
    { code: CONNECTOR_TYPES.mcp, name: "MCP", description: "Model Context Protocol servers and tools", sortOrder: 1 },
    { code: CONNECTOR_TYPES.environment, name: "Environment", description: "Runtime environments and infrastructure", sortOrder: 2 },
    { code: CONNECTOR_TYPES.enterprise, name: "Enterprise", description: "Business applications and enterprise services", sortOrder: 3 },
];
export const INITIAL_DOMAINS = ["Retail & E-Commerce", "Technology & SaaS", "Finance & Banking", "Healthcare & Pharma", "Logistics & Supply Chain", "Manufacturing", "Agency & Professional Services"];
export const CONNECTOR_ICON_KEYS: Readonly<Record<string, string>> = {
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
export const DEMO_ACTIVITY_DAY_MS = 86_400_000;
