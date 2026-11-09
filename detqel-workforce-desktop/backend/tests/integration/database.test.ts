import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import { testConfig } from "../fixtures/config.js";
import { createDatabase, type DatabaseConnection } from "../../src/infrastructure/database/connection.js";
import { UnitOfWork } from "../../src/infrastructure/database/unit-of-work.js";
import { defaultMigrationsFolder, runMigrations } from "../../src/infrastructure/database/migrations/runner.js";
import { verifyMigrationState } from "../../src/infrastructure/database/migrations/verify.js";
import { initializeDatabase } from "../../src/infrastructure/database/provision.js";
import { seedReferenceData } from "../../src/infrastructure/database/seeds/reference.seed.js";
import { seedDemoData } from "../../src/infrastructure/database/seeds/demo.seed.js";
import * as schema from "../../src/infrastructure/database/schema/index.js";
import { WorkspaceService } from "../../src/modules/workspaces/services/workspace.service.js";
import { MissionService } from "../../src/modules/missions/services/mission.service.js";
import { createServices } from "../../src/bootstrap/services.js";
import { buildApp } from "../../src/app.js";
import { INITIAL_AI_PROVIDERS } from "../../src/constants/databaseSeedConstants.js";
import { LOOPBACK_HOST, PRIVATE_PORT_RANGE } from "../../src/constants/networkConstants.js";
import { prepareApplicationDatabase } from "../../src/desktop/infrastructure/application-database.js";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { SessionService } from "../../src/shared/security/session.js";
import { SecretCipher } from "../../src/shared/security/secret-cipher.js";
import { SECRET_PURPOSES } from "../../src/constants/authConstants.js";

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const migrationCount = readMigrationFiles({ migrationsFolder: defaultMigrationsFolder }).length;
describe("isolated PostgreSQL integration", { skip: !adminUrl }, () => {
  const name = `detqel_refactor_test_${randomUUID().replaceAll("-", "")}`;
  const legacyName = `${name}_legacy`;
  let connection: DatabaseConnection;
  let unit: UnitOfWork;
  let databaseUrl: string;
  let legacyUrl: string;
  const created: string[] = [];
  let ownerId: string;
  let workspaceId: string;
  const sessionFor = (userId: string) => new SessionService(testConfig.AUTH_SESSION_SECRET, testConfig.AUTH_SESSION_TTL_SECONDS).issue(userId).accessToken;
  // Sign-in goes through the License Portal; these tests stand in for it with a verified license already stored.
  const licensed = () => ({ portalUserId: randomUUID(), licenseId: randomUUID(), licenseToken: "LICENSE-TOKEN", licenseExpiresAt: new Date(Date.now() + 3_600_000) });

  before(async () => {
    const url = new URL(adminUrl!);
    url.pathname = `/${name}`;
    databaseUrl = url.toString();
    await initializeDatabase(databaseUrl, adminUrl);
    created.push(name);
    // Migration runners must serialize concurrent deployments and remain repeatable.
    await Promise.all([runMigrations(databaseUrl), runMigrations(databaseUrl)]);
    connection = createDatabase({ DATABASE_URL: databaseUrl, DB_POOL_MAX: 4, DB_IDLE_TIMEOUT: 5, DB_CONNECT_TIMEOUT: 5 });
    unit = new UnitOfWork(connection.db);
    ownerId = (await unit.users.create({ name: "Integration Owner", email: "owner@example.test" })).id;
  });

  after(async () => {
    await connection?.close();
    const admin = postgres(adminUrl!, { max: 1 });
    try {
      for (const database of created) {
        // Only databases uniquely created by this suite are eligible for cleanup.
        assert.match(database, /^detqel_refactor_test_[a-f0-9]{32}(?:_legacy|_desktop)?$/);
        await admin`DROP DATABASE ${admin(database)} WITH (FORCE)`;
      }
    } finally { await admin.end({ timeout: 5 }); }
  });

  test("fresh database has every table and every committed migration", async () => {
    const rows = await connection.db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = new Set(rows.map(row => row.table_name));
    for (const table of ["users", "workspaces", "user_notifications", "industry_domains", "seed_history", "ai_providers", "connector_types", "connector_catalog"]) assert.ok(tables.has(table));
    const migrations = await connection.db.execute(sql`SELECT hash FROM drizzle.__drizzle_migrations`);
    assert.equal(migrations.length, migrationCount);
    await verifyMigrationState(connection.db);
    await runMigrations(databaseUrl);
    assert.equal((await connection.db.execute(sql`SELECT hash FROM drizzle.__drizzle_migrations`)).length, migrationCount);
    assert.equal((await unit.users.findMany()).length, 1);
  });

  test("reference and demo seeds are repeatable and affect only their intended workspace", async () => {
    await Promise.all([seedReferenceData(connection.db), seedReferenceData(connection.db)]);
    assert.equal((await unit.domains.listAllDomains()).length, 7);
    const providers = await unit.settings.listProviders();
    assert.deepEqual(providers.map(provider => provider.id), INITIAL_AI_PROVIDERS.map(provider => provider.id));
    for (const provider of providers) {
      assert.equal(provider.apiKey, null);
      assert.equal(provider.isConnected, false);
      assert.equal(provider.status, "disconnected");
      assert.deepEqual(provider.models, []);
    }
    const other = await unit.workspaces.create({ name: "Unseeded", slug: "unseeded", createdBy: ownerId });
    await seedDemoData(connection.db);
    const countBefore = await connection.db.execute(sql`SELECT (SELECT count(*) FROM missions) AS missions, (SELECT count(*) FROM business_goals) AS goals, (SELECT count(*) FROM agents) AS agents`);
    await seedDemoData(connection.db);
    const countAfter = await connection.db.execute(sql`SELECT (SELECT count(*) FROM missions) AS missions, (SELECT count(*) FROM business_goals) AS goals, (SELECT count(*) FROM agents) AS agents`);
    assert.deepEqual(countAfter, countBefore);
    assert.equal((await unit.activities.listActivities(other.id)).length, 0);
    assert.equal((await connection.db.select().from(schema.seedHistory)).length, 1);
  });

  const managedTestEndpoint = adminUrl ? new URL(adminUrl) : undefined;
  const managedTestPort = Number(managedTestEndpoint?.port);
  test("desktop startup deploys pending migrations and providers before API readiness and preserves configuration on restart", {
    skip: managedTestEndpoint?.hostname !== LOOPBACK_HOST || managedTestPort < PRIVATE_PORT_RANGE.minimum || managedTestPort > PRIVATE_PORT_RANGE.maximum,
  }, async () => {
    const desktopName = `${name}_desktop`;
    const url = new URL(adminUrl!);
    url.pathname = `/${desktopName}`;
    const desktopUrl = url.toString();
    await initializeDatabase(desktopUrl, adminUrl);
    created.push(desktopName);
    const desktop = createDatabase({ DATABASE_URL: desktopUrl, DB_POOL_MAX: 1, DB_IDLE_TIMEOUT: 5, DB_CONNECT_TIMEOUT: 5 });
    const folder = await mkdtemp(path.join(tmpdir(), "detqel-startup-"));
    try {
      await mkdir(path.join(folder, "meta"));
      const journal = JSON.parse(await readFile(path.join(defaultMigrationsFolder, "meta", "_journal.json"), "utf8"));
      journal.entries = journal.entries.slice(0, 4);
      await writeFile(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) await copyFile(path.join(defaultMigrationsFolder, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
      await runMigrations(desktopUrl, folder);
      await assert.rejects(verifyMigrationState(desktop.db), /out of date/);
      const repositories = new UnitOfWork(desktop.db);
      const owner = await repositories.users.create({ email: "desktop-owner@example.test", name: "Preserved Owner" });
      const details: string[] = [];
      const prepare = () => prepareApplicationDatabase({ databaseUrl: desktopUrl, signal: new AbortController().signal, report: detail => details.push(detail) });
      await prepare();
      await verifyMigrationState(desktop.db);
      assert.ok(details.some(detail => detail.includes("AI providers")));
      assert.ok(await repositories.users.findById(owner.id));
      await repositories.users.update(owner.id, licensed());
      const app = await buildApp({ config: { ...testConfig, DATABASE_URL: desktopUrl }, verifyDatabase: true, logger: false });
      try {
        const anonymous = await app.inject("/api/settings/providers");
        assert.equal(anonymous.statusCode, 401);
        const response = await app.inject({ url: "/api/settings/providers", headers: { authorization: `Bearer ${sessionFor(owner.id)}` } });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json().providers.map((provider: { id: string }) => provider.id), INITIAL_AI_PROVIDERS.map(provider => provider.id));
      } finally { await app.close(); }

      const desktopWorkspace = await repositories.workspaces.create({ name: "Desktop Workspace", slug: "desktop-workspace", createdBy: owner.id });
      await repositories.settings.updateProvider(INITIAL_AI_PROVIDERS[0].id, {
        name: "Saved provider name", apiKey: "test-saved-provider-key", isConnected: true, status: "connected",
        models: [{ id: "saved-model", name: "Saved model", description: "Preserve discovered models" }],
      });
      await repositories.settings.upsertProvider({ id: "user-provider", name: "User Provider", iconKey: "custom" });
      await repositories.settings.upsertVyraSettings({ workspaceId: desktopWorkspace.id, selectedProviderId: INITIAL_AI_PROVIDERS[0].id, selectedModelId: "saved-model", apiKey: "saved-agent-key", isValidKey: true });
      const before = { providers: await repositories.settings.listProviders(), settings: await repositories.settings.getVyraSettings(desktopWorkspace.id) };
      await prepare();
      const after = { providers: await repositories.settings.listProviders(), settings: await repositories.settings.getVyraSettings(desktopWorkspace.id) };
      assert.deepEqual(after, before);
      assert.equal((await repositories.domains.listAllDomains()).length, 7);
      assert.ok(await repositories.users.findById(owner.id));

      // A partial catalog is repaired on later launches without changing the remaining providers.
      await desktop.db.delete(schema.aiProviders).where(eq(schema.aiProviders.id, INITIAL_AI_PROVIDERS[1].id));
      await prepare();
      assert.equal((await repositories.settings.listProviders()).length, INITIAL_AI_PROVIDERS.length + 1);
      assert.deepEqual(await repositories.settings.getProviderById(INITIAL_AI_PROVIDERS[0].id), before.providers.find(provider => provider.id === INITIAL_AI_PROVIDERS[0].id));
    } finally {
      await desktop.close();
      assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep));
      await rm(folder, { recursive: true, force: true });
    }
  });

  test("workspace creation rolls back workspace, domain, owner, and profile when a write fails", async () => {
    const real = unit.business.upsertProfile;
    const failing = Object.create(unit) as UnitOfWork;
    failing.transaction = operation => unit.transaction(async tx => {
      tx.business.upsertProfile = async () => { throw new Error("Injected profile failure"); };
      return operation(tx);
    });
    await assert.rejects(new WorkspaceService(failing).createWorkspace({ name: "Rollback Workspace", industry: "Rollback Industry", createdBy: ownerId }), /Injected profile failure/);
    assert.equal(await unit.workspaces.findBySlug("rollback-workspace"), null);
    assert.equal(await unit.domains.findByName("Rollback Industry"), null);
    assert.equal(unit.business.upsertProfile, real);
  });

  test("workspace workflows bind all repositories and update profile atomically", async () => {
    const service = new WorkspaceService(unit);
    const workspace = await service.createWorkspace({ name: "Working Workspace", industry: "Technology & SaaS", createdBy: ownerId });
    workspaceId = workspace.id;
    assert.equal((await unit.workspaces.getMembers(workspaceId))[0].user.id, ownerId);
    assert.equal((await unit.business.getProfile(workspaceId))?.businessName, "Working Workspace");
    await service.updateWorkspace(workspaceId, { name: "Renamed Workspace" });
    assert.equal((await unit.business.getProfile(workspaceId))?.businessName, "Renamed Workspace");
    await assert.rejects(service.createWorkspace({ name: " renamed workspace ", industry: "technology & saas", createdBy: ownerId }));
    await assert.rejects(service.createWorkspace({ name: "Unknown Creator", createdBy: randomUUID() }), /Workspace creator not found/);
    assert.equal(await unit.workspaces.findBySlug("unknown-creator"), null);
    const otherOwner = await unit.users.create({ name: "Other Owner", email: "other-owner@example.test" });
    const second = await service.createWorkspace({ name: "Renamed Workspace", industry: "Technology & SaaS", createdBy: otherOwner.id });
    assert.notEqual(second.id, workspaceId);
  });

  test("a failed mission event rolls back mission and agent assignments", async () => {
    const failing = Object.create(unit) as UnitOfWork;
    failing.transaction = operation => unit.transaction(async tx => {
      tx.missions.logEvent = async () => { throw new Error("Injected event failure"); };
      return operation(tx);
    });
    await assert.rejects(new MissionService(failing).createWithEvent({ workspaceId, title: "Rollback Mission", userRequest: "Investigate" }, undefined), /Injected event failure/);
    assert.equal((await unit.missions.listByWorkspace(workspaceId)).length, 0);
  });

  test("mission status filters apply before limit and notification counts stay correct", async () => {
    const mission = await new MissionService(unit).createWithEvent({ workspaceId, title: "Complete Mission", userRequest: "Investigate" }, undefined);
    await unit.missions.updateStatus(mission.id, "completed");
    await unit.missions.createMission({ workspaceId, title: "Newer Mission", userRequest: "Investigate", status: "planning" });
    const completed = await unit.missions.listByWorkspace(workspaceId, "completed", 1);
    assert.equal(completed.length, 1);
    assert.equal(completed[0].id, mission.id);
    await unit.notifications.create({ userId: ownerId, workspaceId, title: "One", message: "Unread" });
    await unit.notifications.create({ userId: ownerId, workspaceId, title: "Two", message: "Read", isRead: true });
    assert.equal(await unit.notifications.countUnread(ownerId, workspaceId), 1);
    await unit.notifications.markAllAsRead(ownerId, workspaceId);
    assert.equal(await unit.notifications.countUnread(ownerId, workspaceId), 0);
  });

  test("API workflows use real repositories and retain frontend response contracts", async () => {
    const app = await buildApp({ config: { ...testConfig, DATABASE_URL: databaseUrl }, services: createServices(unit, connection.check, testConfig), logger: false });
    try {
      const apiUser = await unit.users.create({ name: "API User", email: "api@example.test", username: "apiuser", ...licensed() });
      const authorization = { authorization: `Bearer ${sessionFor(apiUser.id)}` };
      const me = await app.inject({ url: "/api/auth/me", headers: authorization });
      assert.equal(me.statusCode, 200);
      assert.equal(me.json().hasWorkspace, false);
      assert.equal(me.json().user.license.id, apiUser.licenseId);
      assert.doesNotMatch(me.body, /passwordHash|LICENSE-TOKEN/);
      const create = await app.inject({ method: "POST", url: "/api/workspaces", headers: authorization, payload: { name: "API Workspace", createdBy: apiUser.id } });
      assert.equal(create.statusCode, 201);
      assert.equal(create.json().role, "owner");
      const workspaces = await app.inject({ url: `/api/workspaces/user/${apiUser.id}`, headers: authorization });
      assert.equal(workspaces.json().length, 1);
      // A different user can neither list these workspaces nor read their members.
      const outsider = await unit.users.create({ name: "Outsider", email: "outsider@example.test", username: "outsider", ...licensed() });
      const outsiderAuthorization = { authorization: `Bearer ${sessionFor(outsider.id)}` };
      assert.equal((await app.inject({ url: `/api/workspaces/user/${apiUser.id}`, headers: outsiderAuthorization })).statusCode, 403);
      assert.equal((await app.inject({ url: `/api/workspaces/${create.json().id}`, headers: outsiderAuthorization })).statusCode, 403);
      const overview = await app.inject({ url: `/api/workspaces/${create.json().id}`, headers: authorization });
      assert.equal(overview.statusCode, 200);
      assert.doesNotMatch(overview.body, /passwordHash|password_hash/);
    } finally { await app.close(); }
  });

  test("AI provider keys are encrypted at rest, migrated from plain text, and never returned", async () => {
    const services = createServices(unit, connection.check, testConfig);
    const cipher = new SecretCipher(testConfig.CONNECTOR_ENCRYPTION_KEY, SECRET_PURPOSES.aiProviderCredentials);
    const owner = (await unit.users.create({ name: "Key Owner", email: "key-owner@example.test" })).id;
    const first = (await unit.workspaces.create({ name: "Key Workspace A", slug: "key-workspace-a", createdBy: owner })).id;
    const second = (await unit.workspaces.create({ name: "Key Workspace B", slug: "key-workspace-b", createdBy: owner })).id;
    const placeholder = (await unit.workspaces.create({ name: "Key Workspace C", slug: "key-workspace-c", createdBy: owner })).id;

    // Rows written before encryption existed: plain text keys, plus the decorative key migration 0004 used to seed.
    await unit.settings.updateProvider("openai", { apiKey: "sk-legacy-plaintext-key-1234" });
    await unit.settings.upsertVyraSettings({ workspaceId: first, selectedProviderId: "openai", apiKey: "sk-vyra-legacy-key-5678", isValidKey: true, keyStatus: "ok" });
    await unit.settings.upsertVyraSettings({ workspaceId: placeholder, apiKey: "sk-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", isValidKey: true, keyStatus: "Valid key" });

    const migrated = await services.settings.protectStoredCredentials();
    assert.equal(migrated.providers, 1);
    assert.equal(migrated.vyraSettings, 2);
    assert.deepEqual(await services.settings.protectStoredCredentials(), { providers: 0, vyraSettings: 0 }, "the sweep is idempotent");

    const storedProvider = (await unit.settings.getProviderById("openai"))!;
    assert.ok(SecretCipher.isEnvelope(storedProvider.apiKey));
    assert.doesNotMatch(storedProvider.apiKey!, /sk-legacy-plaintext-key-1234/);
    assert.equal(cipher.decrypt(storedProvider.apiKey!, "ai_providers:openai"), "sk-legacy-plaintext-key-1234");
    assert.throws(() => cipher.decrypt(storedProvider.apiKey!, "ai_providers:groq"), "ciphertext is bound to its row");
    const storedVyra = (await unit.settings.getVyraSettings(first))!;
    assert.equal(cipher.decrypt(storedVyra.apiKey!, `vyra_settings:${first}`), "sk-vyra-legacy-key-5678");
    const storedPlaceholder = (await unit.settings.getVyraSettings(placeholder))!;
    assert.deepEqual([storedPlaceholder.apiKey, storedPlaceholder.isValidKey, storedPlaceholder.keyStatus], ["", false, ""], "the decorative key is removed, not encrypted");

    // Clients see that a key exists and its last characters, never the key.
    const openai = (await services.settings.listProviders()).find(provider => provider.id === "openai")!;
    assert.equal(openai.hasApiKey, true);
    assert.equal(openai.apiKeyHint, "1234");
    assert.equal("apiKey" in openai, false);
    const vyra = await services.settings.getVyraSettings(first);
    assert.deepEqual([vyra.hasApiKey, vyra.apiKeyHint, "apiKey" in vyra], [true, "5678", false]);
    assert.equal((await services.settings.getVyraSettings(placeholder)).hasApiKey, false);

    // Omitting the key keeps it, a new value replaces it, and an empty value removes it. A new key resets the old status.
    await services.settings.updateVyraSettings(first, { instructions: { core: "x", behaviour: "", knowledge: "", boundaries: "", responseStyle: "" } });
    assert.equal(cipher.decrypt((await unit.settings.getVyraSettings(first))!.apiKey!, `vyra_settings:${first}`), "sk-vyra-legacy-key-5678");
    const replaced = await services.settings.updateVyraSettings(first, { apiKey: "sk-brand-new-key-9999" });
    assert.deepEqual([replaced.apiKeyHint, replaced.isValidKey, replaced.keyStatus], ["9999", false, ""]);
    assert.equal((await services.settings.updateVyraSettings(first, { apiKey: "" })).hasApiKey, false);
    assert.equal((await unit.settings.getVyraSettings(first))!.apiKey, "");

    // Settings belong to one workspace: a workspace without a row gets its own and cannot see or change another's.
    await services.settings.updateVyraSettings(first, { apiKey: "sk-first-workspace-key-0001", selectedModelId: "model-a" });
    const untouched = await services.settings.getVyraSettings(second);
    assert.notEqual(untouched.id, (await unit.settings.getVyraSettings(first))!.id);
    assert.deepEqual([untouched.workspaceId, untouched.hasApiKey, untouched.selectedModelId], [second, false, ""]);
    await services.settings.updateVyraSettings(second, { selectedModelId: "model-b" });
    assert.equal((await unit.settings.getVyraSettings(first))!.selectedModelId, "model-a");
    assert.equal((await unit.settings.getVyraSettings(first))!.workspaceId, first);

    // The Tavily key is stored encrypted in its own column, read back only server-side, and kept per workspace.
    await assert.rejects(services.settings.resolveWebSearchKey(first), /Add a Tavily API key in Settings/);
    const withSearch = await services.settings.updateVyraSettings(first, { tavilyApiKey: "  tvly-first-workspace-4321  " });
    assert.deepEqual([withSearch.hasTavilyApiKey, withSearch.tavilyApiKeyHint, "tavilyApiKey" in withSearch], [true, "4321", false]);
    const storedSearchKey = (await unit.settings.getVyraSettings(first))!.tavilyApiKey;
    assert.match(storedSearchKey, /^secret:v1:/);
    assert.equal(cipher.decrypt(storedSearchKey, `vyra_settings:tavily:${first}`), "tvly-first-workspace-4321");
    assert.equal(await services.settings.resolveWebSearchKey(first), "tvly-first-workspace-4321");
    assert.equal(cipher.decrypt((await unit.settings.getVyraSettings(first))!.apiKey!, `vyra_settings:${first}`), "sk-first-workspace-key-0001", "the model key is unaffected");
    await assert.rejects(services.settings.resolveWebSearchKey(second), /Add a Tavily API key in Settings/);
    assert.equal((await services.settings.updateVyraSettings(first, { tavilyApiKey: "" })).hasTavilyApiKey, false);
    await assert.rejects(services.settings.resolveWebSearchKey(first), /Add a Tavily API key in Settings/);
  });

  test("migration failure leaves no partial DDL and checksum mismatches are rejected", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "detqel-migrations-"));
    try {
      await mkdir(path.join(folder, "meta"));
      const journal = JSON.parse(await readFile(path.join(defaultMigrationsFolder, "meta", "_journal.json"), "utf8"));
      for (const entry of journal.entries) await copyFile(path.join(defaultMigrationsFolder, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
      const original = await readFile(path.join(folder, `${journal.entries[0].tag}.sql`), "utf8");
      await writeFile(path.join(folder, `${journal.entries[0].tag}.sql`), original + "\n-- altered");
      await writeFile(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
      await assert.rejects(runMigrations(databaseUrl, folder), /Migration history does not match/);
      await writeFile(path.join(folder, `${journal.entries[0].tag}.sql`), original);
      const failureTag = `${String(journal.entries.length).padStart(4, "0")}_failure`;
      journal.entries.push({ idx: journal.entries.length, version: "7", when: journal.entries.at(-1).when + 1, tag: failureTag, breakpoints: true });
      await writeFile(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
      await writeFile(path.join(folder, `${failureTag}.sql`), "CREATE TABLE should_rollback (id int);\n--> statement-breakpoint\nSELECT * FROM deliberately_missing_table;");
      await assert.rejects(runMigrations(databaseUrl, folder));
      const [table] = await connection.db.execute(sql`SELECT to_regclass('public.should_rollback') AS name`);
      assert.equal(table.name, null);
      await runMigrations(databaseUrl);
    } finally {
      assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep));
      await rm(folder, { recursive: true, force: true });
    }
  });

  test("upgrades adopt the industry table previously created outside migrations", async () => {
    const url = new URL(adminUrl!); url.pathname = `/${legacyName}`; legacyUrl = url.toString();
    await initializeDatabase(legacyUrl, adminUrl); created.push(legacyName);
    const folder = await mkdtemp(path.join(tmpdir(), "detqel-legacy-"));
    const legacy = createDatabase({ DATABASE_URL: legacyUrl, DB_POOL_MAX: 1, DB_IDLE_TIMEOUT: 5, DB_CONNECT_TIMEOUT: 5 });
    try {
      await mkdir(path.join(folder, "meta"));
      const journal = JSON.parse(await readFile(path.join(defaultMigrationsFolder, "meta", "_journal.json"), "utf8"));
      journal.entries = journal.entries.slice(0, 3);
      await writeFile(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
      for (const entry of journal.entries) await copyFile(path.join(defaultMigrationsFolder, `${entry.tag}.sql`), path.join(folder, `${entry.tag}.sql`));
      await runMigrations(legacyUrl, folder);
      await assert.rejects(verifyMigrationState(legacy.db), /out of date/);
      await legacy.db.execute(sql`CREATE TABLE industry_domains (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(150) NOT NULL UNIQUE, description text, is_custom boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
      await legacy.db.insert(schema.industryDomains).values({ name: "Preserved Industry", isCustom: true });
      // Reproduce untracked notifications and duplicated seed rows from the existing database.
      await legacy.db.execute(sql`CREATE TABLE user_notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE, title varchar(255) NOT NULL, message text NOT NULL, type varchar(50) NOT NULL DEFAULT 'info', is_read boolean NOT NULL DEFAULT false, link varchar(255), created_at timestamptz NOT NULL DEFAULT now())`);
      await legacy.db.execute(sql`CREATE INDEX idx_user_notifications_user_created ON user_notifications(user_id, created_at)`);
      await legacy.db.execute(sql`CREATE INDEX idx_user_notifications_user_unread ON user_notifications(user_id, is_read)`);
      const [seedOwner] = await legacy.db.insert(schema.users).values({ email: "seed-owner@example.test", name: "Seed Owner" }).returning();
      const [otherOwner] = await legacy.db.insert(schema.users).values({ email: "second-owner@example.test", name: "Second Owner" }).returning();
      const [seedWorkspace] = await legacy.db.insert(schema.workspaces).values({ name: "Same Business", slug: "same-business", createdBy: seedOwner.id }).returning();
      const [otherWorkspace] = await legacy.db.insert(schema.workspaces).values({ name: "Same Business", slug: "same-business-other", createdBy: otherOwner.id }).returning();
      const memberships = await legacy.db.insert(schema.workspaceMembers).values(Array.from({ length: 4 }, () => ({ workspaceId: seedWorkspace.id, userId: seedOwner.id, role: "owner" }))).returning();
      const profiles = await legacy.db.insert(schema.businessProfile).values(Array.from({ length: 4 }, () => ({ workspaceId: seedWorkspace.id, businessName: "Same Business", description: "Preserve this" }))).returning();
      const [notification] = await legacy.db.insert(schema.userNotifications).values({ userId: seedOwner.id, workspaceId: seedWorkspace.id, title: "Preserve", message: "Existing notification" }).returning();
      const [distinctProfile] = await legacy.db.insert(schema.businessProfile).values({ workspaceId: seedWorkspace.id, businessName: "Distinct business content" }).returning();
      await assert.rejects(runMigrations(legacyUrl), /unique index/i);
      assert.equal((await legacy.db.select().from(schema.workspaceMembers)).length, 4);
      assert.equal((await legacy.db.select().from(schema.businessProfile)).length, 5);
      const [archiveBeforeSuccess] = await legacy.db.execute(sql`SELECT to_regclass('drizzle.__reconciled_rows') AS name`);
      assert.equal(archiveBeforeSuccess.name, null);
      // Remove only this deliberately conflicting test fixture before testing successful reconciliation.
      await legacy.db.delete(schema.businessProfile).where(eq(schema.businessProfile.id, distinctProfile.id));
      await runMigrations(legacyUrl);
      await verifyMigrationState(legacy.db);
      assert.equal((await new UnitOfWork(legacy.db).domains.findByName("Preserved Industry"))?.isCustom, true);
      const legacyUnit = new UnitOfWork(legacy.db);
      assert.equal((await legacyUnit.workspaces.getMembers(seedWorkspace.id)).length, 1);
      assert.equal((await legacy.db.select().from(schema.businessProfile).where(eq(schema.businessProfile.workspaceId, seedWorkspace.id))).length, 1);
      assert.ok(await legacyUnit.workspaces.findById(otherWorkspace.id));
      assert.equal((await legacyUnit.notifications.listByUser(seedOwner.id))[0].id, notification.id);
      const archived = await legacy.db.execute(sql`SELECT table_name, removed_id, retained_id, record FROM drizzle.__reconciled_rows`);
      assert.equal(archived.length, 6);
      for (const row of archived) {
        const original = (row.table_name === "workspace_members" ? memberships : profiles).find(record => record.id === row.removed_id);
        assert.ok(original);
        assert.equal((row.record as { id: string }).id, original.id);
        assert.equal((row.record as { workspace_id: string }).workspace_id, seedWorkspace.id);
      }
      const admin = await legacyUnit.users.create({ email: "admin@detqel.ai", name: "Legacy Demo" });
      const workspace = await legacyUnit.workspaces.create({ name: "ACME Retail", slug: "acme-retail", createdBy: admin.id });
      await legacyUnit.business.upsertProfile(workspace.id, { businessName: "Legacy Profile" });
      await seedDemoData(legacy.db);
      assert.equal((await legacyUnit.workforce.findMany()).length, 0);
      assert.equal((await legacyUnit.business.getProfile(workspace.id))?.businessName, "Legacy Profile");
    } finally {
      await legacy.close();
      assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep));
      await rm(folder, { recursive: true, force: true });
    }
  });
});
