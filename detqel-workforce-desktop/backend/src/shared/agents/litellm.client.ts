import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import {
    LITELLM_ENDPOINTS,
    LITELLM_ERROR_MESSAGES,
    LITELLM_HEADERS,
    LITELLM_REASONING_EFFORTS,
    LITELLM_RESPONSE_LIMIT_BYTES,
    LITELLM_TIMEOUTS_MS,
} from "../../constants/litellmConstants.js";

const logger = createScopedLogger("litellm-client");

export interface LiteLlmGatewayConfig {
    /** Base URL of the managed gateway, for example http://127.0.0.1:50051. */
    readonly baseUrl: string;
    /** Master key used only for administrative calls (registering models, minting virtual keys). */
    readonly masterKey: string;
}

export interface ChatMessage {
    readonly role: "system" | "user" | "assistant" | "tool";
    readonly content: string;
}

export type ReasoningEffort = (typeof LITELLM_REASONING_EFFORTS)[keyof typeof LITELLM_REASONING_EFFORTS];

export interface ChatCompletionRequest {
    readonly model: string;
    readonly messages: ReadonlyArray<ChatMessage>;
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly responseFormatJson?: boolean;
    /** How much hidden reasoning the model may spend. Omitted means the provider's default. */
    readonly reasoningEffort?: ReasoningEffort;
}

/** Gateway-reported usage for one model call. Cost is the gateway's own figure, not an estimate. */
export interface CallUsage {
    readonly inputTokens: number;
    readonly outputTokens: number;
    /** Input tokens served from the provider's prompt cache. */
    readonly cachedTokens: number;
    readonly costUsd: number;
}

export interface ChatCompletionResult {
    readonly content: string;
    readonly tokensUsed: number;
    readonly usage: CallUsage;
}

const numberOrZero = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

export interface EmbeddingsRequest {
    readonly model: string;
    readonly input: ReadonlyArray<string>;
}

export interface EmbeddingsResult {
    readonly vectors: ReadonlyArray<ReadonlyArray<number>>;
    readonly tokensUsed: number;
}

export interface RegisterModelParams {
    /** Deployment id chosen by the application, so a registration can later be replaced or removed by id. */
    readonly deploymentId: string;
    /** Stable alias the gateway exposes to callers (mapped to the provider model below). */
    readonly modelAlias: string;
    /** Provider-qualified model, for example "openai/gpt-4o" or "gemini/gemini-2.0-flash". */
    readonly providerModel: string;
    /** The real provider key, sent only to the gateway. Omitted for local models that need no key. */
    readonly providerApiKey?: string;
    /** Provider base URL, for local or OpenAI-compatible providers. */
    readonly apiBase?: string;
}

export interface GeneratedVirtualKey {
    readonly key: string;
    readonly keyId: string;
}

export interface GenerateVirtualKeyParams {
    /** Model aliases this key is permitted to call. An empty list is rejected to avoid an over-broad key. */
    readonly allowedModels: ReadonlyArray<string>;
    /** Opaque identity recorded on the gateway for auditing (never a secret). */
    readonly keyAlias: string;
    readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * Typed wrapper over the managed LiteLLM gateway. The application never calls provider APIs directly through
 * this client: it registers models with the real provider key, mints per-agent virtual keys, and performs
 * inference/embeddings using a supplied virtual key. Secret values are never logged.
 */
export class LiteLlmClient {
    private readonly baseUrl: string;

    constructor(private readonly config: LiteLlmGatewayConfig) {
        this.baseUrl = (config.baseUrl ?? "").replace(/\/+$/, "");
    }

    /** Throws a clear error when the gateway was not configured, so features fail fast at the point of use. */
    private assertConfigured(): void {
        if (!this.baseUrl || !this.config.masterKey) throw new AppError(503, LITELLM_ERROR_MESSAGES.gatewayUnconfigured);
    }

    /** True when the gateway reports readiness. Never throws for an unhealthy gateway; returns false. */
    async isHealthy(signal?: AbortSignal): Promise<boolean> {
        this.assertConfigured();
        try {
            await this.request(LITELLM_ENDPOINTS.health, "GET", this.config.masterKey, undefined, LITELLM_TIMEOUTS_MS.health, signal);
            return true;
        } catch {
            return false;
        }
    }

    /** Registers a provider model on the gateway under a stable alias. Returns the alias for later key scoping. */
    async registerModel(params: RegisterModelParams, signal?: AbortSignal): Promise<string> {
        this.assertConfigured();
        const body = {
            model_name: params.modelAlias,
            litellm_params: {
                model: params.providerModel,
                ...(params.providerApiKey ? { api_key: params.providerApiKey } : {}),
                ...(params.apiBase ? { api_base: params.apiBase } : {}),
            },
            model_info: { id: params.deploymentId },
        };
        await this.adminRequest(LITELLM_ENDPOINTS.modelNew, body, signal);
        logger.info({ modelAlias: params.modelAlias, deploymentId: params.deploymentId, providerModel: params.providerModel }, "Registered gateway model");
        return params.modelAlias;
    }

    /**
     * Removes a model deployment by id. The gateway answers "not found" for an id it does not hold, so a
     * failed removal is logged rather than thrown; a gateway that is truly down fails the registration that follows.
     */
    async deleteModel(deploymentId: string, signal?: AbortSignal): Promise<void> {
        this.assertConfigured();
        try {
            await this.adminRequest(LITELLM_ENDPOINTS.modelDelete, { id: deploymentId }, signal);
            logger.info({ deploymentId }, "Deleted gateway model");
        } catch {
            logger.warn({ deploymentId }, "Gateway model removal did not confirm; it may not have existed");
        }
    }

    /** Mints a virtual key scoped to the given model aliases. The returned key value is a secret. */
    async generateVirtualKey(params: GenerateVirtualKeyParams, signal?: AbortSignal): Promise<GeneratedVirtualKey> {
        this.assertConfigured();
        if (params.allowedModels.length === 0) throw new AppError(400, "A virtual key must be scoped to at least one model.");
        const payload = await this.adminRequest(LITELLM_ENDPOINTS.keyGenerate, {
            models: [...params.allowedModels],
            key_alias: params.keyAlias,
            ...(params.metadata ? { metadata: params.metadata } : {}),
        }, signal) as { key?: unknown; token?: unknown };
        const key = typeof payload.key === "string" ? payload.key : null;
        // The hashed token identifies the key for revocation; the key value itself is never stored here.
        const keyId = typeof payload.token === "string" ? payload.token : null;
        if (!key || !keyId) throw new AppError(502, LITELLM_ERROR_MESSAGES.adminFailed);
        logger.info({ keyAlias: params.keyAlias, keyId, modelCount: params.allowedModels.length }, "Minted virtual key");
        return { key, keyId };
    }

    /** Revokes a virtual key by its gateway key id. */
    async deleteVirtualKey(keyId: string, signal?: AbortSignal): Promise<void> {
        this.assertConfigured();
        await this.adminRequest(LITELLM_ENDPOINTS.keyDelete, { keys: [keyId] }, signal);
        logger.info({ keyId }, "Revoked virtual key");
    }

    /** Runs a chat completion through the gateway using a caller-supplied virtual key. */
    async chatCompletion(virtualKey: string, request: ChatCompletionRequest, signal?: AbortSignal): Promise<ChatCompletionResult> {
        this.assertConfigured();
        const body = {
            model: request.model,
            messages: request.messages.map(message => ({ role: message.role, content: message.content })),
            ...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
            ...(request.maxTokens !== undefined ? { max_tokens: request.maxTokens } : {}),
            ...(request.responseFormatJson ? { response_format: { type: "json_object" } } : {}),
            ...(request.reasoningEffort ? { reasoning_effort: request.reasoningEffort } : {}),
            // A parameter the selected provider does not support (for example reasoning effort on a non-reasoning
            // model) is dropped by the gateway instead of failing the call.
            drop_params: true,
        };
        const { payload, headers } = await this.send(LITELLM_ENDPOINTS.chatCompletions, "POST", virtualKey, body, LITELLM_TIMEOUTS_MS.inference, LITELLM_ERROR_MESSAGES.inferenceFailed, signal) as {
            payload: {
                choices?: Array<{ message?: { content?: unknown } }>;
                usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } };
            };
            headers: Headers;
        };
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new AppError(502, LITELLM_ERROR_MESSAGES.inferenceFailed);
        const usage: CallUsage = {
            inputTokens: numberOrZero(payload.usage?.prompt_tokens),
            outputTokens: numberOrZero(payload.usage?.completion_tokens),
            cachedTokens: numberOrZero(payload.usage?.prompt_tokens_details?.cached_tokens),
            costUsd: numberOrZero(Number(headers.get(LITELLM_HEADERS.responseCost))),
        };
        return { content, tokensUsed: numberOrZero(payload.usage?.total_tokens), usage };
    }

    /** Produces embeddings through the gateway using a caller-supplied virtual key. */
    async embeddings(virtualKey: string, request: EmbeddingsRequest, signal?: AbortSignal): Promise<EmbeddingsResult> {
        this.assertConfigured();
        if (request.input.length === 0) throw new AppError(400, "Embeddings require at least one input.");
        const payload = await this.request(LITELLM_ENDPOINTS.embeddings, "POST", virtualKey, {
            model: request.model,
            input: [...request.input],
        }, LITELLM_TIMEOUTS_MS.embeddings, signal) as {
            data?: Array<{ embedding?: unknown }>;
            usage?: { total_tokens?: unknown };
        };
        const data = payload.data;
        if (!Array.isArray(data) || data.length !== request.input.length) throw new AppError(502, LITELLM_ERROR_MESSAGES.embeddingsFailed);
        const vectors = data.map(entry => {
            if (!Array.isArray(entry.embedding) || entry.embedding.some(value => typeof value !== "number")) {
                throw new AppError(502, LITELLM_ERROR_MESSAGES.embeddingsFailed);
            }
            return entry.embedding as number[];
        });
        return { vectors, tokensUsed: typeof payload.usage?.total_tokens === "number" ? payload.usage.total_tokens : 0 };
    }

    private async adminRequest(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
        try {
            return await this.request(path, "POST", this.config.masterKey, body, LITELLM_TIMEOUTS_MS.admin, signal);
        } catch (error) {
            if (error instanceof AppError) throw error;
            logger.error({ path }, "Gateway administrative request failed");
            throw new AppError(502, LITELLM_ERROR_MESSAGES.adminFailed);
        }
    }

    private async request(
        path: string,
        method: "GET" | "POST",
        bearer: string,
        body: Record<string, unknown> | undefined,
        timeoutMs: number,
        signal?: AbortSignal,
    ): Promise<unknown> {
        return (await this.send(path, method, bearer, body, timeoutMs, LITELLM_ERROR_MESSAGES.adminFailed, signal)).payload;
    }

    /** Sends one request and returns the parsed body together with the response headers. */
    private async send(
        path: string,
        method: "GET" | "POST",
        bearer: string,
        body: Record<string, unknown> | undefined,
        timeoutMs: number,
        failureMessage: string,
        signal?: AbortSignal,
    ): Promise<{ payload: unknown; headers: Headers }> {
        const headers = new Headers({ [LITELLM_HEADERS.authorization]: `${LITELLM_HEADERS.bearerPrefix}${bearer}` });
        if (body !== undefined) headers.set(LITELLM_HEADERS.contentType, LITELLM_HEADERS.json);
        const timeout = AbortSignal.timeout(timeoutMs);
        const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                redirect: "error",
                signal: combined,
            });
        } catch {
            // The gateway address and request shape are controlled by the application, so a thrown fetch means
            // the local service is unreachable or timed out. The reason is logged without any secret material.
            logger.error({ path, method }, "Gateway request did not complete");
            throw new AppError(502, LITELLM_ERROR_MESSAGES.inferenceFailed);
        }

        const text = await this.readBoundedBody(response);
        if (!response.ok) {
            logger.error({ path, method, status: response.status }, "Gateway returned an error status");
            throw new AppError(502, failureMessage);
        }
        if (text.length === 0) return { payload: {}, headers: response.headers };
        try {
            return { payload: JSON.parse(text) as unknown, headers: response.headers };
        } catch {
            throw new AppError(502, LITELLM_ERROR_MESSAGES.unreadableResponse);
        }
    }

    private async readBoundedBody(response: Response): Promise<string> {
        if (response.body === null) return "";
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
            for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                length += chunk.value.byteLength;
                if (length > LITELLM_RESPONSE_LIMIT_BYTES) {
                    await reader.cancel();
                    throw new AppError(502, LITELLM_ERROR_MESSAGES.oversizedResponse);
                }
                chunks.push(chunk.value);
            }
        } finally {
            reader.releaseLock();
        }
        return Buffer.concat(chunks).toString("utf8");
    }
}
