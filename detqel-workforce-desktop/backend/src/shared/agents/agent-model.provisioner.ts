import { createHmac } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import type { VirtualKeyRegistry, WorkspaceModels } from "./virtual-key.registry.js";
import {
    AGENT_CONFIGURATION_FINGERPRINT,
    AGENT_EMBEDDING_PROVIDER_PREFIX,
    AGENT_RUNTIME_ERRORS,
    LITELLM_PROVIDER_PREFIXES,
} from "../../constants/agentRuntimeConstants.js";

export interface AgentModelConfiguration {
    readonly providerId: string;
    readonly modelId: string;
    /** The real provider key. Used only to register the model on the gateway. */
    readonly apiKey: string;
}

/** Reads a workspace's saved provider, model and key; fails with an actionable message when incomplete. */
export type AgentModelConfigurationResolver = (workspaceId: string) => Promise<AgentModelConfiguration>;

export interface EmbeddingModelSettings {
    /** Model served by the managed Ollama container, for example "nomic-embed-text". */
    readonly model: string;
    /** Ollama's address as reached by the gateway container. */
    readonly apiBase: string;
}

/** Ensures a workspace's agent models are provisioned on the gateway before any agent call. */
export interface IAgentModelProvisioner {
    ensure(workspaceId: string, signal?: AbortSignal): Promise<void>;
}

/**
 * Keeps the LiteLLM gateway in step with each workspace's Configuration. Before an agent call it compares a
 * fingerprint of the saved provider, model and key against what the workspace was provisioned with, and
 * re-registers the models and re-mints the per-process virtual keys only when they differ. Concurrent calls
 * for the same workspace share one provisioning run.
 */
export class AgentModelProvisioner implements IAgentModelProvisioner {
    private readonly inFlight = new Map<string, Promise<void>>();

    constructor(
        private readonly registry: VirtualKeyRegistry,
        private readonly resolveConfiguration: AgentModelConfigurationResolver,
        private readonly embedding: EmbeddingModelSettings,
        /** Secret keying the fingerprint, so the stored value cannot be used to test guesses of a provider key. */
        private readonly fingerprintSecret: string,
    ) {}

    ensure(workspaceId: string, signal?: AbortSignal): Promise<void> {
        const running = this.inFlight.get(workspaceId);
        if (running) return running;
        const run = this.provisionIfChanged(workspaceId, signal).finally(() => this.inFlight.delete(workspaceId));
        this.inFlight.set(workspaceId, run);
        return run;
    }

    private async provisionIfChanged(workspaceId: string, signal?: AbortSignal): Promise<void> {
        const configuration = await this.resolveConfiguration(workspaceId);
        const prefix = LITELLM_PROVIDER_PREFIXES[configuration.providerId];
        if (!prefix) throw new AppError(422, AGENT_RUNTIME_ERRORS.unsupportedProvider);
        if (!this.embedding.model || !this.embedding.apiBase) throw new AppError(503, AGENT_RUNTIME_ERRORS.embeddingUnavailable);

        const models: WorkspaceModels = {
            chat: { providerModel: `${prefix}/${configuration.modelId}`, providerApiKey: configuration.apiKey },
            embedding: { providerModel: `${AGENT_EMBEDDING_PROVIDER_PREFIX}/${this.embedding.model}`, apiBase: this.embedding.apiBase },
        };
        const fingerprint = createHmac(AGENT_CONFIGURATION_FINGERPRINT.algorithm, this.fingerprintSecret)
            .update([configuration.providerId, configuration.modelId, configuration.apiKey, this.embedding.model, this.embedding.apiBase].join(AGENT_CONFIGURATION_FINGERPRINT.separator))
            .digest(AGENT_CONFIGURATION_FINGERPRINT.encoding);

        if (await this.registry.isProvisioned(workspaceId, fingerprint)) return;
        await this.registry.provisionWorkspace(workspaceId, models, fingerprint, signal);
    }
}
