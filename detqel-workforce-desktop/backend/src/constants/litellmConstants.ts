/**
 * Configuration for the managed LiteLLM gateway. All model inference and embeddings route through this gateway;
 * real provider keys are configured on the gateway and never leave it. Every process/agent calls the gateway
 * with its own virtual key, which is why the admin endpoints below are used to register models and mint keys.
 */
export const LITELLM_ENDPOINTS = {
    chatCompletions: "/v1/chat/completions",
    embeddings: "/v1/embeddings",
    health: "/health/readiness",
    modelNew: "/model/new",
    modelDelete: "/model/delete",
    modelInfo: "/model/info",
    keyGenerate: "/key/generate",
    keyDelete: "/key/delete",
    keyInfo: "/key/info",
} as const;

export const LITELLM_HEADERS = {
    authorization: "Authorization",
    bearerPrefix: "Bearer ",
    contentType: "Content-Type",
    json: "application/json",
    /** The gateway's computed cost of the call in USD, sent on every completion response. */
    responseCost: "x-litellm-response-cost",
} as const;

/** Values for reasoning_effort; the gateway maps them to each provider's own thinking controls. */
export const LITELLM_REASONING_EFFORTS = {
    minimal: "minimal",
    low: "low",
    medium: "medium",
    high: "high",
} as const;

export const LITELLM_TIMEOUTS_MS = {
    admin: 15_000,
    health: 5_000,
    inference: 120_000,
    embeddings: 60_000,
} as const;

/** Upper bound on an admin/health response body so a misbehaving gateway cannot exhaust memory. */
export const LITELLM_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

/**
 * Server-sent events of a streamed completion. The final chunk carries the usage, including the gateway's
 * computed cost; the response-cost header is not sent for streams because the cost is known only at the end.
 */
export const LITELLM_STREAM = {
    dataPrefix: "data:",
    doneMarker: "[DONE]",
} as const;

export const LITELLM_ERROR_MESSAGES = {
    gatewayUnconfigured: "The local AI gateway is not configured. Restart the application so its managed services start.",
    adminFailed: "The local AI gateway rejected an administrative request.",
    inferenceFailed: "The local AI gateway could not complete the model request.",
    embeddingsFailed: "The local AI gateway could not complete the embeddings request.",
    unreadableResponse: "The local AI gateway returned a response that could not be read.",
    oversizedResponse: "The local AI gateway returned an unexpectedly large response.",
    healthFailed: "The local AI gateway did not report a healthy status.",
} as const;
