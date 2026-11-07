import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { AgentModelProvisioner, type AgentModelConfiguration } from "../../src/shared/agents/agent-model.provisioner.js";
import type { VirtualKeyRegistry, WorkspaceModels } from "../../src/shared/agents/virtual-key.registry.js";
import { AppError } from "../../src/shared/errors/app-error.js";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const EMBEDDING = { model: "nomic-embed-text", apiBase: "http://detqel-kin-ollama:11434" };
const SECRET = Buffer.alloc(32, 9).toString("base64");

/** A registry double that remembers the fingerprint it was provisioned with, like the real one does. */
function fakeRegistry() {
    const provisioned: Array<{ models: WorkspaceModels; fingerprint: string }> = [];
    let current: string | null = null;
    const registry = {
        async isProvisioned(_workspaceId: string, fingerprint: string) { return current === fingerprint; },
        async provisionWorkspace(_workspaceId: string, models: WorkspaceModels, fingerprint: string) {
            await new Promise(resolve => setTimeout(resolve, 5));
            provisioned.push({ models, fingerprint });
            current = fingerprint;
        },
    } as unknown as VirtualKeyRegistry;
    return { registry, provisioned };
}

const configuration = (overrides: Partial<AgentModelConfiguration> = {}): AgentModelConfiguration => ({
    providerId: "google", modelId: "gemini-2.0-flash", apiKey: "AIza-real-provider-key", ...overrides,
});

describe("AgentModelProvisioner", () => {
    test("maps the Configuration provider to its LiteLLM model and adds the managed embedding model", async () => {
        const { registry, provisioned } = fakeRegistry();
        const provisioner = new AgentModelProvisioner(registry, async () => configuration(), EMBEDDING, SECRET);
        await provisioner.ensure(WORKSPACE);
        assert.equal(provisioned.length, 1);
        assert.deepEqual(provisioned[0].models.chat, { providerModel: "gemini/gemini-2.0-flash", providerApiKey: "AIza-real-provider-key" });
        assert.deepEqual(provisioned[0].models.embedding, { providerModel: "ollama/nomic-embed-text", apiBase: EMBEDDING.apiBase });
    });

    test("does nothing on the gateway when the configuration is unchanged", async () => {
        const { registry, provisioned } = fakeRegistry();
        const provisioner = new AgentModelProvisioner(registry, async () => configuration(), EMBEDDING, SECRET);
        await provisioner.ensure(WORKSPACE);
        await provisioner.ensure(WORKSPACE);
        assert.equal(provisioned.length, 1);
    });

    test("re-provisions when the model or the key changes", async () => {
        const { registry, provisioned } = fakeRegistry();
        let current = configuration();
        const provisioner = new AgentModelProvisioner(registry, async () => current, EMBEDDING, SECRET);
        await provisioner.ensure(WORKSPACE);
        current = configuration({ modelId: "gemini-2.5-pro" });
        await provisioner.ensure(WORKSPACE);
        current = configuration({ modelId: "gemini-2.5-pro", apiKey: "AIza-rotated-key" });
        await provisioner.ensure(WORKSPACE);
        assert.equal(provisioned.length, 3);
        assert.equal(new Set(provisioned.map(entry => entry.fingerprint)).size, 3);
    });

    test("the fingerprint never contains the provider key", async () => {
        const { registry, provisioned } = fakeRegistry();
        const provisioner = new AgentModelProvisioner(registry, async () => configuration(), EMBEDDING, SECRET);
        await provisioner.ensure(WORKSPACE);
        assert.ok(!provisioned[0].fingerprint.includes("AIza-real-provider-key"));
        assert.match(provisioned[0].fingerprint, /^[a-f0-9]{64}$/);
    });

    test("concurrent calls for one workspace share a single provisioning run", async () => {
        const { registry, provisioned } = fakeRegistry();
        const provisioner = new AgentModelProvisioner(registry, async () => configuration(), EMBEDDING, SECRET);
        await Promise.all([provisioner.ensure(WORKSPACE), provisioner.ensure(WORKSPACE), provisioner.ensure(WORKSPACE)]);
        assert.equal(provisioned.length, 1);
    });

    test("an unsupported provider fails with an actionable message", async () => {
        const { registry, provisioned } = fakeRegistry();
        const provisioner = new AgentModelProvisioner(registry, async () => configuration({ providerId: "custom" }), EMBEDDING, SECRET);
        await assert.rejects(() => provisioner.ensure(WORKSPACE), /cannot be used by agents yet/);
        assert.equal(provisioned.length, 0);
    });

    test("an incomplete configuration error from Configuration reaches the caller unchanged", async () => {
        const { registry } = fakeRegistry();
        const provisioner = new AgentModelProvisioner(registry, async () => { throw new AppError(409, "No AI model is configured."); }, EMBEDDING, SECRET);
        await assert.rejects(() => provisioner.ensure(WORKSPACE), /No AI model is configured/);
    });

    test("a failed run does not block a later retry", async () => {
        const { registry, provisioned } = fakeRegistry();
        let fail = true;
        const provisioner = new AgentModelProvisioner(registry, async () => { if (fail) throw new AppError(502, "gateway down"); return configuration(); }, EMBEDDING, SECRET);
        await assert.rejects(() => provisioner.ensure(WORKSPACE), /gateway down/);
        fail = false;
        await provisioner.ensure(WORKSPACE);
        assert.equal(provisioned.length, 1);
    });
});
