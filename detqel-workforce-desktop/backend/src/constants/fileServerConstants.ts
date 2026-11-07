/**
 * The file server is the on-disk home for per-session knowledge-base uploads and chat artifacts. Its base path
 * is platform-resolved (and env-overridable) so the same logical layout works on Windows, macOS, and Linux.
 * The tree is: <base>/<workspaceId>/<scope>/<sessionId>/{chat,knowledge}. Uploaded files are stored under the
 * session's knowledge directory. The whole tree is created with owner-only permissions.
 */
export const FILE_SERVER_ENV_OVERRIDE = "DETQEL_FILE_SERVER_ROOT";

/** Platform-appropriate default roots, used when the override is not set. */
export const FILE_SERVER_DEFAULT_ROOTS = {
    windows: "C:\\DETQEL-Workforce",
    // Resolved at runtime against the user's home directory for macOS and Linux.
    macosRelativeToHome: "Library/Application Support/DETQEL-Workforce",
    linuxRelativeToHome: ".local/share/DETQEL-Workforce",
} as const;

export const FILE_SERVER_SCOPES = {
    conversations: "conversations",
    teams: "teams",
} as const;

export type FileServerScope = (typeof FILE_SERVER_SCOPES)[keyof typeof FILE_SERVER_SCOPES];

export const FILE_SERVER_SESSION_DIRECTORIES = {
    chat: "chat",
    knowledge: "knowledge",
} as const;

export const FILE_SERVER_FILE_MODES = { directory: 0o700, file: 0o600 } as const;

export const FILE_SERVER_TEMP = { prefix: ".upload-", suffix: ".tmp", randomBytes: 8, encoding: "hex" } as const;

/** Identifiers that form path segments must be safe tokens so a value can never escape the base directory. */
export const FILE_SERVER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Executable and script content types/extensions are rejected on upload. Size is intentionally not limited.
 * The check is twofold: a blocked extension and a blocked MIME type, so neither alone can smuggle an executable.
 */
export const FILE_SERVER_BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
    ".bat", ".cmd", ".com", ".sh", ".ps1", ".psm1", ".psd1", ".exe", ".dll", ".msi", ".scr",
    ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".jar", ".app", ".command", ".bin", ".run", ".apk", ".deb", ".rpm",
]);

export const FILE_SERVER_BLOCKED_MIME_TYPES: ReadonlySet<string> = new Set([
    "application/x-msdownload", "application/x-sh", "application/x-bat", "application/x-msdos-program",
    "application/x-executable", "application/vnd.microsoft.portable-executable", "application/x-elf",
    "text/x-shellscript", "application/x-powershell",
]);

export const FILE_SERVER_ERRORS = {
    invalidId: "A session, workspace, or scope identifier is not valid.",
    invalidFileName: "The upload file name is not valid.",
    blockedType: "This file type is not allowed. Executable and script files are rejected for safety.",
    notFound: "The requested file was not found in the session store.",
    unreadable: "The requested file could not be read.",
} as const;
