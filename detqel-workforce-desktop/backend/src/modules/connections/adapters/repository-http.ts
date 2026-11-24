import { REPOSITORY_LIMITS } from "../../../constants/connectionConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { bounded } from "./adapter-configuration.js";

/** Authenticated GET requests to one repository provider. */
export interface RepositoryHttp {
    /** Parsed JSON body, or null for an empty response. */
    json(url: URL): Promise<unknown>;
    text(url: URL): Promise<string>;
}

function providerFailure(status: number): AppError {
    if (status === 401 || status === 403) {
        return new AppError(422, `The repository provider rejected the credentials, or the token cannot access this repository (HTTP ${status}).`);
    }
    if (status === 404) return new AppError(404, "The repository, branch or path was not found, or the token cannot see it.");
    if (status === 429) return new AppError(429, "The repository provider's rate limit was reached. Try again later.");
    return new AppError(502, `The repository provider returned HTTP ${status}.`);
}

async function readLimited(response: Response): Promise<string> {
    if (response.body === null) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            length += chunk.value.byteLength;
            if (length > REPOSITORY_LIMITS.maxResponseBytes) {
                await reader.cancel();
                throw new AppError(502, "The repository provider's response exceeded the size limit.");
            }
            chunks.push(chunk.value);
        }
    } finally { reader.releaseLock(); }
    return Buffer.concat(chunks).toString("utf8");
}

/**
 * Requests are limited to the provider's origin and refuse redirects, so the credentials in `headers` are never
 * sent to another host.
 */
export function repositoryHttp(base: URL, headers: Headers, timeoutMs: number, repositoryRoot?: string): RepositoryHttp {
    const send = (url: URL, expectJson: boolean): Promise<unknown> => {
        if (url.origin !== base.origin) throw new AppError(400, "Repository requests must stay on the provider's origin.");
        if (repositoryRoot !== undefined && url.pathname !== repositoryRoot && !url.pathname.startsWith(`${repositoryRoot}/`)) {
            throw new AppError(403, "This connection can access only its configured repository.");
        }
        const controller = new AbortController();
        return bounded((async () => {
            let response: Response;
            try {
                response = await fetch(url, { method: "GET", headers, redirect: "error", signal: controller.signal });
            } catch {
                throw new AppError(502, "The repository provider could not be reached. Check the server URL and network access.");
            }
            const body = await readLimited(response);
            if (!response.ok) throw providerFailure(response.status);
            if (!expectJson) return body;
            // Azure DevOps answers a request it cannot authenticate with HTTP 203 and an HTML sign-in page.
            if (response.status === 203) throw providerFailure(401);
            if (response.status === 204 || body.trim() === "") return null;
            try { return JSON.parse(body) as unknown; }
            catch { throw new AppError(502, "The repository provider returned a response that is not JSON."); }
        })(), timeoutMs, () => controller.abort());
    };
    return {
        json: url => send(url, true),
        text: async url => send(url, false) as Promise<string>,
    };
}
