import { z } from "zod";
import { AGENT_DATA_POLICY } from "../../../../constants/agentPromptConstants.js";
import { AGENT_RUNTIME_PROCESSES } from "../../../../constants/agentRuntimeConstants.js";
import type { IAgentModelProvisioner } from "../../../../shared/agents/agent-model.provisioner.js";
import type { CallUsage, ChatCompletionRequest, LiteLlmClient } from "../../../../shared/agents/litellm.client.js";
import type { PromptLoader } from "../../../../shared/agents/prompts/loader.js";
import { structuredOutputShape } from "../../../../shared/agents/structured-output-schema.js";
import type { VirtualKeyRegistry } from "../../../../shared/agents/virtual-key.registry.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";

const logger = createScopedLogger("brain-model");
/** How long a workspace without a usable model is remembered, so every question does not retry provisioning. */
const UNAVAILABLE_TTL_MS = 60_000;

export const ZERO_USAGE: CallUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 };
export const addUsage = (a: CallUsage, b: CallUsage): CallUsage => ({
    inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens, costUsd: a.costUsd + b.costUsd,
});

export interface StructuredRequest<T> {
    readonly workspaceId: string;
    readonly promptId: string;
    readonly variables?: Readonly<Record<string, string>>;
    /** Serialised as JSON for the user turn. Untrusted content inside it must already be wrapped as untrusted data. */
    readonly input: unknown;
    readonly schema: z.ZodType<T>;
    readonly schemaName: string;
    readonly purpose: NonNullable<ChatCompletionRequest["purpose"]>;
    readonly maxTokens?: number;
    readonly signal?: AbortSignal;
}

/** The model port the agents use; tests replace it with a scripted fake. */
export interface IBrainModel {
    available(workspaceId: string, signal?: AbortSignal): Promise<boolean>;
    structured<T>(request: StructuredRequest<T>): Promise<{ value: T; usage: CallUsage }>;
}

/**
 * The Business Brain's access to the workspace's configured model through the managed LiteLLM gateway. Models
 * coordinate and explain; they never compute governed numbers (PRD 7.1). Every response is schema-validated, so
 * a malformed or manipulated reply is rejected rather than trusted.
 */
export class BrainModel implements IBrainModel {
    private readonly unavailable = new Map<string, number>();

    constructor(
        private readonly gateway: LiteLlmClient,
        private readonly keys: VirtualKeyRegistry,
        private readonly models: IAgentModelProvisioner,
        private readonly prompts: PromptLoader,
    ) {}

    async available(workspaceId: string, signal?: AbortSignal): Promise<boolean> {
        const until = this.unavailable.get(workspaceId);
        if (until && until > Date.now()) return false;
        try {
            await this.models.ensure(workspaceId, signal);
            this.unavailable.delete(workspaceId);
            return true;
        } catch (error) {
            if (error instanceof AppError && [404, 409, 422, 503].includes(error.statusCode)) {
                this.unavailable.set(workspaceId, Date.now() + UNAVAILABLE_TTL_MS);
                if (this.unavailable.size > 512) this.unavailable.delete(this.unavailable.keys().next().value!);
                return false;
            }
            throw error;
        }
    }

    async structured<T>(request: StructuredRequest<T>): Promise<{ value: T; usage: CallUsage }> {
        const { virtualKey, modelAlias } = await this.keys.resolveProcessKey(request.workspaceId, AGENT_RUNTIME_PROCESSES.orchestration);
        const limits = await this.gateway.modelContextLimits(modelAlias, request.signal);
        const system = `${AGENT_DATA_POLICY}\n\n${await this.prompts.renderAgentPrompt(request.promptId, { variables: request.variables, includeGlobalGuidance: true })}`;
        const completion: ChatCompletionRequest = {
            model: modelAlias,
            purpose: request.purpose,
            reasoningEffort: "low",
            maxTokens: Math.min(request.maxTokens ?? 2_000, limits.output),
            responseSchema: { name: request.schemaName, schema: structuredOutputShape(z.toJSONSchema(request.schema)) },
            messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(request.input) }],
        };
        const inputTokens = await this.gateway.countTokens(completion, request.signal);
        if (inputTokens + completion.maxTokens! > limits.input) throw new AppError(422, "The business context is larger than the configured model can read. Ask a narrower question.");
        const result = await this.gateway.chatCompletion(virtualKey, completion, request.signal);
        let parsed: unknown;
        try { parsed = JSON.parse(result.content); }
        catch { throw new AppError(502, "The model returned an unreadable response.", undefined, true); }
        const checked = request.schema.safeParse(parsed);
        if (!checked.success) {
            logger.warn({ schema: request.schemaName, issues: checked.error.issues.length }, "Model output failed schema validation");
            throw new AppError(502, "The model returned a response that did not match the required structure.", undefined, true);
        }
        return { value: checked.data, usage: result.usage };
    }
}
