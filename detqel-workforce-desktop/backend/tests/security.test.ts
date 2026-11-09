import test, { afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testConfig as config } from "./fixtures/config.js";
import { bearer, memberRow, mockUnit, otherUserId, otherWorkspaceId, tokenFor, userId, userRow, workspaceId, workspaceRow } from "./fixtures/unit.js";
import { buildApp } from "../src/app.js";
import { createServices } from "../src/bootstrap/services.js";
import { SessionService } from "../src/shared/security/session.js";
import { SecretCipher, secretHint } from "../src/shared/security/secret-cipher.js";
import { SECRET_PURPOSES } from "../src/constants/authConstants.js";

type Overrides = Parameters<typeof mockUnit>[0];
async function withApp(overrides: Overrides, run: (app: Awaited<ReturnType<typeof buildApp>>) => Promise<void>) {
  const app = await buildApp({ config, services: createServices(mockUnit(overrides), async () => {}, config), logger: false });
  try { await run(app); } finally { await app.close(); }
}
/** A workspace the signed-in user belongs to with the given role. Everyone else has no access. */
const asRole = (role: string, createdBy: string | null = otherUserId): NonNullable<Overrides> => ({
  workspaces: {
    findById: async (id: string) => id === workspaceId ? workspaceRow(workspaceId, createdBy) : null,
    getMembers: async () => [memberRow(userId, role)],
    listAuthWorkspaces: async () => [{ id: workspaceId, name: "W", slug: "w", industry: null, description: null, role, status: "active" }],
  },
});

describe("authentication", () => {
  test("every API route except sign in, sign up and the license list requires a session", async () => {
    await withApp({}, async app => {
      const routes: Array<{ method: string; url: string }> = JSON.parse(await readFile(new URL("./fixtures/routes.json", import.meta.url), "utf8"));
      const open = new Set(["POST /api/auth/login", "POST /api/auth/register", "GET /api/auth/license-options"]);
      let checked = 0;
      for (const route of routes) {
        if (!route.url.startsWith("/api/")) continue;
        const key = `${route.method} ${route.url}`;
        const response = await app.inject({ method: route.method as "GET", url: route.url.replace(/:\w+/g, workspaceId) });
        if (open.has(key)) assert.notEqual(response.statusCode, 401, key);
        else assert.equal(response.statusCode, 401, key);
        checked++;
      }
      assert.ok(checked > 70, `only ${checked} routes were exercised`);
      assert.equal((await app.inject("/health/live")).statusCode, 200);
    });
  });

  test("forged, expired, malformed and orphaned sessions are rejected", async () => {
    const secret = config.AUTH_SESSION_SECRET;
    const [payload, signature] = tokenFor(userId).split(".");
    const forged = `${Buffer.from(JSON.stringify({ sub: otherUserId, exp: 9999999999, nonce: "x" })).toString("base64url")}.${signature}`;
    const expired = new SessionService(secret, -60).issue(userId).accessToken;
    const otherSecret = new SessionService(Buffer.alloc(32, 9).toString("base64"), 3600).issue(userId).accessToken;
    await withApp({}, async app => {
      for (const token of [forged, expired, otherSecret, `${payload}.`, "garbage", ""]) {
        const response = await app.inject({ url: "/api/auth/me", headers: { authorization: `Bearer ${token}` } });
        assert.equal(response.statusCode, 401, token.slice(0, 20));
      }
      assert.equal((await app.inject({ url: "/api/auth/me", headers: { authorization: tokenFor(userId) } })).statusCode, 401, "scheme is required");
    });
    await withApp({ users: { findById: async () => userRow(userId, { status: "disabled" }) } }, async app => {
      assert.equal((await app.inject({ url: "/api/auth/me", headers: bearer() })).statusCode, 401, "disabled user");
    });
    await withApp({ users: { findById: async () => null } }, async app => {
      assert.equal((await app.inject({ url: "/api/auth/me", headers: bearer() })).statusCode, 401, "deleted user");
    });
    for (const license of [{ licenseExpiresAt: new Date(Date.now() - 1000) }, { licenseId: null, licenseExpiresAt: null }]) {
      await withApp({ users: { findById: async () => userRow(userId, license) } }, async app => {
        assert.equal((await app.inject({ url: "/api/auth/me", headers: bearer() })).statusCode, 401, "expired or missing license");
      });
    }
  });

  test("/auth/me renews the caller's own session and ignores a userId in the query", async () => {
    await withApp({ workspaces: { listAuthWorkspaces: async () => [] } }, async app => {
      const response = await app.inject({ url: `/api/auth/me?userId=${otherUserId}`, headers: bearer() });
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().user.id, userId);
      assert.equal(new SessionService(config.AUTH_SESSION_SECRET, 60).verify(`Bearer ${response.json().accessToken}`), userId);
      assert.equal((await app.inject(`/api/auth/me?userId=${userId}`)).statusCode, 401, "a userId alone must not mint a session");
    });
  });

});

describe("workspace authorization", () => {
  test("members read, managers write, and only owners and administrators manage", async () => {
    const expectations: Array<[string, string, string, number]> = [
      // role, method, url, expected status. 400 means access was granted and request validation took over.
      ["employee", "GET", `/api/missions?workspaceId=${workspaceId}`, 200],
      ["employee", "POST", "/api/missions", 403],
      ["manager", "POST", "/api/missions", 400],
      ["manager", "PUT", `/api/workspaces/${workspaceId}`, 403],
      ["admin", "PUT", `/api/workspaces/${workspaceId}`, 400],
      ["admin", "DELETE", `/api/workspaces/${workspaceId}`, 403],
      ["manager", "POST", `/api/connections/test`, 403],
    ];
    for (const [role, method, url, expected] of expectations) {
      await withApp({ ...asRole(role), missions: { listByWorkspace: async () => [] } }, async app => {
        const payload = url.endsWith("/connections/test") ? { workspaceId, catalogId: otherWorkspaceId, name: "Connection", configuration: {} }
          : method === "PUT" ? { name: "" } : method === "POST" ? { workspaceId } : undefined;
        const response = await app.inject({ method: method as "GET", url, headers: bearer(), payload });
        assert.equal(response.statusCode, expected, `${role} ${method} ${url}`);
      });
    }
  });

  test("a user outside the workspace is refused on read and write, and cannot learn whether a mission exists", async () => {
    await withApp({
      workspaces: { findById: async () => workspaceRow(workspaceId, otherUserId), getMembers: async () => [], listAuthWorkspaces: async () => [] },
      missions: { findById: async () => ({ id: otherWorkspaceId, workspaceId }) },
    }, async app => {
      for (const [method, url] of [["GET", `/api/missions?workspaceId=${workspaceId}`], ["GET", `/api/business/workspaces/${workspaceId}/profile`], ["GET", `/api/missions/${otherWorkspaceId}`], ["PATCH", `/api/missions/${otherWorkspaceId}/status`], ["GET", `/api/workspaces/${workspaceId}/members`], ["GET", `/api/settings/vyra?workspaceId=${workspaceId}`]] as const) {
        const response = await app.inject({ method, url, headers: bearer(), payload: method === "PATCH" ? { status: "completed" } : undefined });
        assert.equal(response.statusCode, 403, `${method} ${url}`);
      }
    });
  });

  test("workspaces are listed only for their own user", async () => {
    await withApp({ workspaces: { listByUser: async (id: string) => id === userId ? [{ id: workspaceId }] : [{ id: otherWorkspaceId }] } }, async app => {
      assert.equal((await app.inject({ url: `/api/workspaces/user/${otherUserId}`, headers: bearer() })).statusCode, 403);
      assert.deepEqual((await app.inject({ url: `/api/workspaces/user/${userId}`, headers: bearer() })).json(), [{ id: workspaceId }]);
      assert.deepEqual((await app.inject({ url: "/api/workspaces", headers: bearer() })).json(), [{ id: workspaceId }], "the all-workspaces route lists only the caller's");
    });
  });

  test("a workspace is always created for the signed-in user, never for a client-supplied id", async () => {
    await withApp({}, async app => {
      const response = await app.inject({ method: "POST", url: "/api/workspaces", headers: bearer(), payload: { name: "Mine", createdBy: otherUserId } });
      assert.equal(response.statusCode, 403);
    });
  });

  test("only an owner can grant ownership or delete, and the creator cannot be removed", async () => {
    const admin = asRole("admin");
    await withApp({ workspaces: { ...admin.workspaces, addMember: async () => ({}) } }, async app => {
      const grant = await app.inject({ method: "POST", url: `/api/workspaces/${workspaceId}/members`, headers: bearer(), payload: { userId: otherUserId, role: "owner" } });
      assert.equal(grant.statusCode, 403);
    });
    await withApp({ workspaces: { ...asRole("owner").workspaces, findById: async () => workspaceRow(workspaceId, otherUserId), removeMember: async () => true } }, async app => {
      const response = await app.inject({ method: "DELETE", url: `/api/workspaces/${workspaceId}/members/${otherUserId}`, headers: bearer() });
      assert.equal(response.statusCode, 409);
    });
  });

  test("references to another workspace's records are refused", async () => {
    // The user manages `workspaceId`; the agents and mission below belong elsewhere.
    const unit: Overrides = {
      ...asRole("owner"),
      workforce: { countOrganizationAgentsInWorkspace: async () => 1, findById: async () => ({ id: otherUserId, workspaceId: otherWorkspaceId, agentType: "custom" }) },
      missions: { findById: async () => ({ id: otherUserId, workspaceId: otherWorkspaceId }), createMission: async () => { throw new Error("must not be created"); } },
    };
    await withApp(unit, async app => {
      const agentIds = [otherUserId, otherWorkspaceId];
      const team = await app.inject({ method: "POST", url: "/api/teams", headers: bearer(), payload: { workspaceId, name: "Team", memberAgentIds: agentIds } });
      assert.equal(team.statusCode, 404, "team members must be recruited into the same workspace");
      const mission = await app.inject({ method: "POST", url: "/api/missions", headers: bearer(), payload: { workspaceId, title: "M", userRequest: "R", assignedAgents: [{ agentId: otherUserId }] } });
      assert.equal(mission.statusCode, 404, "assigned agents must be in the workspace");
      const approval = await app.inject({ method: "POST", url: "/api/approvals", headers: bearer(), payload: { workspaceId, missionId: otherUserId, title: "A", description: "D", requestedAction: {} } });
      assert.equal(approval.statusCode, 404, "an approval cannot point at another workspace's mission");
    });
  });

  test("agents cannot be created without a workspace or as platform agents", async () => {
    await withApp(asRole("owner"), async app => {
      const base = { name: "A", description: "D", purpose: "P", instructions: "I" };
      assert.equal((await app.inject({ method: "POST", url: "/api/agents", headers: bearer(), payload: base })).statusCode, 400);
      assert.equal((await app.inject({ method: "POST", url: "/api/agents", headers: bearer(), payload: { ...base, workspaceId, agentType: "platform" } })).statusCode, 400);
      assert.equal((await app.inject({ url: "/api/agents", headers: bearer() })).statusCode, 400, "listing requires a workspace");
    });
  });

  test("platform agents are readable but not changeable", async () => {
    await withApp({ workforce: { findById: async () => ({ id: otherUserId, workspaceId: null, agentType: "platform" }), getAgentWithDetails: async () => ({ id: otherUserId }), addMemory: async () => ({}) }, workspaces: {} }, async app => {
      assert.equal((await app.inject({ url: `/api/agents/${otherUserId}`, headers: bearer() })).statusCode, 200);
      const write = await app.inject({ method: "POST", url: `/api/agents/${otherUserId}/memory`, headers: bearer(), payload: { memoryType: "fact", content: "x" } });
      assert.equal(write.statusCode, 403);
    });
  });

  test("actions are attributed to the signed-in user, not to an id in the request", async () => {
    await withApp({ ...asRole("owner"), missions: { createMission: async () => { throw new Error("must not be created"); } } }, async app => {
      const response = await app.inject({ method: "POST", url: "/api/missions", headers: bearer(), payload: { workspaceId, title: "M", userRequest: "R", initiatedBy: otherUserId } });
      assert.equal(response.statusCode, 403);
    });
    let reviewer: string | undefined;
    await withApp({ ...asRole("owner"), missions: {
      findApprovalById: async () => ({ id: otherUserId, workspaceId }),
      reviewApproval: async (_id: string, by: string) => { reviewer = by; return { id: otherUserId, title: "T", missionId: null }; },
    } }, async app => {
      const url = `/api/approvals/${otherUserId}/review`;
      assert.equal((await app.inject({ method: "POST", url, headers: bearer(), payload: { status: "approved", userId: otherUserId } })).statusCode, 403);
      assert.equal((await app.inject({ method: "POST", url, headers: bearer(), payload: { status: "approved" } })).statusCode, 200);
      assert.equal(reviewer, userId);
    });
  });
});

describe("user data", () => {
  test("user listings and profiles never contain credentials and are limited to people who share a workspace", async () => {
    const users: Record<string, ReturnType<typeof userRow>> = { [userId]: userRow(userId, { name: "Me" }), [otherUserId]: userRow(otherUserId, { name: "Colleague" }), stranger: userRow("stranger", { name: "Stranger" }) };
    await withApp({
      users: { findById: async (id: string) => users[id] ?? null, findWithMemberships: async (id: string) => ({ ...users[id], memberships: [] }) },
      workspaces: {
        listAuthWorkspaces: async () => [{ id: workspaceId, role: "employee", status: "active" }],
        getMembers: async () => [memberRow(userId, "employee"), memberRow(otherUserId, "owner")],
      },
    }, async app => {
      const list = await app.inject({ url: "/api/users", headers: bearer() });
      assert.deepEqual(list.json().map((user: { name: string }) => user.name), ["Colleague", "Me"]);
      assert.doesNotMatch(list.body, /SECRET-PASSWORD-HASH|SECRET-LICENSE-TOKEN|passwordHash|licenseToken/);
      const own = await app.inject({ url: `/api/users/${userId}`, headers: bearer() });
      assert.equal(own.statusCode, 200);
      assert.doesNotMatch(own.body, /SECRET-PASSWORD-HASH|SECRET-LICENSE-TOKEN|passwordHash|licenseToken/);
      assert.equal((await app.inject({ url: `/api/users/${otherUserId}`, headers: bearer() })).statusCode, 200);
      assert.equal((await app.inject({ url: "/api/users/6d1f0a9b-1111-4222-8333-444455556666", headers: bearer() })).statusCode, 404, "unrelated users are not visible");
    });
  });

  test("creating a user requires administrator access", async () => {
    await withApp(asRole("employee"), async app => {
      const response = await app.inject({ method: "POST", url: "/api/users", headers: bearer(), payload: { name: "New", email: "new@example.test" } });
      assert.equal(response.statusCode, 403);
    });
  });

  test("notifications are private to their owner", async () => {
    let markedFor: string | undefined;
    await withApp({ notifications: { listByUser: async () => [], countUnread: async () => 0, markAsRead: async (_id: string, user: string) => { markedFor = user; return null; }, create: async () => ({}) } }, async app => {
      assert.equal((await app.inject({ url: `/api/notifications?userId=${otherUserId}`, headers: bearer() })).statusCode, 403);
      assert.equal((await app.inject({ method: "PATCH", url: `/api/notifications/${otherUserId}/read`, headers: bearer() })).statusCode, 404);
      assert.equal(markedFor, userId, "marking read is scoped to the signed-in user in the query");
      assert.equal((await app.inject({ method: "POST", url: "/api/notifications/mark-all-read", headers: bearer(), payload: { userId: otherUserId } })).statusCode, 403);
      assert.equal((await app.inject({ method: "POST", url: "/api/notifications", headers: bearer(), payload: { userId: otherUserId, title: "t", message: "m" } })).statusCode, 403, "notifying another user needs a shared workspace");
    });
  });
});

describe("AI provider credentials", () => {
  const cipher = new SecretCipher(config.CONNECTOR_ENCRYPTION_KEY, SECRET_PURPOSES.aiProviderCredentials);
  const provider = (apiKey: string | null) => ({ id: "openai", name: "OpenAI", iconKey: "openai", description: null, badge: null, models: [], apiKey, status: "connected", isConnected: true, sortOrder: 0 });

  test("provider listings return whether a key is saved, never the key", async () => {
    const stored = [provider(cipher.encrypt("sk-live-secret-key-abcd", "ai_providers:openai")), { ...provider(null), id: "groq" }, { ...provider("sk-legacy-plain-text-wxyz"), id: "deepseek" }];
    await withApp({ settings: { listProviders: async () => stored } }, async app => {
      const response = await app.inject({ url: "/api/settings/providers", headers: bearer() });
      assert.equal(response.statusCode, 200);
      assert.doesNotMatch(response.body, /sk-live-secret-key|sk-legacy-plain-text|"apiKey"|secret:v1/);
      const byId = Object.fromEntries(response.json().providers.map((item: { id: string }) => [item.id, item]));
      assert.deepEqual([byId.openai.hasApiKey, byId.openai.apiKeyHint], [true, "abcd"]);
      assert.deepEqual([byId.groq.hasApiKey, byId.groq.apiKeyHint], [false, null]);
      assert.deepEqual([byId.deepseek.hasApiKey, byId.deepseek.apiKeyHint], [true, "wxyz"]);
    });
  });

  test("VYRA settings never return the key, even when the stored value is unreadable", async () => {
    const row = (apiKey: string) => ({ id: "s1", workspaceId, agentName: "VYRA", slogan: "", quote: "", selectedProviderId: "openai", selectedModelId: "m", apiKey, keyStatus: "", isValidKey: false, instructions: {}, templates: [], samplePrompts: [], traits: [], previewMode: "chat", createdAt: new Date(), updatedAt: new Date() });
    for (const [apiKey, hasKey] of [[cipher.encrypt("sk-workspace-key-1234", `vyra_settings:${workspaceId}`), true], [cipher.encrypt("sk-workspace-key-1234", "vyra_settings:another"), false], ["", false]] as const) {
      await withApp({ ...asRole("manager"), settings: { getVyraSettings: async () => row(apiKey) } }, async app => {
        const response = await app.inject({ url: `/api/settings/vyra?workspaceId=${workspaceId}`, headers: bearer() });
        assert.equal(response.statusCode, 200);
        assert.doesNotMatch(response.body, /sk-workspace-key|"apiKey"|secret:v1/);
        assert.equal(response.json().settings.hasApiKey, hasKey);
      });
    }
  });

  test("saved keys are encrypted before they reach the database and bound to their record", async () => {
    let written: Record<string, unknown> | undefined;
    await withApp({ ...asRole("admin"), settings: { updateProvider: async (_id: string, updates: Record<string, unknown>) => { written = updates; return provider(updates.apiKey as string); } } }, async app => {
      const response = await app.inject({ method: "PUT", url: "/api/settings/providers/openai", headers: bearer(), payload: { apiKey: "  sk-new-key-0987  ", isConnected: true } });
      assert.equal(response.statusCode, 200);
      assert.match(written!.apiKey as string, /^secret:v1:/);
      assert.doesNotMatch(String(written!.apiKey), /sk-new-key/);
      assert.equal(cipher.decrypt(written!.apiKey as string, "ai_providers:openai"), "sk-new-key-0987");
      assert.throws(() => cipher.decrypt(written!.apiKey as string, "ai_providers:groq"));
      assert.equal(response.json().provider.apiKeyHint, "0987");
    });
  });

  test("provider settings accept only known fields", async () => {
    await withApp({ ...asRole("admin"), settings: { updateProvider: async () => { throw new Error("must not be updated"); } } }, async app => {
      const response = await app.inject({ method: "PUT", url: "/api/settings/providers/openai", headers: bearer(), payload: { id: "hijacked", sortOrder: -1 } });
      assert.equal(response.statusCode, 400);
    });
  });

  test("changing or using provider credentials requires administrator access, and keys never travel in a URL", async () => {
    await withApp({ ...asRole("employee"), settings: { listProviders: async () => [] } }, async app => {
      assert.equal((await app.inject({ method: "PUT", url: "/api/settings/providers/openai", headers: bearer(), payload: { apiKey: "k" } })).statusCode, 403);
      assert.equal((await app.inject({ method: "POST", url: "/api/settings/test-connection", headers: bearer(), payload: { providerId: "openai" } })).statusCode, 403);
      assert.equal((await app.inject({ method: "POST", url: "/api/settings/vyra/test-prompt", headers: bearer(), payload: { prompt: "hi" } })).statusCode, 403);
      assert.equal((await app.inject({ url: "/api/settings/providers/openai/models", headers: bearer() })).statusCode, 403);
      assert.equal((await app.inject({ url: "/api/settings/providers", headers: bearer() })).statusCode, 200, "listing is open to any signed-in user");
    });
    await withApp({ ...asRole("admin") }, async app => {
      const response = await app.inject({ url: "/api/settings/providers/openai/models?apiKey=sk-in-url", headers: bearer() });
      assert.equal(response.statusCode, 400);
      assert.doesNotMatch(response.body, /sk-in-url/);
    });
  });

  test("VYRA settings require a workspace and workspace manager access to change", async () => {
    await withApp(asRole("manager"), async app => {
      assert.equal((await app.inject({ url: "/api/settings/vyra", headers: bearer() })).statusCode, 400);
      assert.equal((await app.inject({ method: "PUT", url: `/api/settings/vyra?workspaceId=${workspaceId}`, headers: bearer(), payload: { previewMode: "chat" } })).statusCode, 403);
    });
  });

  describe("Tavily web-search key", () => {
    const tavilyContext = `vyra_settings:tavily:${workspaceId}`;
    const row = (tavilyApiKey: string) => ({ id: "s1", workspaceId, agentName: "VYRA", slogan: "", quote: "", selectedProviderId: "openai", selectedModelId: "m", apiKey: "", keyStatus: "", isValidKey: false, tavilyApiKey, tavilyKeyStatus: "", isValidTavilyKey: false, instructions: {}, templates: [], samplePrompts: [], traits: [], previewMode: "chat", createdAt: new Date(), updatedAt: new Date() });
    const originalFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = originalFetch; });

    test("is never returned, and a value bound to another column or workspace reads as absent", async () => {
      const cases = [
        [cipher.encrypt("tvly-workspace-key-1234", tavilyContext), true],
        [cipher.encrypt("tvly-workspace-key-1234", `vyra_settings:${workspaceId}`), false],
        [cipher.encrypt("tvly-workspace-key-1234", "vyra_settings:tavily:another"), false],
        ["", false],
      ] as const;
      for (const [stored, hasKey] of cases) {
        await withApp({ ...asRole("manager"), settings: { getVyraSettings: async () => row(stored) } }, async app => {
          const response = await app.inject({ url: `/api/settings/vyra?workspaceId=${workspaceId}`, headers: bearer() });
          assert.equal(response.statusCode, 200);
          assert.doesNotMatch(response.body, /tvly-workspace-key|"tavilyApiKey"|secret:v1/);
          assert.equal(response.json().settings.hasTavilyApiKey, hasKey);
          assert.equal(response.json().settings.tavilyApiKeyHint, hasKey ? "1234" : null);
        });
      }
    });

    test("is encrypted and bound to its own column before it reaches the database, and resets its connection state", async () => {
      let written: Record<string, unknown> | undefined;
      await withApp({ ...asRole("admin"), settings: { upsertVyraSettings: async (settings: Record<string, unknown>) => { written = settings; return row(settings.tavilyApiKey as string); } } }, async app => {
        const response = await app.inject({ method: "PUT", url: `/api/settings/vyra?workspaceId=${workspaceId}`, headers: bearer(), payload: { tavilyApiKey: "  tvly-new-key-0987  " } });
        assert.equal(response.statusCode, 200);
        assert.equal(cipher.decrypt(written!.tavilyApiKey as string, tavilyContext), "tvly-new-key-0987");
        assert.throws(() => cipher.decrypt(written!.tavilyApiKey as string, `vyra_settings:${workspaceId}`), "the model key's context cannot read it");
        assert.equal("apiKey" in written!, false, "the model key is left untouched");
        assert.equal(written!.tavilyKeyStatus, "");
        assert.equal(written!.isValidTavilyKey, false);
        assert.equal(response.json().settings.tavilyApiKeyHint, "0987");
      });
    });

    test("testing it needs workspace manage access, takes the key only in the body, and reports Tavily's verdict", async () => {
      const path = "/api/settings/web-search/test-connection";
      await withApp({ ...asRole("employee") }, async app => {
        assert.equal((await app.inject({ method: "POST", url: path, headers: bearer(), payload: { workspaceId, apiKey: "tvly-x" } })).statusCode, 403);
      });
      await withApp({ ...asRole("admin"), settings: { getVyraSettings: async () => row("") } }, async app => {
        const missing = await app.inject({ method: "POST", url: path, headers: bearer(), payload: { workspaceId } });
        assert.equal(missing.statusCode, 409);
        assert.match(missing.json().message, /Add a Tavily API key in Settings/);
        assert.equal((await app.inject({ method: "POST", url: path, headers: bearer(), payload: { workspaceId, providerId: "openai" } })).statusCode, 400, "only known fields are accepted");

        let authorization: string | null = null;
        globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
          authorization = new Headers(init?.headers).get("Authorization");
          return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }) as typeof fetch;
        const ok = await app.inject({ method: "POST", url: path, headers: bearer(), payload: { workspaceId, apiKey: " tvly-typed " } });
        assert.equal(ok.json().status, "success");
        assert.equal(authorization, "Bearer tvly-typed");

        globalThis.fetch = (async () => new Response("bad key", { status: 401 })) as typeof fetch;
        const rejected = await app.inject({ method: "POST", url: path, headers: bearer(), payload: { workspaceId, apiKey: "tvly-wrong" } });
        assert.equal(rejected.statusCode, 200);
        assert.equal(rejected.json().status, "error");
        assert.match(rejected.json().message, /rejected the API key/);
        assert.doesNotMatch(rejected.body, /tvly-wrong/);
      });
    });
  });

  test("the cipher round-trips, authenticates, and isolates purposes", () => {
    const key = config.CONNECTOR_ENCRYPTION_KEY;
    const envelope = cipher.encrypt("value ✓ ünïcode", "ctx");
    assert.equal(cipher.decrypt(envelope, "ctx"), "value ✓ ünïcode");
    assert.notEqual(cipher.encrypt("value", "ctx"), cipher.encrypt("value", "ctx"), "every encryption uses a fresh IV");
    assert.throws(() => cipher.decrypt(envelope, "other"), /could not be decrypted/);
    const parts = envelope.split(":");
    parts[4] = Buffer.from("tampered").toString("base64url");
    assert.throws(() => cipher.decrypt(parts.join(":"), "ctx"), /could not be decrypted/);
    assert.throws(() => cipher.decrypt("secret:v1:only", "ctx"), /unsupported format/);
    assert.throws(() => new SecretCipher(key, "different-purpose").decrypt(envelope, "ctx"), /could not be decrypted/);
    assert.throws(() => new SecretCipher(Buffer.alloc(32, 7).toString("base64"), SECRET_PURPOSES.aiProviderCredentials).decrypt(envelope, "ctx"), /could not be decrypted/);
    assert.throws(() => new SecretCipher(Buffer.alloc(8).toString("base64"), "p"), /32 base64-encoded bytes/);
    assert.equal(SecretCipher.isEnvelope(envelope), true);
    assert.equal(SecretCipher.isEnvelope("sk-plain"), false);
    assert.equal(SecretCipher.isEnvelope(null), false);
    assert.equal(secretHint("sk-abcdefgh1234"), "1234");
    assert.equal(secretHint("short-key"), null);
  });
});
