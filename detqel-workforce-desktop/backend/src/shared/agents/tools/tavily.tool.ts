import { AppError } from "../../errors/app-error.js";
import { createScopedLogger } from "../../logging/logger.js";
import {
    TAVILY_BASE_URL,
    TAVILY_ENDPOINTS,
    TAVILY_ERRORS,
    TAVILY_HTTP_STATUS,
    TAVILY_LIMITS,
    TAVILY_SEARCH_DEPTH,
    TAVILY_STATUS,
} from "../../../constants/tavilyConstants.js";

const logger = createScopedLogger("tavily-tool");

export interface TavilyConfig {
    readonly apiKey: string;
}

/**
 * A clear, user-facing failure for a search status. The response body is never shown. Statuses are 4xx so the
 * reason reaches the user (5xx messages are concealed), and never 401, which would look like the user's own
 * session expiring.
 */
function failureFor(status: number): AppError {
    if (status === TAVILY_STATUS.unauthorized) return new AppError(TAVILY_HTTP_STATUS.configuration, TAVILY_ERRORS.unauthorized);
    if (status === TAVILY_STATUS.planLimit || status === TAVILY_STATUS.payAsYouGoLimit) return new AppError(TAVILY_HTTP_STATUS.configuration, TAVILY_ERRORS.noCredits);
    if (status === TAVILY_STATUS.rateLimited) return new AppError(TAVILY_HTTP_STATUS.rateLimited, TAVILY_ERRORS.rateLimited);
    return new AppError(TAVILY_HTTP_STATUS.upstream, TAVILY_ERRORS.requestFailed);
}

export interface WebSearchResult {
    readonly title: string;
    readonly url: string;
    readonly snippet: string;
    readonly score: number;
}

export interface WebSearchResponse {
    readonly query: string;
    readonly answer: string | null;
    readonly results: ReadonlyArray<WebSearchResult>;
}

export interface WebSearchOptions {
    readonly maxResults?: number;
    readonly deep?: boolean;
}

/**
 * Tavily web-search tool for the agent runtime. Fails fast when unconfigured so the absence of a key surfaces
 * as a clear UI error rather than a silent empty result. Responses are bounded and normalised with source URLs
 * so answers that draw on the web can cite them.
 */
export class TavilyWebSearchTool {
    constructor(private readonly config: TavilyConfig) {
        if (!config.apiKey) throw new AppError(TAVILY_HTTP_STATUS.configuration, TAVILY_ERRORS.unconfigured);
    }

    async search(query: string, options: WebSearchOptions = {}, signal?: AbortSignal): Promise<WebSearchResponse> {
        const trimmed = query.trim();
        if (trimmed.length === 0) throw new AppError(400, TAVILY_ERRORS.invalidQuery);
        const maxResults = options.maxResults ?? TAVILY_LIMITS.defaultMaxResults;
        if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > TAVILY_LIMITS.maxResults) throw new AppError(400, TAVILY_ERRORS.invalidMaxResults);

        const body = {
            query: trimmed,
            max_results: maxResults,
            search_depth: options.deep ? TAVILY_SEARCH_DEPTH.advanced : TAVILY_SEARCH_DEPTH.basic,
            include_answer: true,
        };
        const timeout = AbortSignal.timeout(TAVILY_LIMITS.requestTimeoutMs);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

        let response: Response;
        try {
            response = await fetch(`${TAVILY_BASE_URL}${TAVILY_ENDPOINTS.search}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.apiKey}` },
                body: JSON.stringify(body),
                redirect: "error",
                signal: combined,
            });
        } catch {
            logger.error({}, "Web search request did not complete");
            throw new AppError(TAVILY_HTTP_STATUS.upstream, TAVILY_ERRORS.requestFailed);
        }
        const text = await this.readBounded(response);
        if (!response.ok) {
            logger.error({ status: response.status }, "Web search returned an error status");
            throw failureFor(response.status);
        }
        return this.normalise(trimmed, text);
    }

    private normalise(query: string, raw: string): WebSearchResponse {
        let payload: { answer?: unknown; results?: unknown };
        try {
            payload = JSON.parse(raw) as { answer?: unknown; results?: unknown };
        } catch {
            throw new AppError(TAVILY_HTTP_STATUS.upstream, TAVILY_ERRORS.requestFailed);
        }
        const rows = Array.isArray(payload.results) ? payload.results : [];
        const results: WebSearchResult[] = rows
            .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object")
            .map(row => ({
                title: typeof row.title === "string" ? row.title : "",
                url: typeof row.url === "string" ? row.url : "",
                snippet: typeof row.content === "string" ? row.content : "",
                score: typeof row.score === "number" ? row.score : 0,
            }))
            .filter(result => result.url.length > 0);
        return { query, answer: typeof payload.answer === "string" ? payload.answer : null, results };
    }

    private async readBounded(response: Response): Promise<string> {
        if (response.body === null) return "";
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                length += chunk.value.byteLength;
                if (length > TAVILY_LIMITS.responseLimitBytes) {
                    await reader.cancel();
                    throw new AppError(TAVILY_HTTP_STATUS.upstream, TAVILY_ERRORS.oversizedResponse);
                }
                chunks.push(chunk.value);
            }
        } finally {
            reader.releaseLock();
        }
        return Buffer.concat(chunks).toString("utf8");
    }
}
