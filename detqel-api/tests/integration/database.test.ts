import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, copyFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
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

const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
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
        assert.match(database, /^detqel_refactor_test_[a-f0-9]{32}(?:_legacy)?$/);
        await admin`DROP DATABASE ${admin(database)} WITH (FORCE)`;
      }
    } finally { await admin.end({ timeout: 5 }); }
  });

  test("fresh database has every table and exactly four tracked migrations", async () => {
    const rows = await connection.db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = new Set(rows.map(row => row.table_name));
    for (const table of ["users", "workspaces", "user_notifications", "industry_domains", "seed_history"]) assert.ok(tables.has(table));
    const migrations = await connection.db.execute(sql`SELECT hash FROM drizzle.__drizzle_migrations`);
    assert.equal(migrations.length, 4);
    await verifyMigrationState(connection.db);
    await runMigrations(databaseUrl);
    assert.equal((await connection.db.execute(sql`SELECT hash FROM drizzle.__drizzle_migrations`)).length, 4);
    assert.equal((await unit.users.findMany()).length, 1);
  });

  test("reference and demo seeds are repeatable and affect only their intended workspace", async () => {
    await Promise.all([seedReferenceData(connection.db), seedReferenceData(connection.db)]);
    assert.equal((await unit.domains.listAllDomains()).length, 7);
    const other = await unit.workspaces.create({ name: "Unseeded", slug: "unseeded", createdBy: ownerId });
    await seedDemoData(connection.db);
    const countBefore = await connection.db.execute(sql`SELECT (SELECT count(*) FROM missions) AS missions, (SELECT count(*) FROM business_goals) AS goals, (SELECT count(*) FROM agents) AS agents`);
    await seedDemoData(connection.db);
    const countAfter = await connection.db.execute(sql`SELECT (SELECT count(*) FROM missions) AS missions, (SELECT count(*) FROM business_goals) AS goals, (SELECT count(*) FROM agents) AS agents`);
    assert.deepEqual(countAfter, countBefore);
    assert.equal((await unit.activities.listActivities(other.id)).length, 0);
    assert.equal((await connection.db.select().from(schema.seedHistory)).length, 1);
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
    const app = await buildApp({ services: createServices(unit, connection.check), logger: false });
    try {
      const registration = await app.inject({ method: "POST", url: "/api/auth/register", payload: { name: "API User", email: "api@example.test", password: "password", username: "apiuser" } });
      assert.equal(registration.statusCode, 201);
      assert.equal(registration.json().hasWorkspace, false);
      assert.equal(registration.json().user.passwordHash, undefined);
      const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { identifier: "apiuser", password: "password" } });
      assert.equal(login.statusCode, 200);
      assert.equal(login.json().user.id, registration.json().user.id);
      const create = await app.inject({ method: "POST", url: "/api/workspaces", payload: { name: "API Workspace", createdBy: registration.json().user.id } });
      assert.equal(create.statusCode, 201);
      assert.equal(create.json().role, "owner");
      const workspaces = await app.inject(`/api/workspaces/user/${registration.json().user.id}`);
      assert.equal(workspaces.json().length, 1);
    } finally { await app.close(); }
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
      journal.entries.push({ idx: 4, version: "7", when: journal.entries[3].when + 1, tag: "0004_failure", breakpoints: true });
      await writeFile(path.join(folder, "meta", "_journal.json"), JSON.stringify(journal));
      await writeFile(path.join(folder, "0004_failure.sql"), "CREATE TABLE should_rollback (id int);\n--> statement-breakpoint\nSELECT * FROM deliberately_missing_table;");
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
      await assert.rejects(runMigrations(legacyUrl), /unique index/);
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
