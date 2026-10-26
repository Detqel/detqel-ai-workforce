import { CONNECTOR_TYPES } from "./connectionConstants.js";
import { AI_PROVIDER_IDS } from "./settingsConstants.js";

// Provider catalog metadata only. Credentials, connection state, and discovered models belong to users.
export const INITIAL_AI_PROVIDERS = [
    { id: AI_PROVIDER_IDS.openai, name: "OpenAI", iconKey: AI_PROVIDER_IDS.openai, description: "Connect to OpenAI models.", sortOrder: 0 },
    { id: AI_PROVIDER_IDS.anthropic, name: "Anthropic", iconKey: AI_PROVIDER_IDS.anthropic, description: "Connect to Anthropic Claude models.", sortOrder: 1 },
    { id: AI_PROVIDER_IDS.google, name: "Google", iconKey: AI_PROVIDER_IDS.google, description: "Connect to Google Gemini models.", sortOrder: 2 },
    { id: AI_PROVIDER_IDS.groq, name: "Groq", iconKey: AI_PROVIDER_IDS.groq, description: "Connect to models hosted by Groq.", sortOrder: 3 },
    { id: AI_PROVIDER_IDS.deepseek, name: "DeepSeek", iconKey: AI_PROVIDER_IDS.deepseek, description: "Connect to DeepSeek models.", sortOrder: 4 },
    { id: AI_PROVIDER_IDS.custom, name: "Custom", iconKey: AI_PROVIDER_IDS.custom, description: "Connect to a custom OpenAI-compatible endpoint.", sortOrder: 5 },
];

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
