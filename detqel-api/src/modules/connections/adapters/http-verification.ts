import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { bounded } from "./adapter-configuration.js";

const MAX_VERIFICATION_RESPONSE_BYTES = 1024 * 1024;

/** Restrict authenticated requests, including server-supplied MCP SSE endpoints, to one origin. */
export function originRestrictedFetch(endpoint: URL, headers: Headers, timeoutMs: number): FetchLike {
    return async (input, init) => {
        const url = new URL(input);
        if (url.origin !== endpoint.origin || url.username || url.password || url.hash) {
            throw new AppError(422, "The server attempted a request outside its configured endpoint origin.");
        }
        const requestHeaders = new Headers(init?.headers);
        headers.forEach((value, name) => requestHeaders.set(name, value));
        const controller = new AbortController();
        const signals = [controller.signal];
        if (init?.signal) signals.push(init.signal);
        return bounded(fetch(input, {
            ...init,
            headers: requestHeaders,
            redirect: "error",
            signal: AbortSignal.any(signals),
        }), timeoutMs, () => controller.abort());
    };
}

export async function verifiedHttpResponse(endpoint: URL, headers: Headers, timeoutMs: number, requireJson: boolean): Promise<unknown> {
    const controller = new AbortController();
    const operation = (async () => {
        const response = await fetch(endpoint, { method: "GET", headers, redirect: "error", signal: controller.signal });
        if (!response.ok) {
            await response.body?.cancel();
            throw new AppError(422, `The configured endpoint rejected verification (HTTP ${response.status}).`);
        }
        if (!requireJson) {
            await response.body?.cancel();
            return undefined;
        }
        if (response.body === null) throw new AppError(422, "The endpoint did not return the required verification response.");
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                length += chunk.value.byteLength;
                if (length > MAX_VERIFICATION_RESPONSE_BYTES) {
                    await reader.cancel();
                    throw new AppError(422, "The verification response exceeded the allowed size.");
                }
                chunks.push(chunk.value);
            }
        } finally { reader.releaseLock(); }
        try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; }
        catch { throw new AppError(422, "The endpoint did not return valid JSON for verification."); }
    })();
    return bounded(operation, timeoutMs, () => controller.abort());
}

export function responseHasProperty(response: unknown, property: string): boolean {
    const parts = property.split(".");
    let current = response;
    for (const part of parts) {
        if (!part || ["__proto__", "prototype", "constructor"].includes(part) || current === null || typeof current !== "object" || !Object.hasOwn(current, part)) return false;
        current = (current as Record<string, unknown>)[part];
    }
    return current !== undefined && current !== null;
}
