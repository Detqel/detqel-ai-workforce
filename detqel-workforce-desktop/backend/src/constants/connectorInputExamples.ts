const COMMON_EXAMPLES: Readonly<Record<string, string>> = {
    host: "localhost", port: "5432", database: "analytics", username: "report_reader", password: "Your database password",
    endpoint: "https://api.example.com/v1/health", token: "Paste your access token", headerName: "X-API-Key",
    headerValue: "Paste your API key", expectedResponseProperty: "id", serverName: "Reporting tools",
    command: "C:\\Program Files\\nodejs\\node.exe", arguments: '["C:\\\\Tools\\\\mcp-server\\\\server.js"]',
    environment: '{"API_KEY":"your-api-key"}', runtime: "C:\\Program Files\\nodejs\\node.exe",
    workingDirectory: "C:\\Users\\YourName\\Projects\\MyProject", path: "C:\\Users\\YourName\\Documents\\Reports",
    contactPoints: '["db1.example.com","db2.example.com"]', keyspace: "analytics",
    owner: "your-organization", repository: "your-repository", workspace: "your-workspace", email: "you@example.com",
    apiUrl: "https://api.github.com", serverUrl: "https://git.example.com", organizationUrl: "https://dev.azure.com/your-organization",
    project: "MyProject", projectPath: "your-group/your-project", projectKey: "MYPROJECT", region: "ap-south-1",
    accessKeyId: "Paste your AWS access key ID", secretAccessKey: "Paste your AWS secret access key", sessionToken: "Paste your temporary session token",
};

const CONNECTOR_EXAMPLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
    github: { owner: "octocat", repository: "Hello-World", token: "Paste your GitHub personal access token" },
    gitlab: { serverUrl: "https://gitlab.com", projectPath: "your-group/your-subgroup/your-project", token: "Paste your GitLab access token" },
    "azure-devops-repos": { repository: "MyRepository", token: "Paste your Azure DevOps personal access token" },
    "bitbucket-cloud": { token: "Paste your Bitbucket API or access token" },
    "bitbucket-data-center": { serverUrl: "https://bitbucket.example.com", token: "Paste your Bitbucket HTTP access token" },
    gitea: { serverUrl: "https://codeberg.org", token: "Paste your Gitea or Forgejo access token" },
    azure: { endpoint: "https://management.azure.com/subscriptions/your-subscription-id?api-version=2022-12-01" },
    "google-cloud": { endpoint: "https://cloudresourcemanager.googleapis.com/v3/projects/your-project-id", expectedResponseProperty: "name" },
    "google-drive": { endpoint: "https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name)", expectedResponseProperty: "files" },
    "microsoft-365": { endpoint: "https://graph.microsoft.com/v1.0/me" },
    "microsoft-teams": { endpoint: "https://graph.microsoft.com/v1.0/me/joinedTeams", expectedResponseProperty: "value" },
    onedrive: { endpoint: "https://graph.microsoft.com/v1.0/me/drive" },
    "environment-docker": { endpoint: "http://127.0.0.1:2375" },
    "mcp-streamable-http": { endpoint: "http://127.0.0.1:3000/mcp" },
    "mcp-sse": { endpoint: "http://127.0.0.1:3000/sse" },
};

export function connectorInputExample(code: string, field: string): string | undefined {
    return CONNECTOR_EXAMPLES[code]?.[field] ?? COMMON_EXAMPLES[field];
}
