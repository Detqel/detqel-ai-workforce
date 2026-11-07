import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { TavilyWebSearchTool } from "../../src/shared/agents/tools/tavily.tool.js";
import { WorkspaceWebSearch } from "../../src/shared/agents/tools/workspace-web-search.js";
import { AppError } from "../../src/shared/errors/app-error.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("TavilyWebSearchTool", () => {
    test("construction fails fast without an API key", () => {
        assert.throws(() => new TavilyWebSearchTool({ apiKey: "" }), /not configured/);
    });

    test("a search normalises results and preserves source URLs for citation", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify({
            answer: "A concise answer.",
            results: [
                { title: "Doc A", url: "https://a.test/x", content: "snippet a", score: 0.9 },
                { title: "Doc B", url: "https://b.test/y", content: "snippet b", score: 0.7 },
                { title: "No URL", content: "dropped" },
            ],
        }), { status: 200 })) as typeof fetch;
        const tool = new TavilyWebSearchTool({ apiKey: "tvly-test" });
        const response = await tool.search("what is poml");
        assert.equal(response.answer, "A concise answer.");
        assert.equal(response.results.length, 2, "results without a URL are dropped");
        assert.equal(response.results[0].url, "https://a.test/x");
    });

    test("an empty query is rejected before any request", async () => {
        let called = false;
        globalThis.fetch = (async () => { called = true; return new Response("{}", { status: 200 }); }) as typeof fetch;
        const tool = new TavilyWebSearchTool({ apiKey: "tvly-test" });
        await assert.rejects(() => tool.search("   "), /non-empty search query/);
        assert.equal(called, false);
    });

    test("an out-of-range result count is rejected", async () => {
        const tool = new TavilyWebSearchTool({ apiKey: "tvly-test" });
        await assert.rejects(() => tool.search("q", { maxResults: 99 }), /out of range/);
    });

    test("the key travels in the Authorization header, never in the request body", async () => {
        let headers = new Headers();
        let body: Record<string, unknown> = {};
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
            headers = new Headers(init?.headers);
            body = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }) as typeof fetch;
        await new TavilyWebSearchTool({ apiKey: "tvly-secret" }).search("q", { maxResults: 1 });
        assert.equal(headers.get("Authorization"), "Bearer tvly-secret");
        assert.equal("api_key" in body, false);
        assert.equal(body.max_results, 1);
    });

    test("error statuses surface a clear reason and never the response body, and never as a 401", async () => {
        const cases: Array<[number, RegExp]> = [[401, /rejected the API key/], [432, /no search credits/], [433, /no search credits/], [429, /rate limiting/], [500, /web search request failed/]];
        for (const [status, expected] of cases) {
            globalThis.fetch = (async () => new Response("tvly-secret-echo", { status })) as typeof fetch;
            await assert.rejects(() => new TavilyWebSearchTool({ apiKey: "tvly-test" }).search("q"), (error: AppError) => {
                assert.match(error.message, expected);
                assert.ok(!error.message.includes("tvly-secret-echo"));
                assert.ok(error.statusCode >= 400 && error.statusCode < 500, "the reason must reach the user, not be concealed as a 5xx");
                assert.notEqual(error.statusCode, 401, "an upstream auth failure must not look like an expired session");
                return true;
            });
        }
    });
});

describe("WorkspaceWebSearch", () => {
    test("searches with the key the workspace saved and maps results for citation", async () => {
        const asked: string[] = [];
        let authorization: string | null = null;
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
            authorization = new Headers(init?.headers).get("Authorization");
            return new Response(JSON.stringify({ results: [{ title: "", url: "https://a.test", content: "snippet" }] }), { status: 200 });
        }) as typeof fetch;
        const search = new WorkspaceWebSearch(async workspaceId => { asked.push(workspaceId); return `tvly-${workspaceId}`; });
        const results = await search.search("ws-1", "q", 3);
        assert.deepEqual(asked, ["ws-1"]);
        assert.equal(authorization, "Bearer tvly-ws-1");
        assert.deepEqual(results, [{ title: "https://a.test", url: "https://a.test", snippet: "snippet" }], "an untitled result is titled by its URL");
    });

    test("a workspace without a key fails the check with the resolver's message", async () => {
        const search = new WorkspaceWebSearch(async () => { throw new AppError(409, "Web search is not configured."); });
        await assert.rejects(() => search.assertConfigured("ws-1"), /not configured/);
    });
});
