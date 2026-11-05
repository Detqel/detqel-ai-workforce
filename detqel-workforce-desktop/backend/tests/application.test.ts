import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { testConfig as config } from "./fixtures/config.js";
import { bearer, memberRow, mockUnit, userId, workspaceId, workspaceRow } from "./fixtures/unit.js";
import { buildApp } from "../src/app.js";
import { createServices } from "../src/bootstrap/services.js";
import { UnitOfWork } from "../src/infrastructure/database/unit-of-work.js";
import type { DatabaseSession } from "../src/infrastructure/database/connection.js";

// The signed-in user owns the workspace used by these tests.
const ownedWorkspace = { findById: async () => workspaceRow(workspaceId, userId), getMembers: async () => [memberRow(userId, "owner")] };

test("all original API routes and documentation register with injected dependencies", async () => {
  let closed = 0;
  const app = await buildApp({ config, services: createServices(mockUnit(), async () => {}, config), logger: false, close: async () => { closed++; } });
  try {
    await app.ready();
    const routes = JSON.parse(await readFile(new URL("./fixtures/routes.json", import.meta.url), "utf8"));
    assert.ok(routes.length > 60);
    for (const route of routes) assert.ok(app.hasRoute(route), `${route.method} ${route.url}`);
    assert.equal((await app.inject("/docs/json")).statusCode, 200);
    const health = await app.inject("/health");
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().database, "connected");
  } finally { await app.close(); }
  assert.equal(closed, 1);
});

test("database outages fail readiness but preserve process liveness", async () => {
  const app = await buildApp({ config, services: createServices(mockUnit(), async () => { throw new Error("offline"); }, config), logger: false });
  try {
    const response = await app.inject("/health");
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().database, "disconnected");
    assert.equal((await app.inject("/health/live")).statusCode, 200);
  } finally { await app.close(); }
});

test("invalid identifiers and unbounded analytics requests fail before repository access", async () => {
  const app = await buildApp({ config, services: createServices(mockUnit({ workspaces: ownedWorkspace }), async () => {}, config), logger: false });
  const headers = bearer();
  try {
    for (const url of ["/api/users/not-a-uuid", `/api/analytics/activity-heatmap?workspaceId=${workspaceId}&days=1000000`, `/api/analytics/activities?workspaceId=${workspaceId}&limit=-1`, "/api/missions"]) {
      const response = await app.inject({ url, headers });
      assert.equal(response.statusCode, 400, url);
    }
    const response = await app.inject({ method: "POST", url: "/api/workspaces", headers, payload: { name: "  ", createdBy: userId } });
    assert.equal(response.statusCode, 400);
  } finally { await app.close(); }
});

test("notification and auth response envelopes remain compatible", async () => {
  const services = createServices(mockUnit({
    notifications: { listByUser: async () => [], countUnread: async () => 3 },
    users: { findByEmail: async () => null },
  }), async () => {}, config);
  const app = await buildApp({ config, services, logger: false });
  try {
    assert.deepEqual((await app.inject({ url: `/api/notifications?userId=${userId}`, headers: bearer() })).json(), { notifications: [], unreadCount: 3 });
    assert.deepEqual((await app.inject("/api/auth/check-user?email=nobody@example.com")).json(), { exists: false, hasWorkspace: false, workspaceCount: 0 });
  } finally { await app.close(); }
});

test("internal database errors are concealed and unique conflicts map to 409", async () => {
  const administrator = { listAuthWorkspaces: async () => [{ id: workspaceId, role: "owner", status: "active" }] };
  const unit = mockUnit({ workspaces: { ...administrator, getMembers: async () => { throw new Error("postgres://secret:password@internal"); } } });
  const app = await buildApp({ config, services: createServices(unit, async () => {}, config), logger: false });
  try {
    const response = await app.inject({ url: "/api/users", headers: bearer() });
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /secret|password|internal/);
  } finally { await app.close(); }
  const conflict = mockUnit({ workspaces: administrator, users: { findByEmail: async () => null, create: async () => { throw Object.assign(new Error("duplicate"), { code: "23505" }); } } });
  const second = await buildApp({ config, services: createServices(conflict, async () => {}, config), logger: false });
  try { assert.equal((await second.inject({ method: "POST", url: "/api/users", headers: bearer(), payload: { name: "User", email: "user@example.com" } })).statusCode, 409); }
  finally { await second.close(); }
});

test("transactions bind inherited and specialized repositories to the supplied session", async () => {
  const accessed: string[] = [];
  const transaction = {
    query: { users: { findFirst: async () => { accessed.push("transaction"); return undefined; } } },
    transaction: async (operation: (session: unknown) => Promise<unknown>) => operation(transaction),
  };
  const database = {
    transaction: async (operation: (session: unknown) => Promise<unknown>) => operation(transaction),
    query: { users: { findFirst: async () => { throw new Error("Global database used inside transaction"); } } },
  } as unknown as DatabaseSession;
  await new UnitOfWork(database).transaction(async repositories => { await repositories.users.findWithMemberships(userId); });
  assert.deepEqual(accessed, ["transaction"]);
});
