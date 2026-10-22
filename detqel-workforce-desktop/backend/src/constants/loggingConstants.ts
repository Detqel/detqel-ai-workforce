export const IGNORED_LOG_EXTRA_KEYS: ReadonlySet<string> = new Set([
    "level", "time", "pid", "hostname", "msg", "context", "point", "service", "module",
    "err", "error", "v", "reqId", "requestId", "req", "res", "responseTime",
]);
export const LOG_TIMESTAMP_FORMAT = { componentWidth: 2, millisecondWidth: 3, paddingCharacter: "0" } as const;
export const LOG_CONTEXTS = { http: "HTTP", server: "Server" } as const;
export const LOG_LEVELS = { development: "info", production: "warn" } as const;
