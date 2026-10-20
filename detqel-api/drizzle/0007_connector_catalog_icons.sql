UPDATE "connector_catalog" AS catalog
SET "config_schema" = jsonb_set(catalog."config_schema", '{x-icon}', to_jsonb(metadata.icon_key::text), true)
FROM (VALUES
    ('postgresql', 'devicon:Postgresql'),
    ('sql-server', 'lucide:Database'),
    ('mysql', 'devicon:MysqlIcon'),
    ('mongodb', 'devicon:MongodbIcon'),
    ('cassandra', 'devicon:Cassandra'),
    ('rest-api', 'lucide:Globe'),
    ('soap-api', 'lucide:CodeXml'),
    ('custom-api', 'lucide:Webhook'),
    ('files', 'lucide:File'),
    ('folders', 'lucide:Folder'),
    ('github', 'devicon:GithubIcon'),
    ('aws', 'devicon:Aws'),
    ('azure', 'devicon:MicrosoftAzure'),
    ('google-cloud', 'devicon:GoogleCloud'),
    ('google-drive', 'devicon:GoogleDrive'),
    ('microsoft-365', 'devicon:MicrosoftIcon'),
    ('microsoft-teams', 'devicon:MicrosoftTeams'),
    ('onedrive', 'devicon:MicrosoftOnedrive'),
    ('mcp-stdio', 'devicon:McpIcon'),
    ('mcp-streamable-http', 'devicon:McpIcon'),
    ('mcp-sse', 'devicon:McpIcon'),
    ('environment-local', 'lucide:Monitor'),
    ('environment-http', 'lucide:Server'),
    ('environment-docker', 'devicon:DockerIcon')
) AS metadata(code, icon_key)
WHERE catalog."code" = metadata.code;
