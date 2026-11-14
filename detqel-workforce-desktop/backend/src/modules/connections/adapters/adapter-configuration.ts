import { AUTHORIZATION_HEADER, BASIC_AUTHORIZATION_PREFIX, BEARER_AUTHORIZATION_PREFIX } from "../../../constants/authConstants.js";
import { CONNECTOR_AUTHENTICATION, CONNECTOR_TCP_PORT_RANGE, RESERVED_AUTHENTICATION_HEADERS } from "../../../constants/connectionConstants.js";
import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../../../shared/errors/app-error.js";

export function requiredString(configuration: Record<string, unknown>, key: string): string {
    const value = configuration[key];
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new AppError(400, `Configuration field '${key}' is required.`);
    }
    return value;
}

export function requiredBoolean(configuration: Record<string, unknown>, key: string): boolean {
    const value = configuration[key];
    if (typeof value !== "boolean") throw new AppError(400, `Configuration field '${key}' must be a boolean.`);
    return value;
}

export function requiredPort(configuration: Record<string, unknown>): number {
    const port = configuration.port;
    if (typeof port !== "number" || !Number.isInteger(port) || port < CONNECTOR_TCP_PORT_RANGE.minimum || port > CONNECTOR_TCP_PORT_RANGE.maximum) {
        throw new AppError(400, "Configuration field 'port' must be a valid port number.");
    }
    return port;
}

export function httpEndpoint(value: string): URL {
    let endpoint: URL;
    try { endpoint = new URL(value); }
    catch { throw new AppError(400, "A valid absolute HTTP or HTTPS endpoint is required."); }
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.hash) {
        throw new AppError(400, "Endpoints must use HTTP or HTTPS without URL credentials or fragments.");
    }
    for (const key of endpoint.searchParams.keys()) {
        if (/(?:token|password|secret|api[_-]?key|signature|credential|authorization|access[_-]?key|^sig$)/i.test(key)) {
            throw new AppError(400, "Supply endpoint credentials through the authentication fields rather than URL query parameters.");
        }
    }
    return endpoint;
}

export function authenticationHeaders(configuration: Record<string, unknown>): Headers {
    const headers = new Headers();
    const authentication = requiredString(configuration, "authentication");
    switch (authentication) {
        case CONNECTOR_AUTHENTICATION.none: break;
        case CONNECTOR_AUTHENTICATION.bearer: headers.set(AUTHORIZATION_HEADER, `${BEARER_AUTHORIZATION_PREFIX}${requiredString(configuration, "token")}`); break;
        case CONNECTOR_AUTHENTICATION.basic: {
            const username = requiredString(configuration, "username");
            if (username.includes(":")) throw new AppError(400, "Basic authentication usernames cannot contain colons.");
            headers.set(AUTHORIZATION_HEADER, `${BASIC_AUTHORIZATION_PREFIX}${Buffer.from(`${username}:${requiredString(configuration, "password")}`).toString("base64")}`);
            break;
        }
        case CONNECTOR_AUTHENTICATION.header: {
            const name = requiredString(configuration, "headerName");
            if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || RESERVED_AUTHENTICATION_HEADERS.includes(name.toLowerCase())) {
                throw new AppError(400, "The authentication header name is not permitted.");
            }
            headers.set(name, requiredString(configuration, "headerValue"));
            break;
        }
        default: throw new AppError(400, "The selected authentication mechanism is not supported by this adapter.");
    }
    return headers;
}

export async function bounded<T>(operation: PromiseLike<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            onTimeout?.();
            reject(new AppError(504, "Connection verification exceeded the configured timeout."));
        }, timeoutMs);
    });
    try { return await Promise.race([operation, timeout]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
}

function canonicalComparison(path: string): string {
    return process.platform === "win32" ? path.toLowerCase() : path;
}

export async function allowedExecutable(path: string, allowedPaths: string[]): Promise<string> {
    if (!isAbsolute(path)) throw new AppError(400, "The executable must have an absolute path.");
    const executable = await realpath(path);
    const permitted = await Promise.all(allowedPaths.map(async (entry) => {
        if (!isAbsolute(entry)) throw new AppError(503, "The executable allowlist contains a non-absolute path.");
        return canonicalComparison(await realpath(entry));
    }));
    if (!permitted.includes(canonicalComparison(executable))) throw new AppError(403, "The executable is not permitted by the operator allowlist.");
    if (!(await stat(executable)).isFile()) throw new AppError(400, "The configured executable is not a file.");
    await access(executable, process.platform === "win32" ? constants.R_OK : constants.X_OK);
    return executable;
}

function isWithin(root: string, target: string): boolean {
    const difference = relative(canonicalComparison(root), canonicalComparison(target));
    return difference === "" || (!difference.startsWith(`..${sep}`) && difference !== ".." && !isAbsolute(difference));
}

/**
 * KIN's own code, configuration and runtime state. A filesystem connector can never reach them, even when an
 * operator root contains them, so the application's source and secrets are not exposed through a connection.
 */
export function applicationDirectories(): string[] {
    const backendRoot = fileURLToPath(new URL("../../../../", import.meta.url));
    const directories = [backendRoot];
    if (process.env.DETQEL_RUNTIME_DIR) directories.push(process.env.DETQEL_RUNTIME_DIR);
    if (process.env.DETQEL_CONFIG_PATH) directories.push(dirname(process.env.DETQEL_CONFIG_PATH));
    if (process.env.DETQEL_DESKTOP) directories.push(dirname(process.execPath));
    return directories.filter(isAbsolute);
}

async function assertNotApplicationPath(target: string): Promise<void> {
    for (const directory of applicationDirectories()) {
        const canonical = await realpath(directory).catch(() => directory);
        if (isWithin(canonical, target)) throw new AppError(403, "This path belongs to the KIN application and cannot be connected.");
    }
}

export async function allowedFilesystemPath(path: string, roots: string[], kind: "file" | "directory"): Promise<string> {
    if (!isAbsolute(path)) throw new AppError(400, "An absolute filesystem path is required.");
    const target = await realpath(path);
    await assertNotApplicationPath(target);
    const canonicalRoots = await Promise.all(roots.map(async (root) => {
        if (!isAbsolute(root)) throw new AppError(503, "The filesystem allowlist contains a non-absolute path.");
        return realpath(root);
    }));
    const permitted = canonicalRoots.some(root => isWithin(root, target));
    if (!permitted) throw new AppError(403, "The filesystem path is outside the operator-configured roots.");
    const entry = await stat(target);
    if (kind === "file" ? !entry.isFile() : !entry.isDirectory()) throw new AppError(400, `The configured path must be a ${kind}.`);
    await access(target, constants.R_OK);
    return target;
}
