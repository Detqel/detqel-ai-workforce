import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { LiteLlmClient } from "../../src/shared/agents/litellm.client.js";

const GATEWAY = { baseUrl: "http://127.0.0.1:50999", masterKey: "sk-master-test-key" };

interface Captured {
    url: string;
    method: string;
    authorization: string | null;
    body: unknown;
}

/** Replaces global fetch with a scripted responder and records every request for assertions. */
function stubFetch(responder: (captured: Captured) => { status: number; json?: unknown; text?: string; headers?: Record<string, string> }): { calls: Captured[] } {
    const calls: Captured[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        const captured: Captured = {
            url: String(input),
            method: init?.method ?? "GET",
            authorization: headers.get("Authorization"),
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
        };
        calls.push(captured);
        const result = responder(captured);
        const payload = result.text ?? (result.json !== undefined ? JSON.stringify(result.json) : "");
        return new Response(payload, { status: result.status, headers: result.headers });
    }) as typeof fetch;
    return { calls };
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("LiteLlmClient gateway wrapper", () => {
    test("an unconfigured gateway fails fast at the point of use", async () => {
        await assert.rejects(() => new LiteLlmClient({ baseUrl: "", masterKey: "x" }).registerModel({ deploymentId: "d", modelAlias: "a", providerModel: "openai/gpt", providerApiKey: "k" }), /gateway is not configured/);
        await assert.rejects(() => new LiteLlmClient({ baseUrl: GATEWAY.baseUrl, masterKey: "" }).chatCompletion("k", { model: "m", messages: [{ role: "user", content: "x" }] }), /gateway is not configured/);
    });

    test("administrative calls use the master key and never the virtual key", async () => {
        // Field names match a live LiteLLM /key/generate response; the hashed token is what revokes the key.
        const { calls } = stubFetch(() => ({ status: 200, json: { key: "sk-virtual-abc", token: "hashed-token-1", token_id: "hashed-token-1", key_name: "sk-...-abc" } }));
        const client = new LiteLlmClient(GATEWAY);
        const minted = await client.generateVirtualKey({ allowedModels: ["openai-gpt-4o"], keyAlias: "process:rag" });
        assert.equal(minted.key, "sk-virtual-abc");
        assert.equal(minted.keyId, "hashed-token-1");
        assert.equal(calls[0].authorization, `Bearer ${GATEWAY.masterKey}`);
        assert.equal(calls[0].method, "POST");
        assert.ok(String(calls[0].url).endsWith("/key/generate"));
    });

    test("a virtual key scoped to no models is refused before any network call", async () => {
        const { calls } = stubFetch(() => ({ status: 200, json: {} }));
        const client = new LiteLlmClient(GATEWAY);
        await assert.rejects(() => client.generateVirtualKey({ allowedModels: [], keyAlias: "process:rag" }), /at least one model/);
        assert.equal(calls.length, 0, "no request should be sent for an invalid key request");
    });

    test("registering a model forwards the provider key to the gateway only, under the chosen deployment id", async () => {
        const { calls } = stubFetch(() => ({ status: 200, json: {} }));
        const client = new LiteLlmClient(GATEWAY);
        const alias = await client.registerModel({ deploymentId: "dep-1", modelAlias: "openai-gpt-4o", providerModel: "openai/gpt-4o", providerApiKey: "sk-provider-secret" });
        assert.equal(alias, "openai-gpt-4o");
        const sent = calls[0].body as { litellm_params: { api_key: string; model: string }; model_info: { id: string } };
        assert.equal(sent.litellm_params.api_key, "sk-provider-secret");
        assert.equal(sent.litellm_params.model, "openai/gpt-4o");
        assert.equal(sent.model_info.id, "dep-1");
    });

    test("a keyless local model is registered without an api_key", async () => {
        const { calls } = stubFetch(() => ({ status: 200, json: {} }));
        const client = new LiteLlmClient(GATEWAY);
        await client.registerModel({ deploymentId: "dep-2", modelAlias: "embed", providerModel: "ollama/nomic-embed-text", apiBase: "http://ollama:11434" });
        const sent = calls[0].body as { litellm_params: Record<string, unknown> };
        assert.equal("api_key" in sent.litellm_params, false);
        assert.equal(sent.litellm_params.api_base, "http://ollama:11434");
    });

    test("removing a model that does not exist does not throw", async () => {
        const { calls } = stubFetch(() => ({ status: 400, text: "Model with id=missing not found in db" }));
        const client = new LiteLlmClient(GATEWAY);
        await client.deleteModel("missing");
        assert.deepEqual(calls[0].body, { id: "missing" });
    });

    test("chat completion uses the supplied virtual key and returns content plus usage", async () => {
        const { calls } = stubFetch(() => ({ status: 200, json: { choices: [{ message: { content: "Hello." } }], usage: { total_tokens: 42 } } }));
        const client = new LiteLlmClient(GATEWAY);
        const result = await client.chatCompletion("sk-virtual-xyz", { model: "openai-gpt-4o", messages: [{ role: "user", content: "Hi" }] });
        assert.equal(result.content, "Hello.");
        assert.equal(result.tokensUsed, 42);
        assert.equal(calls[0].authorization, "Bearer sk-virtual-xyz");
        assert.ok(String(calls[0].url).endsWith("/v1/chat/completions"));
    });

    test("chat completion reports input, output, and cached tokens and the gateway's cost header", async () => {
        stubFetch(() => ({
            status: 200,
            headers: { "x-litellm-response-cost": "0.0000472" },
            json: { choices: [{ message: { content: "Hi." } }], usage: { prompt_tokens: 120, completion_tokens: 9, total_tokens: 129, prompt_tokens_details: { cached_tokens: 64 } } },
        }));
        const result = await new LiteLlmClient(GATEWAY).chatCompletion("sk-virtual-xyz", { model: "m", messages: [{ role: "user", content: "Hi" }] });
        assert.deepEqual(result.usage, { inputTokens: 120, outputTokens: 9, cachedTokens: 64, costUsd: 0.0000472 });
    });

    test("missing or malformed usage and cost read as zero", async () => {
        stubFetch(() => ({ status: 200, headers: { "x-litellm-response-cost": "not-a-number" }, json: { choices: [{ message: { content: "Hi." } }] } }));
        const result = await new LiteLlmClient(GATEWAY).chatCompletion("sk-virtual-xyz", { model: "m", messages: [{ role: "user", content: "Hi" }] });
        assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
    });

    test("reasoning effort, JSON output, and token limits are forwarded, and unsupported params are dropped by the gateway", async () => {
        const { calls } = stubFetch(() => ({ status: 200, json: { choices: [{ message: { content: "{}" } }] } }));
        await new LiteLlmClient(GATEWAY).chatCompletion("sk-virtual-xyz", { model: "m", messages: [{ role: "user", content: "Hi" }], reasoningEffort: "minimal", responseFormatJson: true, maxTokens: 600 });
        const sent = calls[0].body as Record<string, unknown>;
        assert.equal(sent.reasoning_effort, "minimal");
        assert.deepEqual(sent.response_format, { type: "json_object" });
        assert.equal(sent.max_tokens, 600);
        assert.equal(sent.drop_params, true);
    });

    /** Serves a streamed completion in deliberately awkward pieces: lines split across network chunks. */
    function streamFetch(pieces: string[], captured: { body?: Record<string, unknown> } = {}) {
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
            captured.body = JSON.parse(String(init?.body));
            const encoder = new TextEncoder();
            const body = new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const piece of pieces) controller.enqueue(encoder.encode(piece));
                    controller.close();
                },
            });
            return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
        }) as typeof fetch;
        return captured;
    }

    test("a streamed completion passes each piece of text on as it arrives and reads usage and cost from the final chunk", async () => {
        const line = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
        const sse = [
            line({ choices: [{ delta: { content: "Hel" } }], usage: null }),
            line({ choices: [{ delta: { content: "lo." } }], usage: null }),
            line({ choices: [{ delta: {}, finish_reason: "stop" }] }),
            line({ choices: [], usage: { prompt_tokens: 11, completion_tokens: 66, total_tokens: 77, cost: 0.00025575, prompt_tokens_details: { cached_tokens: 4 } } }),
            "data: [DONE]\n\n",
        ].join("");
        // Split mid-line and mid-JSON, as the network may deliver it.
        const captured = streamFetch([sse.slice(0, 17), sse.slice(17, 90), sse.slice(90)]);
        const pieces: string[] = [];
        const result = await new LiteLlmClient(GATEWAY).chatCompletionStream("sk-virtual-xyz", { model: "m", messages: [{ role: "user", content: "Hi" }], reasoningEffort: "low" }, text => pieces.push(text));
        assert.deepEqual(pieces, ["Hel", "lo."]);
        assert.equal(result.content, "Hello.");
        assert.deepEqual(result.usage, { inputTokens: 11, outputTokens: 66, cachedTokens: 4, costUsd: 0.00025575 });
        assert.equal(captured.body?.stream, true);
        assert.deepEqual(captured.body?.stream_options, { include_usage: true });
        assert.equal(captured.body?.reasoning_effort, "low");
    });

    test("an error reported mid-stream fails the call with a clean message", async () => {
        streamFetch([`data: ${JSON.stringify({ choices: [{ delta: { content: "par" } }] })}\n\n`, `data: ${JSON.stringify({ error: { message: "sk-leaked provider detail" } })}\n\n`]);
        await assert.rejects(
            () => new LiteLlmClient(GATEWAY).chatCompletionStream("sk-virtual-xyz", { model: "m", messages: [{ role: "user", content: "Hi" }] }, () => {}),
            (error: Error) => {
                assert.match(error.message, /could not complete the model request/);
                assert.ok(!error.message.includes("sk-leaked"));
                return true;
            },
        );
    });

    test("a stream that stops sending usage reads as zero usage rather than failing", async () => {
        streamFetch([`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`]);
        const result = await new LiteLlmClient(GATEWAY).chatCompletionStream("k", { model: "m", messages: [{ role: "user", content: "x" }] }, () => {});
        assert.equal(result.content, "ok");
        assert.deepEqual(result.usage, { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0 });
    });

    test("a caller that stops waiting aborts the stream without it being reported as a gateway failure", async () => {
        const controller = new AbortController();
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
            const body = new ReadableStream<Uint8Array>({
                start(stream) {
                    stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`));
                    init?.signal?.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")));
                },
            });
            return new Response(body, { status: 200 });
        }) as typeof fetch;
        const pending = new LiteLlmClient(GATEWAY).chatCompletionStream("k", { model: "m", messages: [{ role: "user", content: "x" }] }, () => controller.abort(), controller.signal);
        await assert.rejects(pending, (error: Error) => error.name === "AbortError");
    });

    test("embeddings return one vector per input and reject a shape mismatch", async () => {
        stubFetch(() => ({ status: 200, json: { data: [{ embedding: [0.1, 0.2] }, { embedding: [0.3, 0.4] }], usage: { total_tokens: 8 } } }));
        const client = new LiteLlmClient(GATEWAY);
        const result = await client.embeddings("sk-virtual-xyz", { model: "ollama-embed", input: ["a", "b"] });
        assert.deepEqual(result.vectors, [[0.1, 0.2], [0.3, 0.4]]);

        stubFetch(() => ({ status: 200, json: { data: [{ embedding: [0.1] }], usage: {} } }));
        await assert.rejects(() => client.embeddings("sk-virtual-xyz", { model: "ollama-embed", input: ["a", "b"] }), /embeddings/);
    });

    test("an error status surfaces a clean message and never the response body", async () => {
        stubFetch(() => ({ status: 401, text: "sk-leaked-secret-in-body" }));
        const client = new LiteLlmClient(GATEWAY);
        await assert.rejects(
            () => client.chatCompletion("sk-virtual-xyz", { model: "m", messages: [{ role: "user", content: "x" }] }),
            (error: Error) => {
                assert.ok(!error.message.includes("sk-leaked-secret-in-body"), "the raw gateway body must not reach the error message");
                return true;
            },
        );
    });

    test("isHealthy reports false for an unhealthy gateway instead of throwing", async () => {
        stubFetch(() => ({ status: 503, text: "" }));
        const client = new LiteLlmClient(GATEWAY);
        assert.equal(await client.isHealthy(), false);
    });
});
