import test, { afterEach, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildAgentsConfig, loadAgentsConfig, writeAgentsConfig, type AgentProcessConfig } from "../../src/shared/agents/agents-config.js";
import { AGENT_RUNTIME_PROCESS_IDS, type AgentRuntimeProcessId } from "../../src/constants/agentRuntimeConstants.js";
import { AGENTS_CONFIG_FILE } from "../../src/constants/agentsConfigConstants.js";

const WORKSPACE = "22222222-2222-2222-2222-222222222222";

/** A complete mapping assigning every process the same single configured model, as the current design requires. */
function completeMapping(): Record<AgentRuntimeProcessId, AgentProcessConfig> {
    const mapping = {} as Record<AgentRuntimeProcessId, AgentProcessConfig>;
    for (const processId of AGENT_RUNTIME_PROCESS_IDS) mapping[processId] = { modelAlias: "openai-gpt-4o-abc123", gatewayKeyId: `key-${processId}` };
    return mapping;
}

let directory: string;
beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "detqel-agents-config-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("agents.config.json generation and loading", () => {
    test("building a config requires every runtime process to be mapped", () => {
        const partial = completeMapping();
        delete (partial as Record<string, unknown>)[AGENT_RUNTIME_PROCESS_IDS[0]];
        assert.throws(() => buildAgentsConfig(WORKSPACE, partial), /missing one or more required processes/);
    });

    test("a built config maps every process to the single configured model", () => {
        const config = buildAgentsConfig(WORKSPACE, completeMapping());
        assert.equal(config.workspaceId, WORKSPACE);
        assert.equal(Object.keys(config.processes).length, AGENT_RUNTIME_PROCESS_IDS.length);
        const aliases = new Set(Object.values(config.processes).map(entry => entry.modelAlias));
        assert.equal(aliases.size, 1, "all processes share the one configured model for now");
    });

    test("write then load round-trips the configuration", async () => {
        const config = buildAgentsConfig(WORKSPACE, completeMapping());
        await writeAgentsConfig(directory, config);
        const loaded = await loadAgentsConfig(directory);
        assert.deepEqual(loaded, config);
    });

    test("loading a missing configuration fails fast", async () => {
        await assert.rejects(() => loadAgentsConfig(directory), /has not been generated yet/);
    });

    test("loading malformed JSON fails fast", async () => {
        await writeFile(path.join(directory, AGENTS_CONFIG_FILE), "{ not json");
        await assert.rejects(() => loadAgentsConfig(directory), /malformed/);
    });

    test("loading a config missing a process fails fast", async () => {
        const config = buildAgentsConfig(WORKSPACE, completeMapping());
        const broken = { ...config, processes: { ...config.processes } } as { processes: Record<string, unknown> };
        delete broken.processes[AGENT_RUNTIME_PROCESS_IDS[0]];
        await writeFile(path.join(directory, AGENTS_CONFIG_FILE), JSON.stringify(broken));
        await assert.rejects(() => loadAgentsConfig(directory), /missing one or more required processes/);
    });

    test("loading a config from an unsupported version fails fast", async () => {
        const config = buildAgentsConfig(WORKSPACE, completeMapping());
        await writeFile(path.join(directory, AGENTS_CONFIG_FILE), JSON.stringify({ ...config, version: 999 }));
        await assert.rejects(() => loadAgentsConfig(directory), /unsupported version/);
    });

    test("the written file is pretty-printed JSON containing only key ids, never key values", async () => {
        await writeAgentsConfig(directory, buildAgentsConfig(WORKSPACE, completeMapping()));
        const raw = await readFile(path.join(directory, AGENTS_CONFIG_FILE), "utf8");
        assert.ok(raw.includes("\n"), "config should be human-readable");
        assert.ok(!raw.includes("sk-virtual"), "no virtual key secret should ever appear in the config file");
    });
});
