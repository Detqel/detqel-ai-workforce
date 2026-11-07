import test, { beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { SecretCipher } from "../../src/shared/security/secret-cipher.js";
import { VirtualKeyRegistry, type WorkspaceModels } from "../../src/shared/agents/virtual-key.registry.js";
import type { IVirtualKeyRepository, LitellmVirtualKey, NewLitellmVirtualKey } from "../../src/shared/agents/virtual-key.repository.js";
import type { LiteLlmClient } from "../../src/shared/agents/litellm.client.js";
import {
    AGENT_RUNTIME_PROCESSES,
    AGENT_RUNTIME_PROCESS_IDS,
    agentModelAlias,
    agentModelDeploymentId,
} from "../../src/constants/agentRuntimeConstants.js";

const MASTER_KEY = Buffer.alloc(32, 7).toString("base64");

/** Minimal in-memory virtual-key store keyed by workspace+process, matching the repository contract. */
class MemoryVirtualKeyRepository implements IVirtualKeyRepository {
    readonly rows = new Map<string, LitellmVirtualKey>();
    private sequence = 0;
    private key(workspaceId: string, processId: string): string { return `${workspaceId}:${processId}`; }

    async listByWorkspace(workspaceId: string): Promise<LitellmVirtualKey[]> {
        return [...this.rows.values()].filter(row => row.workspaceId === workspaceId);
    }
    async findByProcess(workspaceId: string, processId: string): Promise<LitellmVirtualKey | null> {
        return this.rows.get(this.key(workspaceId, processId)) ?? null;
    }
    async upsert(record: NewLitellmVirtualKey): Promise<LitellmVirtualKey> {
        const existing = this.rows.get(this.key(record.workspaceId, record.processId));
        const row: LitellmVirtualKey = {
            id: existing?.id ?? `row-${++this.sequence}`,
            workspaceId: record.workspaceId,
            processId: record.processId,
            gatewayKeyId: record.gatewayKeyId,
            modelAlias: record.modelAlias,
            encryptedKey: record.encryptedKey,
            configFingerprint: record.configFingerprint ?? null,
            createdAt: existing?.createdAt ?? new Date(),
            updatedAt: new Date(),
        };
        this.rows.set(this.key(record.workspaceId, record.processId), row);
        return row;
    }
    async deleteByProcess(workspaceId: string, processId: string): Promise<boolean> {
        return this.rows.delete(this.key(workspaceId, processId));
    }
}

interface GatewayCall { type: string; payload: unknown }

/** Records gateway interactions and hands back scripted minted keys so the registry can be tested in isolation. */
function spyGateway() {
    const calls: GatewayCall[] = [];
    let counter = 0;
    const gateway = {
        async registerModel(params: { modelAlias: string }) { calls.push({ type: "registerModel", payload: params }); return params.modelAlias; },
        async deleteModel(deploymentId: string) { calls.push({ type: "deleteModel", payload: deploymentId }); },
        async generateVirtualKey(params: unknown) { calls.push({ type: "generateVirtualKey", payload: params }); counter++; return { key: `sk-virtual-${counter}`, keyId: `key-id-${counter}` }; },
        async deleteVirtualKey(keyId: string) { calls.push({ type: "deleteVirtualKey", payload: keyId }); },
    } as unknown as LiteLlmClient;
    return { gateway, calls };
}

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const PROVIDER_KEY = "sk-provider-REAL-secret";
const MODELS: WorkspaceModels = {
    chat: { providerModel: "gemini/gemini-2.0-flash", providerApiKey: PROVIDER_KEY },
    embedding: { providerModel: "ollama/nomic-embed-text", apiBase: "http://detqel-kin-ollama:11434" },
};
const FINGERPRINT = "fingerprint-a";

let repository: MemoryVirtualKeyRepository;
let cipher: SecretCipher;
beforeEach(() => {
    repository = new MemoryVirtualKeyRepository();
    cipher = new SecretCipher(MASTER_KEY, "litellm-virtual-keys");
});

describe("VirtualKeyRegistry", () => {
    test("provisioning registers the chat and embedding models and mints a key for every process", async () => {
        const { gateway, calls } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);

        const registered = calls.filter(call => call.type === "registerModel").map(call => call.payload as { deploymentId: string; modelAlias: string; providerModel: string });
        assert.deepEqual(registered.map(model => model.providerModel).sort(), ["gemini/gemini-2.0-flash", "ollama/nomic-embed-text"]);
        assert.deepEqual(registered.map(model => model.deploymentId).sort(), [agentModelDeploymentId(WORKSPACE, "chat"), agentModelDeploymentId(WORKSPACE, "embedding")].sort());
        assert.equal(calls.filter(call => call.type === "generateVirtualKey").length, AGENT_RUNTIME_PROCESS_IDS.length);
        assert.equal((await repository.listByWorkspace(WORKSPACE)).length, AGENT_RUNTIME_PROCESS_IDS.length);
    });

    test("each process key is scoped to the one model it uses", async () => {
        const { gateway, calls } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);

        const minted = calls.filter(call => call.type === "generateVirtualKey").map(call => call.payload as { allowedModels: string[]; metadata: { processId: string } });
        for (const request of minted) {
            const expected = request.metadata.processId === AGENT_RUNTIME_PROCESSES.embeddings ? agentModelAlias(WORKSPACE, "embedding") : agentModelAlias(WORKSPACE, "chat");
            assert.deepEqual(request.allowedModels, [expected], `${request.metadata.processId} must only reach ${expected}`);
        }
        assert.equal((await registry.resolveProcessKey(WORKSPACE, AGENT_RUNTIME_PROCESSES.embeddings)).modelAlias, agentModelAlias(WORKSPACE, "embedding"));
        assert.equal((await registry.resolveProcessKey(WORKSPACE, AGENT_RUNTIME_PROCESSES.orchestration)).modelAlias, agentModelAlias(WORKSPACE, "chat"));
    });

    test("re-provisioning replaces the earlier model deployments instead of adding more", async () => {
        const { gateway, calls } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);
        await registry.provisionWorkspace(WORKSPACE, MODELS, "fingerprint-b");

        // Every registration is preceded by removing the same deployment id.
        const sequence = calls.filter(call => call.type === "deleteModel" || call.type === "registerModel");
        for (let index = 0; index < sequence.length; index += 2) {
            assert.equal(sequence[index].type, "deleteModel");
            assert.equal(sequence[index].payload, (sequence[index + 1].payload as { deploymentId: string }).deploymentId);
        }
    });

    test("isProvisioned is true only for the fingerprint the keys were minted with", async () => {
        const { gateway } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        assert.equal(await registry.isProvisioned(WORKSPACE, FINGERPRINT), false, "nothing provisioned yet");
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);
        assert.equal(await registry.isProvisioned(WORKSPACE, FINGERPRINT), true);
        assert.equal(await registry.isProvisioned(WORKSPACE, "fingerprint-b"), false, "a changed configuration needs provisioning");
    });

    test("the real provider key reaches the gateway but is never stored in the registry", async () => {
        const { gateway } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);

        for (const row of await repository.listByWorkspace(WORKSPACE)) {
            assert.ok(!row.encryptedKey.includes(PROVIDER_KEY), "provider key must not appear in stored ciphertext");
            assert.ok(!(row.configFingerprint ?? "").includes(PROVIDER_KEY), "provider key must not appear in the fingerprint");
            const decrypted = cipher.decrypt(row.encryptedKey, `litellm_virtual_keys:${WORKSPACE}:${row.processId}`);
            assert.ok(decrypted.startsWith("sk-virtual-"), "stored value must be the minted virtual key, not the provider key");
        }
    });

    test("an encrypted key cannot be decrypted under another process context", async () => {
        const { gateway } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);
        const ragRow = await repository.findByProcess(WORKSPACE, AGENT_RUNTIME_PROCESSES.rag);
        assert.ok(ragRow);
        assert.throws(
            () => cipher.decrypt(ragRow.encryptedKey, `litellm_virtual_keys:${WORKSPACE}:${AGENT_RUNTIME_PROCESSES.orchestration}`),
            /could not be decrypted/,
        );
    });

    test("re-provisioning revokes the previous gateway keys before minting replacements", async () => {
        const { gateway, calls } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);
        const firstKeyIds = (await repository.listByWorkspace(WORKSPACE)).map(row => row.gatewayKeyId);

        await registry.provisionWorkspace(WORKSPACE, MODELS, "fingerprint-b");
        const revoked = calls.filter(call => call.type === "deleteVirtualKey").map(call => call.payload);
        for (const id of firstKeyIds) assert.ok(revoked.includes(id), `previous key ${id} should have been revoked`);
        assert.equal((await repository.listByWorkspace(WORKSPACE)).length, AGENT_RUNTIME_PROCESS_IDS.length);
    });

    test("resolving before provisioning fails fast with a configuration message", async () => {
        const { gateway } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await assert.rejects(() => registry.resolveProcessKey(WORKSPACE, AGENT_RUNTIME_PROCESSES.orchestration), /No AI model is configured/);
    });

    test("revoking a workspace clears every stored key and calls the gateway for each", async () => {
        const { gateway, calls } = spyGateway();
        const registry = new VirtualKeyRegistry(gateway, repository, cipher);
        await registry.provisionWorkspace(WORKSPACE, MODELS, FINGERPRINT);
        const before = calls.filter(call => call.type === "deleteVirtualKey").length;
        await registry.revokeWorkspace(WORKSPACE);
        assert.equal((await repository.listByWorkspace(WORKSPACE)).length, 0);
        assert.equal(calls.filter(call => call.type === "deleteVirtualKey").length - before, AGENT_RUNTIME_PROCESS_IDS.length);
    });
});
