import { createHash } from "node:crypto";
import { z } from "zod";
import { AGENT_DATA_POLICY } from "../../../constants/agentPromptConstants.js";
import { AGENT_RUNTIME_PROCESSES } from "../../../constants/agentRuntimeConstants.js";
import { AppError } from "../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { IAgentModelProvisioner } from "../../../shared/agents/agent-model.provisioner.js";
import type { ChatCompletionRequest, LiteLlmClient } from "../../../shared/agents/litellm.client.js";
import type { VirtualKeyRegistry } from "../../../shared/agents/virtual-key.registry.js";
import type { PromptLoader } from "../../../shared/agents/prompts/loader.js";
import type { IWorkspaceWebSearch } from "../../../shared/agents/tools/workspace-web-search.js";
import type { IConnectionDefinitionRepository } from "../repositories/connection-definition.repository.js";
import { blueprintConfiguration, connectorBlueprintSchema, discoveryAdapter, normalizeBlueprint } from "./connector-blueprint.js";
import { structuredOutputShape } from "../../../shared/agents/structured-output-schema.js";
import { discoveryExcerpt } from "./connector-discovery-evidence.js";
import type { WebContext } from "../../../shared/agents/graphs/discussion-runtime.js";
import { assertDiscoveryIntent, connectionDiscoveryIntent, connectionDiscoverySearch } from "./connector-discovery-intent.js";

const resultSchema = z.object({ connectors: z.array(connectorBlueprintSchema).max(1), message: z.string().max(1000) }).strict();
const responseSchema = { name: "connector_discovery", schema: structuredOutputShape(z.toJSONSchema(resultSchema)) };
const logger = createScopedLogger("connector-discovery");
type DiscoveryResult = Awaited<ReturnType<ConnectorDiscoveryService["research"]>>;
function publicUrl(raw: string, documentation = false): string {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !documentation && url.hash || /^(?:localhost|.*\.localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|\[|0\.)/i.test(url.hostname)) throw new AppError(422, "Discovery requires public HTTPS documentation and endpoints.");
    if ([...url.searchParams.keys()].some(key => /token|secret|password|api.?key|credential/i.test(key))) throw new AppError(422, "Discovered URLs must not contain credentials.");
    return url.href;
}

/** Workspace-owned discovery uses its configured model and search key; no code generation or automatic connection. */
export class ConnectorDiscoveryService {
    private readonly cache = new Map<string, { expires: number; value: DiscoveryResult }>();
    private readonly evidenceCache = new Map<string, { expires: number; sources: WebContext[] }>();
    private readonly running = new Map<string, { key: string; controller: AbortController; work: Promise<DiscoveryResult> }>();
    private readonly requests = new Map<string, number[]>();
    constructor(private readonly definitions: IConnectionDefinitionRepository, private readonly web: IWorkspaceWebSearch,
        private readonly models: IAgentModelProvisioner, private readonly gateway: LiteLlmClient,
        private readonly keys: VirtualKeyRegistry, private readonly prompts: PromptLoader) {}

    async discover(workspaceId: string, query: string): Promise<DiscoveryResult> {
        await this.web.assertConfigured(workspaceId);
        const key = `${workspaceId}:${query.trim().toLowerCase()}`;
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) return cached.value;
        const active = this.running.get(workspaceId);
        if (active?.key === key) return active.work;
        const recent = (this.requests.get(workspaceId) ?? []).filter(at => at > Date.now() - 60_000);
        if (recent.length >= 8 || this.running.size >= 8 && !active) throw new AppError(429, "Connector discovery is busy. Wait a moment before searching again.");
        this.requests.set(workspaceId, [...recent, Date.now()]);
        if (this.requests.size > 256) this.requests.delete(this.requests.keys().next().value!);
        active?.controller.abort();
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]);
        const work = this.research(workspaceId, query, signal).then(value => {
            this.cache.set(key, { expires: Date.now() + 10 * 60_000, value });
            while (this.cache.size > 128) this.cache.delete(this.cache.keys().next().value!);
            return value;
        }).finally(() => { if (this.running.get(workspaceId)?.key === key) this.running.delete(workspaceId); });
        this.running.set(workspaceId, { key, controller, work });
        return work;
    }

    async research(workspaceId: string, query: string, signal: AbortSignal) {
        const intent = connectionDiscoveryIntent(query);
        const evidenceKey = `${workspaceId}:${query.trim().toLowerCase()}`;
        const previous = this.evidenceCache.get(evidenceKey);
        let evidence = previous && previous.expires > Date.now() ? previous.sources : undefined;
        if (!evidence) {
            const sources = await this.web.search(workspaceId, connectionDiscoverySearch(query, intent), 5, { signal, deep: true, raw: true });
            signal.throwIfAborted();
            evidence = sources.flatMap(source => {
                try { publicUrl(source.url, true); return [{ ...source, snippet: discoveryExcerpt(source.snippet) }]; } catch { return []; }
            });
            if (evidence.length) {
                this.evidenceCache.set(evidenceKey, { expires: Date.now() + 10 * 60_000, sources: evidence });
                while (this.evidenceCache.size > 128) this.evidenceCache.delete(this.evidenceCache.keys().next().value!);
            }
        }
        if (!evidence.length) return { entries: [], message: "No public documentation was found for this provider. Try its full product name.", sources: [] };
        await this.models.ensure(workspaceId, signal);
        const { virtualKey, modelAlias } = await this.keys.resolveProcessKey(workspaceId, AGENT_RUNTIME_PROCESSES.orchestration);
        const limits = await this.gateway.modelContextLimits(modelAlias, signal);
        const request: ChatCompletionRequest = { model: modelAlias, purpose: "planning", reasoningEffort: "medium", maxTokens: Math.min(6000, limits.output),
            responseSchema,
            messages: [{ role: "system", content: `${AGENT_DATA_POLICY}\n${await this.prompts.renderAgentPrompt("connector-discovery")}` },
                { role: "user", content: JSON.stringify({ request: query, intent, evidence }) }] };
        const inputTokens = await this.gateway.countTokens(request, signal);
        if (inputTokens + request.maxTokens! > limits.input) throw new AppError(422, "The provider documentation exceeds the configured model's context. Refine the provider name or select a larger-context agent model.");
        const result = await this.gateway.chatCompletion(virtualKey, request, signal);
        let value: unknown;
        try { value = JSON.parse(result.content); } catch { throw new AppError(502, "Connector discovery returned invalid configuration metadata. No connection was created.", undefined, true); }
        const parsed = resultSchema.safeParse(value);
        if (!parsed.success) throw new AppError(502, "Connector discovery returned an invalid form definition. No connection was created.", undefined, true);
        const records = [];
        for (const candidate of parsed.data.connectors) {
            const blueprint = normalizeBlueprint(candidate);
            signal.throwIfAborted();
            assertDiscoveryIntent(intent, blueprint.protocol);
            const doc = evidence.find(source => source.url === blueprint.documentationUrl);
            if (!doc) throw new AppError(422, "The discovered form cited documentation that was not found by the search.");
            if (blueprint.protocol === "github-repository" && new URL(doc.url).hostname !== "docs.github.com") {
                throw new AppError(422, "GitHub repository configuration must be grounded in GitHub's official documentation.");
            }
            if (blueprint.endpoint) {
                publicUrl(blueprint.endpoint);
                if (!evidence.some(source => source.snippet.includes(blueprint.endpoint!))) throw new AppError(422, "The provider endpoint could not be grounded in its documentation. Refine the search; no endpoint was guessed.");
            }
            for (const field of blueprint.fields) {
                if (field.location === "property" && ["endpoint", "apiUrl"].includes(field.target) && field.defaultValue !== null) {
                    publicUrl(field.defaultValue);
                    if (!evidence.some(source => source.snippet.includes(field.defaultValue!))) throw new AppError(422, "The default service endpoint was not found in the retrieved documentation.");
                }
                if (field.location === "header" && field.defaultValue !== null && !evidence.some(source => source.snippet.includes(field.defaultValue!))) {
                    field.defaultValue = null;
                }
            }
            const metadata = { blueprint, sources: [{ title: doc.title, url: doc.url }], discoveredAt: new Date().toISOString() };
            const configSchema = blueprintConfiguration(metadata);
            const fingerprint = createHash("sha256").update(JSON.stringify({ blueprint })).digest("hex").slice(0, 32);
            const record = await this.definitions.createDiscovered({ workspaceId, code: `discovered.${workspaceId}.${fingerprint}`, name: blueprint.name,
                description: blueprint.description, adapterKey: discoveryAdapter(blueprint.protocol), configSchema, isEnabled: true });
            const { configSchema: _, ...entry } = record;
            records.push({ ...entry, iconKey: String(configSchema["x-icon"]), discovery: { sources: metadata.sources, instructions: blueprint.instructions } });
        }
        logger.info({ workspaceId, resultCount: records.length, inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }, "Connector discovery completed");
        return { entries: records, message: parsed.data.message, sources: evidence.map(({ title, url }) => ({ title, url })) };
    }
}
