import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { CONNECTOR_ADAPTER_KEYS, CONNECTOR_TYPES } from "../../src/constants/connectionConstants.js";
import { CONNECTOR_OPERATIONS } from "../../src/constants/connectorOperationConstants.js";
import { CONNECTOR_ICON_KEYS, INITIAL_CONNECTOR_TYPES } from "../../src/constants/databaseSeedConstants.js";
import { INITIAL_CONNECTOR_CATALOG } from "../../src/infrastructure/database/seeds/connector-catalog.seed.js";
import { ConnectorAdapterRegistry } from "../../src/modules/connections/adapters/connector-adapter.registry.js";
import { RepositoryConnectorAdapter } from "../../src/modules/connections/adapters/repository-connector.adapter.js";
import { REPOSITORY_PROVIDERS } from "../../src/modules/connections/adapters/repository-providers.js";
import { ConnectorOperationDispatcher } from "../../src/modules/connections/operations/operation-dispatcher.js";
import { ConfigurationValidator } from "../../src/modules/connections/validation/configuration.validator.js";
import type { IConnectionRepository } from "../../src/modules/connections/repositories/connection.repository.js";
import type { IConnectorCatalogRepository } from "../../src/modules/connections/repositories/connector-catalog.repository.js";
import { ConnectionCredentialsService } from "../../src/modules/connections/services/connection-credentials.service.js";
import { ConnectionService } from "../../src/modules/connections/services/connection.service.js";
import type { ConfigurationSchema, ConnectorHandle } from "../../src/shared/types/connector-catalog.js";
import type { Connection, ConnectorCatalog } from "../../src/shared/types/entities.js";

const options = { requestTimeoutMs: 2_000, allowedCommandPaths: [], allowedFilesystemRoots: [] };
const context = { workspaceId: "w", connectionName: "repo" };
type Route = { status?: number; body?: unknown; text?: string; type?: string };

/** Answers requests by "pathname?search" and records each request's URL and headers. */
function fakeProvider(routes: Record<string, Route>) {
    const requests: Array<{ url: URL; headers: Headers; redirect: RequestInit["redirect"] }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        requests.push({ url, headers: new Headers(init?.headers), redirect: init?.redirect });
        const route = routes[`${url.pathname}${url.search}`];
        if (!route) return new Response(JSON.stringify({ message: "not found" }), { status: 404, headers: { "content-type": "application/json" } });
        const body = route.text ?? (route.body === undefined ? "" : JSON.stringify(route.body));
        return new Response(route.status === 204 ? null : body, { status: route.status ?? 200, headers: { "content-type": route.type ?? "application/json" } });
    }) as typeof fetch;
    return requests;
}

function adapter(key: string) {
    const provider = REPOSITORY_PROVIDERS.find(item => item.key === key);
    assert.ok(provider, key);
    return new RepositoryConnectorAdapter(provider, options);
}

async function run(handle: ConnectorHandle, operation: string, parameters: Record<string, unknown> = {}) {
    assert.ok(handle.execute);
    return handle.execute({ operation, parameters });
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("GitHub repository connector", () => {
    const repo = { full_name: "octo/app", default_branch: "main", private: true, html_url: "https://github.com/octo/app" };

    test("verifies the repository and reads files, branches, commits and pull requests", async () => {
        const requests = fakeProvider({
            "/repos/octo/app": { body: repo },
            "/repos/octo/app/branches?per_page=30": { body: [{ name: "main", commit: { sha: "a1" } }] },
            "/repos/octo/app/contents?ref=main": { body: [{ name: "src", path: "src", type: "dir" }, { name: "README.md", path: "README.md", type: "file" }] },
            "/repos/octo/app/contents/src/app.ts?ref=feature%2Fx": { body: { type: "file", content: Buffer.from("export {};\n").toString("base64") } },
            "/repos/octo/app/commits?sha=main&per_page=5": { body: [{ sha: "c1", commit: { message: "init", author: { name: "Ada", date: "2026-01-01T00:00:00Z" } } }] },
            "/repos/octo/app/pulls?state=open&per_page=30": { body: [{ number: 7, title: "Fix", state: "open", user: { login: "ada" }, head: { ref: "fix" }, base: { ref: "main" }, html_url: "https://github.com/octo/app/pull/7" }] },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ owner: "octo", repository: "app", token: "ghp_secret" }, context);
        assert.deepEqual(handle.metadata, { verification: "repository-access", provider: "GitHub", repository: "octo/app", defaultBranch: "main", visibility: "private", webUrl: "https://github.com/octo/app" });
        assert.equal(requests[0]!.url.origin, "https://api.github.com");
        assert.equal(requests[0]!.headers.get("authorization"), "Bearer ghp_secret");
        assert.equal(requests[0]!.headers.get("x-github-api-version"), "2022-11-28");
        assert.equal(requests[0]!.redirect, "error", "credentials must not follow redirects");

        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "branches" })).data, [{ name: "main", commit: "a1" }]);
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "files" })).data, [
            { name: "src", path: "src", type: "directory" }, { name: "README.md", path: "README.md", type: "file" },
        ]);
        const file = await run(handle, CONNECTOR_OPERATIONS.read, { path: "/src/app.ts", ref: "feature/x" });
        assert.deepEqual(file.data, { path: "src/app.ts", ref: "feature/x", content: "export {};\n" });
        const commits = await run(handle, CONNECTOR_OPERATIONS.list, { resource: "commits", limit: 5 });
        assert.deepEqual(commits.data, [{ id: "c1", message: "init", author: "Ada", date: "2026-01-01T00:00:00Z" }]);
        const pulls = await run(handle, CONNECTOR_OPERATIONS.list, { resource: "pull-requests" });
        assert.deepEqual(pulls.data, [{ id: "7", title: "Fix", state: "open", author: "ada", sourceBranch: "fix", targetBranch: "main", url: "https://github.com/octo/app/pull/7" }]);
    });

    test("uses an Enterprise Server API URL, and maps a pasted github.com address to the public API", async () => {
        const requests = fakeProvider({ "/api/v3/repos/octo/app": { body: repo }, "/repos/octo/app": { body: repo } });
        await adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ apiUrl: "https://git.corp.example/api/v3/", owner: "octo", repository: "app", token: "t" }, context);
        assert.equal(requests[0]!.url.href, "https://git.corp.example/api/v3/repos/octo/app");
        await adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ apiUrl: "https://github.com", owner: "octo", repository: "app", token: "t" }, context);
        assert.equal(requests[1]!.url.href, "https://api.github.com/repos/octo/app");
    });

    test("reports rejected tokens and missing repositories clearly", async () => {
        fakeProvider({ "/repos/octo/app": { status: 401, body: { message: "Bad credentials" } } });
        await assert.rejects(adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ owner: "octo", repository: "app", token: "bad" }, context), /rejected the credentials/);
        fakeProvider({});
        await assert.rejects(adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ owner: "octo", repository: "missing", token: "t" }, context), /was not found/);
    });

    test("refuses binary files and reading a directory", async () => {
        fakeProvider({
            "/repos/octo/app": { body: repo },
            "/repos/octo/app/contents/logo.png?ref=main": { body: { type: "file", content: Buffer.from([0x89, 0x50, 0x00, 0x01]).toString("base64") } },
            "/repos/octo/app/contents/src?ref=main": { body: [] },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ owner: "octo", repository: "app", token: "t" }, context);
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.read, { path: "logo.png" }), /binary/);
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.read, { path: "src" }), /is a directory/);
    });
});

describe("Azure DevOps Repos connector", () => {
    const base = "/contoso/Web%20App/_apis/git/repositories/site";
    const repo = { name: "site", defaultBranch: "refs/heads/main", webUrl: "https://dev.azure.com/contoso/Web%20App/_git/site", project: { name: "Web App", visibility: "private" } };

    test("sends the PAT as Basic authentication and reads through the Git REST API", async () => {
        const sha = "0123456789abcdef0123456789abcdef01234567";
        const requests = fakeProvider({
            [`${base}?api-version=6.0`]: { body: repo },
            [`${base}/refs?filter=heads%2F&$top=30&api-version=6.0`]: { body: { value: [{ name: "refs/heads/main", objectId: "a1" }] } },
            [`${base}/items?scopePath=%2Fsrc&recursionLevel=OneLevel&versionDescriptor.version=main&versionDescriptor.versionType=branch&api-version=6.0`]: {
                body: { value: [{ path: "/src", isFolder: true }, { path: "/src/app.ts", gitObjectType: "blob" }, { path: "/src/lib", isFolder: true, gitObjectType: "tree" }] },
            },
            [`${base}/items?path=%2Fsrc%2Fapp.ts&includeContent=true&versionDescriptor.version=${sha}&versionDescriptor.versionType=commit&api-version=6.0`]: { body: { path: "/src/app.ts", content: "let a = 1;" } },
            [`${base}/pullrequests?searchCriteria.status=active&$top=30&api-version=6.0`]: {
                body: { value: [{ pullRequestId: 12, title: "Feature", status: "active", createdBy: { displayName: "Ada" }, sourceRefName: "refs/heads/feature", targetRefName: "refs/heads/main" }] },
            },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.azureDevops).connect({ organizationUrl: "https://dev.azure.com/contoso", project: "Web App", repository: "site", token: "pat" }, context);
        assert.equal(requests[0]!.headers.get("authorization"), `Basic ${Buffer.from(":pat").toString("base64")}`);
        assert.equal(handle.metadata.repository, "Web App/site");
        assert.equal(handle.metadata.defaultBranch, "main");
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "branches" })).data, [{ name: "main", commit: "a1" }]);
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "files", path: "src" })).data, [
            { name: "app.ts", path: "src/app.ts", type: "file" }, { name: "lib", path: "src/lib", type: "directory" },
        ]);
        assert.equal(((await run(handle, CONNECTOR_OPERATIONS.read, { path: "src/app.ts", ref: sha })).data as { content: string }).content, "let a = 1;");
        const [pull] = (await run(handle, CONNECTOR_OPERATIONS.list, { resource: "pull-requests" })).data as Array<Record<string, unknown>>;
        assert.deepEqual(pull, { id: "12", title: "Feature", state: "active", author: "Ada", sourceBranch: "feature", targetBranch: "main", url: "https://dev.azure.com/contoso/Web%20App/_git/site/pullrequest/12" });
    });

    test("treats the HTTP 203 sign-in page as rejected credentials", async () => {
        fakeProvider({ [`${base}?api-version=6.0`]: { status: 203, text: "<html>Sign in</html>", type: "text/html" } });
        await assert.rejects(adapter(CONNECTOR_ADAPTER_KEYS.azureDevops).connect({ organizationUrl: "https://dev.azure.com/contoso", project: "Web App", repository: "site", token: "expired" }, context), /rejected the credentials/);
    });
});

describe("GitLab connector", () => {
    test("addresses the project by its encoded path and authenticates with PRIVATE-TOKEN", async () => {
        const root = "/api/v4/projects/group%2Fsub%2Fapp";
        const requests = fakeProvider({
            [root]: { body: { path_with_namespace: "group/sub/app", default_branch: "main", visibility: "internal", web_url: "https://gitlab.example/group/sub/app" } },
            [`${root}/repository/tree?path=src&ref=main&per_page=100`]: { body: [{ name: "app.ts", path: "src/app.ts", type: "blob" }] },
            [`${root}/repository/files/src%2Fapp.ts?ref=main`]: { body: { content: Buffer.from("ok").toString("base64"), encoding: "base64" } },
            [`${root}/merge_requests?state=opened&per_page=30`]: { body: [{ iid: 3, title: "MR", state: "opened", author: { username: "ada" }, source_branch: "f", target_branch: "main", web_url: "u" }] },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.gitlab).connect({ serverUrl: "https://gitlab.example", projectPath: "group/sub/app", token: "glpat" }, context);
        assert.equal(requests[0]!.headers.get("private-token"), "glpat");
        assert.equal(handle.metadata.visibility, "internal");
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "files", path: "src" })).data, [{ name: "app.ts", path: "src/app.ts", type: "file" }]);
        assert.equal(((await run(handle, CONNECTOR_OPERATIONS.fetch, { path: "src/app.ts" })).data as { content: string }).content, "ok");
        assert.equal(((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "pull-requests" })).data as Array<{ id: string }>)[0]!.id, "3");
    });

    test("defaults to GitLab.com", async () => {
        const requests = fakeProvider({ "/api/v4/projects/a%2Fb": { body: { path_with_namespace: "a/b", default_branch: null } } });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.gitlab).connect({ projectPath: "a/b", token: "t" }, context);
        assert.equal(requests[0]!.url.origin, "https://gitlab.com");
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.list, { resource: "files" }), /no default branch/);
    });
});

describe("Bitbucket connectors", () => {
    test("Bitbucket Cloud uses the account email with an API token and resolves branch names that contain a slash", async () => {
        const root = "/2.0/repositories/team/app";
        const requests = fakeProvider({
            [root]: { body: { full_name: "team/app", mainbranch: { name: "main" }, is_private: false, links: { html: { href: "https://bitbucket.org/team/app" } } } },
            [`${root}/refs/branches?q=name%3D%22feature%2Fx%22&pagelen=1`]: { body: { values: [{ name: "feature/x", target: { hash: "abc123" } }] } },
            [`${root}/src/abc123/docs/`]: { text: "", status: 404 },
            [`${root}/src/abc123/docs/?pagelen=100`]: { body: { values: [{ path: "docs/guide.md", type: "commit_file" }, { path: "docs/img", type: "commit_directory" }] } },
            [`${root}/src/main/README.md`]: { text: "# App", type: "text/plain" },
            [`${root}/pullrequests?state=OPEN&pagelen=50`]: { body: { values: [] } },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.bitbucketCloud).connect({ workspace: "team", repository: "app", authentication: "api-token", email: "ada@example.com", token: "ATATT" }, context);
        assert.equal(requests[0]!.headers.get("authorization"), `Basic ${Buffer.from("ada@example.com:ATATT").toString("base64")}`);
        assert.equal(handle.metadata.visibility, "public");
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "files", path: "docs", ref: "feature/x" })).data, [
            { name: "guide.md", path: "docs/guide.md", type: "file" }, { name: "img", path: "docs/img", type: "directory" },
        ]);
        assert.equal(((await run(handle, CONNECTOR_OPERATIONS.read, { path: "README.md" })).data as { content: string }).content, "# App");
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "pull-requests", limit: 100 })).data, [], "pull request pages are capped at 50");
    });

    test("Bitbucket Cloud access tokens are bearer tokens", async () => {
        const requests = fakeProvider({ "/2.0/repositories/team/app": { body: { full_name: "team/app" } } });
        await adapter(CONNECTOR_ADAPTER_KEYS.bitbucketCloud).connect({ workspace: "team", repository: "app", authentication: "access-token", token: "tok" }, context);
        assert.equal(requests[0]!.headers.get("authorization"), "Bearer tok");
    });

    test("Bitbucket Data Center reads an empty repository and browses directories", async () => {
        const root = "/rest/api/1.0/projects/~ada/repos/app";
        const requests = fakeProvider({
            [root]: { body: { slug: "app", project: { key: "~ADA" }, public: false, links: { self: [{ href: "https://bb.example/users/ada/repos/app/browse" }] } } },
            [`${root}/branches/default`]: { status: 204 },
            [`${root}/browse/src?at=develop&limit=100`]: { body: { children: { values: [{ path: { components: ["main.ts"] }, type: "FILE" }, { path: { components: ["lib"] }, type: "DIRECTORY" }] } } },
            [`${root}/commits?until=develop&limit=30`]: { body: { values: [{ id: "c1", message: "m", authorTimestamp: 0, author: { name: "ada" } }] } },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.bitbucketDataCenter).connect({ serverUrl: "https://bb.example", projectKey: "~ada", repository: "app", token: "bbs" }, context);
        assert.equal(requests[0]!.headers.get("authorization"), "Bearer bbs");
        assert.equal(handle.metadata.defaultBranch, null);
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "files", path: "src", ref: "develop" })).data, [
            { name: "main.ts", path: "src/main.ts", type: "file" }, { name: "lib", path: "src/lib", type: "directory" },
        ]);
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "commits", ref: "develop" })).data, [{ id: "c1", message: "m", author: "ada", date: "1970-01-01T00:00:00.000Z" }]);
    });
});

describe("Gitea / Forgejo connector", () => {
    test("uses the token scheme and the limit page parameter", async () => {
        const requests = fakeProvider({
            "/api/v1/repos/ada/app": { body: { full_name: "ada/app", default_branch: "main", private: false, html_url: "https://codeberg.org/ada/app" } },
            "/api/v1/repos/ada/app/branches?limit=10": { body: [{ name: "main", commit: { id: "f00" } }] },
        });
        const handle = await adapter(CONNECTOR_ADAPTER_KEYS.gitea).connect({ serverUrl: "https://codeberg.org", owner: "ada", repository: "app", token: "gt" }, context);
        assert.equal(requests[0]!.headers.get("authorization"), "token gt");
        assert.deepEqual((await run(handle, CONNECTOR_OPERATIONS.list, { resource: "branches", limit: 10 })).data, [{ name: "main", commit: "f00" }]);
    });
});

describe("repository operations", () => {
    async function githubHandle() {
        fakeProvider({ "/repos/octo/app": { body: { full_name: "octo/app", default_branch: "main" } } });
        return adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ owner: "octo", repository: "app", token: "t" }, context);
    }

    test("paths cannot leave the repository and refs must be valid names", async () => {
        const handle = await githubHandle();
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.read, { path: "../../etc/passwd" }), /stay inside the repository/);
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.read, {}), /file path is required/);
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.read, { path: "a.ts", ref: "main..evil" }), /not a valid branch/);
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.list, { resource: "branches", limit: 500 }), /limit must be/);
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.list, { resource: "issues" }), /Choose a resource/);
    });

    test("connections are read-only, and the dispatcher runs reads without confirmation", async () => {
        const handle = await githubHandle();
        await assert.rejects(run(handle, CONNECTOR_OPERATIONS.write, { path: "a", content: "b" }), /read-only/);
        fakeProvider({ "/repos/octo/app/branches?per_page=30": { body: [] } });
        const dispatcher = new ConnectorOperationDispatcher(() => handle);
        const decision = await dispatcher.dispatch({ sessionId: "s", connectionId: "c", operation: CONNECTOR_OPERATIONS.list, parameters: { resource: "branches" } });
        assert.equal(decision.confirmationRequired, false);
        assert.deepEqual(decision.result?.data, []);
    });

    test("requests cannot be pointed at another origin", async () => {
        fakeProvider({});
        await assert.rejects(adapter(CONNECTOR_ADAPTER_KEYS.github).connect({ apiUrl: "https://user:pass@git.example/api/v3", owner: "o", repository: "r", token: "t" }, context), /without URL credentials/);
        await assert.rejects(adapter(CONNECTOR_ADAPTER_KEYS.gitlab).connect({ serverUrl: "https://gitlab.example/?private_token=x", projectPath: "a/b", token: "t" }, context), /authentication fields|query parameters/);
    });
});

describe("creating a repository connection", () => {
    test("validates, verifies against the provider, encrypts the token and never returns it", async () => {
        const entry = INITIAL_CONNECTOR_CATALOG.find(item => item.code === "github")!;
        const catalog = { ...entry, id: "6f1b8a52-4c3d-4e5f-9a6b-7c8d9e0f1a2b", createdAt: new Date(), updatedAt: new Date() } as ConnectorCatalog;
        const saved: Connection[] = [];
        const repository = {
            create: async (data: Record<string, unknown>) => {
                const row = { id: "c0ffee00-0000-4000-8000-000000000001", lastSyncedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data } as Connection;
                saved.push(row);
                return row;
            },
            updateInWorkspace: async () => saved[0] ?? null,
        };
        const service = new ConnectionService(
            repository as unknown as IConnectionRepository,
            { findById: async () => catalog } as unknown as IConnectorCatalogRepository,
            new ConnectionCredentialsService(Buffer.alloc(32, 3).toString("base64")),
            new ConnectorAdapterRegistry(options),
        );
        fakeProvider({ "/repos/octo/app": { body: { full_name: "octo/app", default_branch: "main", private: true } } });
        const workspaceId = "5f1a9a42-7d3e-4c1b-8a60-93b7c2d4e611";
        const created = await service.create({ workspaceId, catalogId: catalog.id, name: "App repo", configuration: { owner: "octo", repository: "app", token: "ghp_live_secret" } });
        assert.equal(created.connectionType, CONNECTOR_TYPES.repository);
        assert.equal(created.status, "connected");
        assert.deepEqual(created.configuration, { owner: "octo", repository: "app" });
        assert.deepEqual(created.configuredSecretFields, ["token"]);
        assert.doesNotMatch(JSON.stringify(created), /ghp_live_secret/);
        assert.doesNotMatch(String(saved[0]!.credentialReference), /ghp_live_secret/);
        await assert.rejects(service.create({ workspaceId, catalogId: catalog.id, name: "Bad", configuration: { owner: "octo", repository: "app" } }), /configuration is invalid/);
        await service.close();
    });
});

describe("repository catalog", () => {
    const entries = INITIAL_CONNECTOR_CATALOG.filter(entry => entry.connectorType === CONNECTOR_TYPES.repository);
    const validator = new ConfigurationValidator();

    test("defines the Repository type and six enabled providers, each with an adapter and an icon", () => {
        assert.ok(INITIAL_CONNECTOR_TYPES.some(type => type.code === CONNECTOR_TYPES.repository));
        assert.deepEqual(entries.map(entry => entry.code), ["github", "azure-devops-repos", "gitlab", "bitbucket-cloud", "bitbucket-data-center", "gitea"]);
        const registry = new ConnectorAdapterRegistry(options);
        for (const entry of entries) {
            assert.equal(entry.isEnabled, true, entry.code);
            assert.ok(registry.supports(entry.adapterKey), entry.code);
            assert.ok(CONNECTOR_ICON_KEYS[entry.code], entry.code);
        }
    });

    test("schemas accept valid settings, keep tokens secret, and reject bad input", () => {
        const schema = (code: string) => entries.find(entry => entry.code === code)!.configSchema as ConfigurationSchema;
        for (const entry of entries) assert.equal((entry.configSchema as ConfigurationSchema).properties.token?.["x-secret"], true, entry.code);
        validator.validate(schema("github"), { owner: "octo", repository: "app", token: "t" });
        validator.validate(schema("gitlab"), { projectPath: "group/sub/app", token: "t" });
        validator.validate(schema("bitbucket-cloud"), { workspace: "team", repository: "app", authentication: "access-token", token: "t" });
        assert.throws(() => validator.validate(schema("bitbucket-cloud"), { workspace: "team", repository: "app", authentication: "api-token", token: "t" }), /invalid/, "an API token needs the account email");
        assert.throws(() => validator.validate(schema("github"), { owner: "octo/evil", repository: "app", token: "t" }), /invalid/);
        assert.throws(() => validator.validate(schema("gitlab"), { projectPath: "no-namespace", token: "t" }), /invalid/);
        assert.throws(() => validator.validate(schema("azure-devops-repos"), { organizationUrl: "not a url", project: "p", repository: "r", token: "t" }), /invalid/);
    });

    test("an invalid configuration names each field to fix", () => {
        const github = entries.find(entry => entry.code === "github")!.configSchema as ConfigurationSchema;
        assert.throws(
            () => validator.validate(github, { owner: "Kausthuban M", repository: "https://github.com/Githack27/docspyre-ai.git", token: "t" }),
            (error: Error) => /Owner must be the name as it appears in the repository URL/.test(error.message)
                && /Repository must be the name/.test(error.message)
                && !/API URL/.test(error.message),
        );
        assert.throws(() => validator.validate(github, { owner: "octo", repository: "app" }), /Access token is required\./);
        assert.throws(() => validator.validate(github, { owner: "octo", repository: "app", token: "t", apiUrl: "github" }), /API URL must be a full URL/);
    });
});
