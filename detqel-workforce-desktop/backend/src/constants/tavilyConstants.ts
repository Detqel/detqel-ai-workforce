/**
 * Tavily provides the web-search capability for discussions. Each workspace saves its own Tavily API key in
 * Settings, encrypted at rest like the model key. A web search requested without a saved key fails fast with a
 * message the UI surfaces, never a silent answer without the web. Results carry source URLs so answers that draw
 * on the web can cite them.
 */
export const TAVILY_BASE_URL = "https://api.tavily.com";

export const TAVILY_ENDPOINTS = { search: "/search" } as const;

export const TAVILY_SEARCH_DEPTH = { basic: "basic", advanced: "advanced" } as const;

export const TAVILY_LIMITS = {
    defaultMaxResults: 5,
    maxResults: 10,
    requestTimeoutMs: 20_000,
    responseLimitBytes: 4 * 1024 * 1024,
} as const;

/** Status codes Tavily answers with when the key is wrong or has no credits left. */
export const TAVILY_STATUS = { unauthorized: 401, rateLimited: 429, planLimit: 432, payAsYouGoLimit: 433 } as const;

/**
 * Statuses this API answers with when web search fails. All are 4xx so the fixed, user-facing reason reaches the
 * UI (5xx messages are concealed). None is 401, which the app treats as the user's own session expiring.
 */
export const TAVILY_HTTP_STATUS = { configuration: 409, rateLimited: 429, upstream: 424 } as const;

/** The one-result search Settings runs to confirm a key works. It uses one basic-search credit. */
export const TAVILY_CONNECTION_TEST = {
    query: "Tavily connection check",
    maxResults: 1,
    successMessage: "Connected to Tavily",
} as const;

export const TAVILY_ERRORS = {
    unconfigured: "Web search is not configured. Add a Tavily API key in Settings before using web search.",
    unauthorized: "Tavily rejected the API key. Check the key in Settings.",
    noCredits: "The Tavily account has no search credits left.",
    rateLimited: "Tavily is rate limiting requests. Try again shortly.",
    requestFailed: "The web search request failed.",
    oversizedResponse: "The web search service returned an unexpectedly large response.",
    invalidQuery: "A non-empty search query is required.",
    invalidMaxResults: "The requested number of web results is out of range.",
} as const;
