import { AppError } from "../errors/app-error.js";
import { createScopedLogger } from "../logging/logger.js";
import type { SecretCipher } from "../security/secret-cipher.js";
import type { LiteLlmClient } from "./litellm.client.js";
import type { IVirtualKeyRepository } from "./virtual-key.repository.js";
import {
    AGENT_MODEL_KINDS,
    AGENT_RUNTIME_ERRORS,
    AGENT_RUNTIME_PROCESS_IDS,
    AGENT_RUNTIME_PROCESS_MODEL_KINDS,
    VIRTUAL_KEY_ALIAS_PREFIX,
    agentModelAlias,
    agentModelDeploymentId,
    type AgentModelKind,
    type AgentRuntimeProcessId,
} from "../../constants/agentRuntimeConstants.js";

const logger = createScopedLogger("virtual-key-registry");

export interface ConfiguredProviderModel {
    /** Provider-qualified model the gateway should call, for example "gemini/gemini-2.0-flash". */
    readonly providerModel: string;
    /** The real provider key, sent only to the gateway during registration. Omitted for keyless local models. */
    readonly providerApiKey?: string;
    readonly apiBase?: string;
}

/** The two models a workspace's processes call: its configured chat model and the managed embedding model. */
export type WorkspaceModels = Readonly<Record<AgentModelKind, ConfiguredProviderModel>>;

/** The context string binding an encrypted virtual key to its exact row, so a copied value cannot be decrypted. */
function keyContext(workspaceId: string, processId: string): string {
    return `litellm_virtual_keys:${workspaceId}:${processId}`;
}

/**
 * Registers a provider model on the LiteLLM gateway and mints one virtual key per runtime process for a
 * workspace. The real provider key reaches only the gateway; the minted virtual keys are encrypted at rest and
 * revealed solely to perform inference. Re-provisioning revokes and replaces prior keys so a rotated provider
 * key never leaves a stale virtual key usable.
 */
export class VirtualKeyRegistry {
    constructor(
        private readonly gateway: LiteLlmClient,
        private readonly repository: IVirtualKeyRepository,
        private readonly cipher: SecretCipher,
    ) {}

    /** True when every process has a key provisioned for exactly this configuration fingerprint. */
    async isProvisioned(workspaceId: string, fingerprint: string): Promise<boolean> {
        const records = await this.repository.listByWorkspace(workspaceId);
        return AGENT_RUNTIME_PROCESS_IDS.every(processId => records.some(record => record.processId === processId && record.configFingerprint === fingerprint));
    }

    /**
     * Registers the workspace's chat and embedding models on the gateway, replacing any earlier registration, and
     * (re)mints one virtual key per process scoped only to the model that process uses.
     */
    async provisionWorkspace(workspaceId: string, models: WorkspaceModels, fingerprint: string, signal?: AbortSignal): Promise<void> {
        for (const kind of Object.values(AGENT_MODEL_KINDS)) {
            const deploymentId = agentModelDeploymentId(workspaceId, kind);
            await this.gateway.deleteModel(deploymentId, signal);
            await this.gateway.registerModel({ deploymentId, modelAlias: agentModelAlias(workspaceId, kind), ...models[kind] }, signal);
        }
        for (const processId of AGENT_RUNTIME_PROCESS_IDS) {
            const modelAlias = agentModelAlias(workspaceId, AGENT_RUNTIME_PROCESS_MODEL_KINDS[processId]);
            await this.rotateProcessKey(workspaceId, processId, modelAlias, fingerprint, signal);
        }
        logger.info({ workspaceId, processes: AGENT_RUNTIME_PROCESS_IDS.length }, "Provisioned workspace models and virtual keys");
    }

    /** Returns the decrypted virtual key and model alias for a process, failing fast when not provisioned. */
    async resolveProcessKey(workspaceId: string, processId: AgentRuntimeProcessId): Promise<{ virtualKey: string; modelAlias: string }> {
        const record = await this.repository.findByProcess(workspaceId, processId);
        if (!record) throw new AppError(409, AGENT_RUNTIME_ERRORS.noConfiguredModel);
        const virtualKey = this.cipher.decrypt(record.encryptedKey, keyContext(workspaceId, processId));
        return { virtualKey, modelAlias: record.modelAlias };
    }

    /** Revokes every virtual key for a workspace on the gateway and removes the stored references. */
    async revokeWorkspace(workspaceId: string, signal?: AbortSignal): Promise<void> {
        for (const record of await this.repository.listByWorkspace(workspaceId)) {
            await this.gateway.deleteVirtualKey(record.gatewayKeyId, signal).catch(() => {
                // The gateway may have already discarded the key; the stored reference is still removed below.
                logger.warn({ workspaceId, processId: record.processId }, "Gateway key revocation did not confirm");
            });
            await this.repository.deleteByProcess(workspaceId, record.processId);
        }
        logger.info({ workspaceId }, "Revoked workspace virtual keys");
    }

    private async rotateProcessKey(workspaceId: string, processId: string, modelAlias: string, fingerprint: string, signal?: AbortSignal): Promise<void> {
        const existing = await this.repository.findByProcess(workspaceId, processId);
        if (existing) {
            await this.gateway.deleteVirtualKey(existing.gatewayKeyId, signal).catch(() => {
                logger.warn({ workspaceId, processId }, "Previous gateway key revocation did not confirm");
            });
        }
        const minted = await this.gateway.generateVirtualKey({
            allowedModels: [modelAlias],
            keyAlias: `${VIRTUAL_KEY_ALIAS_PREFIX}:${workspaceId}:${processId}`,
            metadata: { workspaceId, processId },
        }, signal);
        await this.repository.upsert({
            workspaceId,
            processId,
            gatewayKeyId: minted.keyId,
            modelAlias,
            encryptedKey: this.cipher.encrypt(minted.key, keyContext(workspaceId, processId)),
            configFingerprint: fingerprint,
        });
    }
}
