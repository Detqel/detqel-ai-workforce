export const CONNECTOR_FILE_LIMITS = {
    bytes: 5 * 1024 * 1024,
    base64Characters: 4 * Math.ceil(5 * 1024 * 1024 / 3),
    requestBytes: 8 * 1024 * 1024,
} as const;

export const CONNECTOR_TEXT_FILE_EXTENSIONS = new Set([
    ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".ndjson", ".xml",
    ".yaml", ".yml", ".toml", ".ini", ".log", ".sql", ".html", ".htm", ".rst",
]);
