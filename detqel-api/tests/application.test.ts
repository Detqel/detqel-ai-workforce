import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildApp } from "../src/app.js";
import { createServices } from "../src/bootstrap/services.js";
import type { IUnitOfWork } from "../src/shared/contracts/unit-of-work.js";
import { UnitOfWork } from "../src/infrastructure/database/unit-of-work.js";
import type { DatabaseSession } from "../src/infrastructure/database/connection.js";
import { envSchema } from "../src/config/env.js";

const userId = "b7bc2723-5cdd-4c33-b8b7-260825d65030";
const config = envSchema.parse({ DATABASE_URL: "postgres://test:test@localhost:5432/test", NODE_ENV: "test" });
function mockUnit(overrides: Record<string, Record<string, unknown>> = {}): IUnitOfWork {
  const strictRepository = (name: string) => new Proxy(overrides[name] ?? {}, { get: (object, key: string) => object[key] ?? (() => { throw new Error(`Unexpected repository access: ${name}.${key}`); }) });
  const unit = Object.fromEntries(["users", "workspaces", "business", "connections", "workforce", "missions", "analytics", "automations", "activities", "notifications", "domains"].map(name => [name, strictRepository(name)])) as unknown as IUnitOfWork;
  unit.transaction = async operation => operation(unit);
  return unit;
}

test("all original API routes and documentation register with injected dependencies", async () => {
  let closed = 0;
  const app = await buildApp({ config, services: createServices(mockUnit(), async () => {}), logger: false, close: async () => { closed++; } });
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
  const app = await buildApp({ config, services: createServices(mockUnit(), async () => { throw new Error("offline"); }), logger: false });
  try {
    const response = await app.inject("/health");
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().database, "disconnected");
    assert.equal((await app.inject("/health/live")).statusCode, 200);
  } finally { await app.close(); }
});

test("invalid identifiers and unbounded analytics requests fail before repository access", async () => {
  const app = await buildApp({ config, services: createServices(mockUnit(), async () => {}), logger: false });
  try {
    for (const url of ["/api/users/not-a-uuid", `/api/analytics/activity-heatmap?workspaceId=${userId}&days=1000000`, `/api/analytics/activities?workspaceId=${userId}&limit=-1`, "/api/missions"]) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 400, url);
    }
    const response = await app.inject({ method: "POST", url: "/api/workspaces", payload: { name: "  ", createdBy: userId } });
    assert.equal(response.statusCode, 400);
  } finally { await app.close(); }
});

test("notification and auth response envelopes remain compatible", async () => {
  const services = createServices(mockUnit({
    notifications: { listByUser: async () => [], countUnread: async () => 3 },
    users: { findByEmail: async () => null },
  }), async () => {});
  const app = await buildApp({ config, services, logger: false });
  try {
    assert.deepEqual((await app.inject(`/api/notifications?userId=${userId}`)).json(), { notifications: [], unreadCount: 3 });
    assert.deepEqual((await app.inject("/api/auth/check-user?email=nobody@example.com")).json(), { exists: false, hasWorkspace: false, workspaceCount: 0 });
  } finally { await app.close(); }
});

test("internal database errors are concealed and unique conflicts map to 409", async () => {
  const unit = mockUnit({ users: { findMany: async () => { throw new Error("postgres://secret:password@internal"); } } });
  const app = await buildApp({ config, services: createServices(unit, async () => {}), logger: false });
  try {
    const response = await app.inject("/api/users");
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /secret|password|internal/);
  } finally { await app.close(); }
  const conflict = mockUnit({ users: { findByEmail: async () => null, create: async () => { throw Object.assign(new Error("duplicate"), { code: "23505" }); } } });
  const second = await buildApp({ config, services: createServices(conflict, async () => {}), logger: false });
  try { assert.equal((await second.inject({ method: "POST", url: "/api/users", payload: { name: "User", email: "user@example.com" } })).statusCode, 409); }
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
