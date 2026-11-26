import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { createDatabase, type DatabaseConnection } from "../../src/infrastructure/database/connection.js";
import { runMigrations } from "../../src/infrastructure/database/migrations/runner.js";
import { initializeDatabase } from "../../src/infrastructure/database/provision.js";
import * as schema from "../../src/infrastructure/database/schema/index.js";
import { UnitOfWork } from "../../src/infrastructure/database/unit-of-work.js";
import { createBrainServices, type BrainServices } from "../../src/modules/brain/services/brain-services.js";
import { systemActor, userActor, type BrainActor } from "../../src/modules/brain/services/brain-types.js";
import type { IBrainModel } from "../../src/modules/brain/services/workforce/brain-model.js";
import { isPseudonym } from "../../src/modules/brain/services/data/data-protection.js";
import { postgresOperations } from "../../src/modules/connections/operations/data-operations.js";
import type { BrainDataset } from "../../src/shared/types/entities.js";

/**
 * The Business Brain end to end on a real, isolated PostgreSQL database: Medallion ingestion through a stubbed
 * HTTP connector, ontology mapping and entity resolution, governed metrics with access policies, the Intelligence
 * Engine, the assistant (rule planner, no model), durable workflows with payload-bound approvals, and the scheduler.
 */
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const regions = ["EMEA", "APAC", "NA"];
const stages = ["won", "open", "lost"];

function opportunityRecords(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    let n = 0;
    for (let month = 0; month < 18; month++) {
        for (let index = 0; index < 9; index++) {
            n++;
            rows.push({
                opportunity_id: `OPP-${String(n).padStart(4, "0")}`, name: `Deal ${n}`, account_id: `ACC-${(n % 6) + 1}`,
                amount: 1000 + month * 120 + index * 35 + (index % 3 === 0 ? 400 : 0), stage: stages[index % 3],
                close_date: new Date(Date.UTC(2025, month, 1 + index * 3)).toISOString().slice(0, 10), region: regions[index % 3], owner: `rep${index % 4}@example.com`,
            });
        }
    }
    // A malformed amount, a record without a key, and an opportunity for an unknown account.
    rows.push({ opportunity_id: "OPP-BAD", name: "Malformed", account_id: "ACC-1", amount: "not-a-number", stage: "open", close_date: "2026-05-02", region: "NA", owner: "x@example.com" });
    rows.push({ name: "No key", account_id: "ACC-2", amount: 10, stage: "open", close_date: "2026-05-03", region: "NA" });
    rows.push({ opportunity_id: "OPP-ORPHAN", name: "Orphan", account_id: "ACC-404", amount: 50, stage: "open", close_date: "2026-05-04", region: "NA", owner: "y@example.com" });
    return rows;
}
const accountRecords = Array.from({ length: 6 }, (_, index) => ({
    account_id: `ACC-${index + 1}`, name: index === 5 ? "Acme Corp" : index === 4 ? "ACME Corp." : `Account ${index + 1}`,
    segment: index % 2 ? "SMB" : "Enterprise", region: regions[index % 3],
}));

describe("Business Brain on PostgreSQL", { skip: !adminUrl }, () => {
    const name = `detqel_brain_test_${randomUUID().replaceAll("-", "")}`;
    let connection: DatabaseConnection;
    let unit: UnitOfWork;
    let brain: BrainServices;
    let workspaceId: string;
    let connectionId: string;
    let owner: BrainActor;
    let admin: BrainActor;
    let staff: BrainActor;
    let accounts: BrainDataset;
    let opportunities: BrainDataset;
    const writes: Array<Record<string, unknown>> = [];
    /** Readers for connections added by later tests, such as a real PostgreSQL business database. */
    const readers = new Map<string, unknown>();
    const encryptionKey = randomBytes(32).toString("base64");
    const sourceName = `${name}_source`;
    let sourceSql: ReturnType<typeof postgres> | null = null;

    const waitForSync = async (datasetId: string, previousRunId: string | null) => {
        for (let attempt = 0; attempt < 150; attempt++) {
            const dataset = await unit.brainData.findDataset(datasetId, workspaceId);
            if (dataset?.lastRunId && dataset.lastRunId !== previousRunId && !dataset.leaseOwner) return dataset;
            await sleep(100);
        }
        throw new Error("The pipeline run did not finish in time");
    };
    const syncNow = async (dataset: BrainDataset) => {
        const before = await unit.brainData.findDataset(dataset.id, workspaceId);
        await brain.datasets.sync(owner, dataset.id, false);
        return waitForSync(dataset.id, before!.lastRunId);
    };
    const waitForWorkflow = async (runId: string, statuses: string[]) => {
        for (let attempt = 0; attempt < 150; attempt++) {
            const run = await unit.brainWorkforce.findWorkflowRun(runId, workspaceId);
            if (run && statuses.includes(run.status) && !run.leaseOwner) return run;
            await brain.engine.tick(10);
            await sleep(100);
        }
        const run = await unit.brainWorkforce.findWorkflowRun(runId, workspaceId);
        throw new Error(`The workflow run is still ${run?.status}`);
    };
    const datasetInput = (overrides: Record<string, unknown>) => ({
        connectionId, domain: "sales", syncMode: "full", classification: "internal", freshnessSlaMinutes: 1440, qualityThreshold: 0.9, driftPolicy: "accept", ...overrides,
    }) as never;

    before(async () => {
        const url = new URL(adminUrl!);
        url.pathname = `/${name}`;
        await initializeDatabase(url.toString(), adminUrl);
        await runMigrations(url.toString());
        connection = createDatabase({ DATABASE_URL: url.toString(), DB_POOL_MAX: 5, DB_IDLE_TIMEOUT: 5, DB_CONNECT_TIMEOUT: 10 });
        const db = connection.db;
        unit = new UnitOfWork(db);
        const [ownerUser, adminUser, staffUser] = await db.insert(schema.users).values([
            { email: "owner@brain.test", name: "Owner" }, { email: "admin@brain.test", name: "Admin" }, { email: "staff@brain.test", name: "Staff" },
        ]).returning();
        const [workspace] = await db.insert(schema.workspaces).values({ name: "Brain", slug: `brain-${randomUUID().slice(0, 8)}`, createdBy: ownerUser.id }).returning();
        workspaceId = workspace.id;
        const roles = new Map([[ownerUser.id, "owner"], [adminUser.id, "admin"], [staffUser.id, "employee"]]);
        await db.insert(schema.workspaceMembers).values([...roles].map(([userId, role]) => ({ workspaceId, userId, role })));
        const [definition] = await db.insert(schema.connectionDefinitions).values({ workspaceId, code: `http-${randomUUID().slice(0, 8)}`, name: "HTTP", adapterKey: "http", configSchema: { fields: [] } as never, isEnabled: true }).returning();
        const [crm] = await db.insert(schema.connections).values({ workspaceId, name: "CRM API", provider: "http", definitionId: definition.id, status: "connected" }).returning();
        connectionId = crm.id;
        const reader = {
            id: crm.id, name: crm.name, provider: "http", adapterKey: "http", configuration: {}, metadata: {},
            handle: {
                execute: async ({ operation, parameters }: { operation: string; parameters: Record<string, unknown> }) => {
                    if (operation === "fetch") return { data: { items: parameters.path === "/accounts" ? accountRecords : opportunityRecords() } };
                    if (operation === "write") { writes.push(parameters); return { data: { ok: true }, metadata: { status: 202 } }; }
                    throw new Error(`Unexpected operation ${operation}`);
                },
            },
        };
        const model: IBrainModel = { available: async () => false, structured: async () => { throw new Error("No model is configured"); } };
        brain = createBrainServices(unit, {
            connections: { readerFor: async (id: string) => (readers.get(id) ?? reader) as never },
            gateway: null as never, keys: null as never, models: null as never, prompts: null as never,
            webSearch: { assertConfigured: async () => { throw new Error("Web search is not configured"); }, search: async () => [] },
            roleOf: async userId => roles.get(userId) ?? null,
            encryptionKey,
            model,
        });
        owner = userActor(ownerUser.id, workspaceId, "owner");
        admin = userActor(adminUser.id, workspaceId, "admin");
        staff = userActor(staffUser.id, workspaceId, "employee");
    });

    after(async () => {
        await brain?.scheduler.stop();
        await connection?.close();
        await sourceSql?.end({ timeout: 5 });
        const client = postgres(adminUrl!, { max: 1, onnotice: () => {} });
        try {
            assert.match(name, /^detqel_brain_test_[a-f0-9]{32}$/);
            await client`DROP DATABASE IF EXISTS ${client(name)} WITH (FORCE)`;
            await client`DROP DATABASE IF EXISTS ${client(sourceName)} WITH (FORCE)`;
        } finally { await client.end({ timeout: 5 }); }
    });

    test("only connections linked in the Data Layer are business sources", async () => {
        const [definition] = await connection.db.insert(schema.connectionDefinitions).values({ workspaceId, code: `repo-${randomUUID().slice(0, 8)}`, name: "GitHub", adapterKey: "repository.github", configSchema: { fields: [] } as never, isEnabled: true }).returning();
        const [personal] = await connection.db.insert(schema.connections).values({ workspaceId, name: "Personal repo", provider: "github", definitionId: definition.id, status: "connected" }).returning();
        await assert.rejects(brain.datasets.create(owner, datasetInput({ name: "Early", source: { path: "/accounts" } })), /Link this connection/);
        await assert.rejects(brain.sources.link(owner, personal.id), /cannot supply a dataset/);
        await assert.rejects(brain.sources.link(userActor(randomUUID(), randomUUID(), "owner"), connectionId), /not found/, "another workspace cannot link this connection");
        const linked = await brain.sources.link(owner, connectionId);
        assert.equal(linked.sourceKind, "api");
        assert.equal((await brain.sources.link(owner, connectionId)).linked, true, "linking twice is harmless");
        const listed = await brain.sources.list(owner);
        assert.deepEqual(listed.map(source => [source.name, source.linked, source.sourceKind]), [["CRM API", true, "api"], ["Personal repo", false, null]]);
        await assert.rejects(brain.sources.tables(owner, connectionId), /database connections only/);
        const overview = await brain.overview.overview(owner, "30d" as never) as unknown as { telemetry: { sources: { connected: number; total: number; providers: string[] } } };
        assert.deepEqual(overview.telemetry.sources, { connected: 1, total: 1, addedInPeriod: 1, providers: ["CRM API"] });
    });

    test("registration runs the initial ingestion into Bronze, Silver and Gold", async () => {
        const createdAccounts = await brain.datasets.create(owner, datasetInput({ name: "Accounts", source: { path: "/accounts", recordsPath: "items" }, primaryKeyField: "account_id" }));
        accounts = await waitForSync(createdAccounts.id, null);
        const createdOpportunities = await brain.datasets.create(owner, datasetInput({ name: "Opportunities", source: { path: "/opportunities", recordsPath: "items" }, primaryKeyField: "opportunity_id", timeField: "close_date" }));
        opportunities = await waitForSync(createdOpportunities.id, null);
        assert.equal(accounts.lastRunStatus, "succeeded");
        assert.equal(opportunities.lastRunStatus, "succeeded");
        assert.ok(opportunities.publishedVersion > 0);
        assert.equal(opportunities.currentSchema.find(field => field.name === "amount")?.type, "integer", "one malformed value must not widen the column");
        await assert.rejects(brain.datasets.create(owner, datasetInput({ name: "accounts", source: { path: "/accounts" } })), /already exists/);
    });

    test("quality rules quarantine bad records and the dataset reports counts, lineage and reasons", async () => {
        await brain.datasets.createRule(owner, opportunities.id, { ruleType: "referential", field: "account_id", config: { datasetId: accounts.id }, severity: "error", enabled: true });
        await brain.datasets.createRule(owner, opportunities.id, { ruleType: "unique", field: "name", config: {}, severity: "warning", enabled: true });
        opportunities = await syncNow(opportunities);
        assert.equal(opportunities.lastRunStatus, "succeeded");
        const view = await brain.datasets.get(owner, opportunities.id);
        assert.ok((view.counts?.silver ?? 0) >= 162, JSON.stringify(view.counts));
        const codes = new Set(view.quarantineReasons.map(reason => reason.code));
        for (const code of ["type_mismatch", "missing_key"]) assert.ok(codes.has(code), `${code} in ${[...codes].join(", ")}`);
        assert.ok(view.quarantineReasons.length >= 3, JSON.stringify(view.quarantineReasons));
        assert.equal((await brain.datasets.list(owner)).length, 2);
        const lineage = await brain.datasets.lineage(owner, opportunities.id);
        assert.equal(lineage.source.connectionName, "CRM API");
        assert.ok(lineage.columns.some(column => column.field === "amount"));
        assert.ok((await brain.datasets.quarantine(owner, { datasetId: opportunities.id })).length >= 3);
    });

    test("ontology mappings resolve canonical entities and relationships without clobbering names", async () => {
        await brain.ontology.applyTemplate(owner, "sales");
        await brain.ontology.suggestMappings(owner, opportunities.id, { useAgent: false });
        await brain.ontology.suggestMappings(owner, accounts.id, { useAgent: false });
        const proposed = await brain.ontology.listMappings(owner, { status: "proposed" });
        const pick = (datasetId: string, field: string) => proposed.find(mapping => mapping.datasetId === datasetId && mapping.sourceField === field);
        for (const mapping of [pick(opportunities.id, "account_id"), pick(accounts.id, "account_id"), pick(accounts.id, "name")]) {
            if (mapping) await brain.ontology.reviewMapping(admin, mapping.id, "approved", null);
        }
        await syncNow(opportunities);
        await syncNow(accounts);
        assert.ok((await unit.brainSemantic.entityCounts(workspaceId)).length >= 2);
        assert.ok(await unit.brainSemantic.countLinks(workspaceId) > 0, "opportunities link to their accounts");
        const acme = await brain.entities.search(owner, { entityTypeKey: "Account", query: "acme" });
        assert.equal(acme.length, 2, "a reference-only source keeps the account names");
        assert.ok((await brain.entities.mergeCandidates(owner)).length >= 1, "Acme Corp and ACME Corp. are suggested as duplicates");
        await brain.ontology.summary(owner);
    });

    test("governed metrics compute Gold values and honour access policies", async () => {
        const metric = await brain.metrics.create(owner, {
            key: "pipeline_amount", name: "Pipeline amount", datasetId: opportunities.id, aggregation: "sum", valueField: "amount", timeField: "close_date",
            filters: [], dimensions: ["region", "stage"], timeGrain: "month", unit: "currency", currency: "USD", higherIsBetter: true,
        });
        await brain.metrics.approve(admin, metric.id);
        const won = await brain.metrics.create(owner, { key: "won_deals", name: "Won deals", datasetId: opportunities.id, aggregation: "count", timeField: "close_date", filters: [{ field: "stage", op: "eq", value: "won" }], dimensions: ["region"], timeGrain: "month", unit: "count", higherIsBetter: true });
        await brain.metrics.approve(admin, won.id);
        const result = await brain.semantic.query(owner, { metricKey: "pipeline_amount", periods: 12 }) as unknown as { series: Array<{ value: number }> };
        assert.ok(result.series.length > 0);
        await brain.semantic.query(owner, { metricKey: "pipeline_amount", dimension: "region", periods: 6 });
        assert.ok((await brain.semantic.breakdownSeries(owner, "pipeline_amount", "region", "2026-01-01", "2026-06-01")).length > 0);
        await brain.accessPolicies.create(owner, { name: "Hide owners", role: "employee", resourceType: "dataset", resourceId: opportunities.id, effect: "mask", maskedFields: ["owner"] });
        await brain.accessPolicies.create(owner, { name: "EMEA only", role: "employee", resourceType: "dataset", resourceId: opportunities.id, effect: "row_filter", maskedFields: [], rowFilter: { field: "region", op: "eq", value: "EMEA" } });
        const restricted = await brain.semantic.query(staff, { metricKey: "pipeline_amount", periods: 12 }) as unknown as { series: Array<{ value: number }> };
        const total = (series: Array<{ value: number }>) => series.reduce((sum, point) => sum + point.value, 0);
        assert.ok(total(restricted.series) < total(result.series), "the row filter narrows what an employee sees");
        for (const record of await brain.datasets.quarantine(staff, { datasetId: opportunities.id })) {
            assert.notEqual((record.payload as Record<string, unknown>).owner, "y@example.com", "masked fields never reach the employee");
        }
    });

    test("the Intelligence Engine forecasts, explains, simulates, optimises and reproduces", async () => {
        const forecast = await brain.intelligence.forecast(owner, { metricKey: "pipeline_amount", horizon: 3 }) as unknown as { id: string; status: string; result: { points: unknown[] } };
        assert.equal(forecast.status, "succeeded");
        assert.equal(forecast.result.points.length, 3);
        const cause = await brain.intelligence.rootCause(owner, { metricKey: "pipeline_amount", dimension: "region" }) as unknown as { status: string; result: { drivers: unknown[] } };
        assert.equal(cause.status, "succeeded");
        assert.ok(cause.result.drivers.length > 0);
        await brain.intelligence.simulate(owner, { metricKey: "pipeline_amount", horizon: 3, assumptions: [{ key: "price", label: "Price +5%", type: "level_percent", value: 5 }], save: { name: "Price rise" } });
        await brain.intelligence.optimise(owner, { budget: 1000, options: [{ key: "a", label: "A", cost: 400, expectedReturn: 900 }, { key: "b", label: "B", cost: 700, expectedReturn: 1000 }, { key: "c", label: "C", cost: 300, expectedReturn: 500 }] } as never);
        const reproduced = await brain.intelligence.reproduce(owner, forecast.id) as { reproducible: boolean };
        assert.equal(reproduced.reproducible, true, JSON.stringify(reproduced));
        assert.equal((await brain.intelligence.listScenarios(owner)).length, 1);
    });

    test("the overview and the assistant answer from governed data without a model", async () => {
        const overview = await brain.overview.overview(owner, "90d" as never) as unknown as { telemetry: { sources: { connected: number } }; forecast: unknown };
        assert.equal(overview.telemetry.sources.connected, 1);
        assert.ok(overview.forecast);
        await brain.overview.overview(staff, "ytd" as never);
        await brain.overview.summary(systemActor(workspaceId));
        const reply = await brain.assistant.ask(owner, { message: "Forecast pipeline amount for the next 3 months" }) as unknown as { conversation: { id: string }; status: string; messages: Array<{ role: string; metricCard?: { primaryValue: string }; insights?: string[] }> };
        assert.equal(reply.status, "succeeded");
        const answer = reply.messages.at(-1)!;
        assert.equal(answer.role, "assistant");
        assert.ok(answer.metricCard?.primaryValue.startsWith("$"));
        assert.ok(answer.insights?.length);
        await brain.assistant.ask(owner, { conversationId: reply.conversation.id, message: "Why did pipeline amount change by region?" });
        await brain.assistant.ask(owner, { message: "What if pipeline amount drops 10%?" });
        await brain.assistant.ask(staff, { message: "How healthy is our data?" });
        assert.equal((await brain.assistant.messages(owner, reply.conversation.id)).messages.length, 4);
        await assert.rejects(brain.assistant.messages(staff, reply.conversation.id), /not found/i, "conversations are private to their author");
        assert.ok((await brain.tasks.list(owner)).length >= 3);
    });

    test("workflows run to completion and external actions wait for a payload-bound approval", async () => {
        const weekly = await brain.workflows.createFromTemplate(owner, { template: "weekly-forecast-report", name: "Weekly forecast" });
        await brain.workflows.activate(owner, weekly.id);
        const report = await brain.workflows.startRun(owner, weekly.id, { metric_key: "pipeline_amount" });
        assert.equal((await waitForWorkflow(report.run.id, ["succeeded", "failed"])).status, "succeeded");

        const outreach = await brain.workflows.createFromTemplate(owner, { template: "approved-outreach", name: "Outreach" });
        await brain.workflows.activate(owner, outreach.id);
        const inputs = { connection_id: connectionId, path: "/send", body: { message: "Hello" }, title: "Q3 note", summary: "Send the Q3 note", recipients: ["a@example.com"] };
        const started = await brain.workflows.startRun(owner, outreach.id, inputs, "outreach-1");
        assert.equal((await brain.workflows.startRun(owner, outreach.id, inputs, "outreach-1")).run.id, started.run.id, "the idempotency key returns the same run");
        assert.equal((await waitForWorkflow(started.run.id, ["waiting_approval", "failed"])).status, "waiting_approval");
        const [approval] = await brain.workflows.listApprovals(owner, "pending");
        assert.ok(approval);
        assert.equal(writes.length, 0, "nothing leaves the workspace before approval");
        await assert.rejects(brain.workflows.decideApproval(admin, approval.id, { decision: "approved", payloadHash: "0".repeat(64) }));
        await assert.rejects(brain.workflows.decideApproval(staff, approval.id, { decision: "approved", payloadHash: approval.payloadHash }));
        await brain.workflows.decideApproval(admin, approval.id, { decision: "approved", payloadHash: approval.payloadHash });
        assert.equal((await waitForWorkflow(started.run.id, ["succeeded", "failed"])).status, "succeeded");
        for (let index = 0; index < 3; index++) await brain.engine.tick(10);
        assert.equal(writes.length, 1, "the approved action runs exactly once");

        const cancelled = await brain.workflows.startRun(owner, outreach.id, { ...inputs, body: { message: "Second" } });
        await waitForWorkflow(cancelled.run.id, ["waiting_approval"]);
        assert.equal((await brain.workflows.cancelRun(owner, cancelled.run.id)).status, "cancelled");
        assert.equal((await brain.workflows.listApprovals(owner, "pending")).length, 0, "cancelling invalidates the open approval");
    });

    test("the scheduler dispatches events to workflows and leaves nothing claimable behind", async () => {
        const alert = await brain.workflows.createFromTemplate(owner, { template: "data-quality-alert", name: "Quality alert" });
        await brain.workflows.activate(owner, alert.id);
        await unit.brainData.updateDataset(accounts.id, workspaceId, { nextSyncAt: new Date(Date.now() - 1_000) });
        await brain.scheduler.tick();
        await brain.scheduler.tick();
        const runs = await unit.brainWorkforce.listWorkflowRuns(workspaceId, { definitionId: alert.id, limit: 50 });
        assert.ok(runs.some(run => run.triggerType === "event"), "a pipeline event started the quality alert");
        assert.equal((await unit.brainData.claimDueDatasets("probe", 1_000, 5)).length, 0);
        assert.equal((await unit.brainWorkforce.claimDueScheduledWorkflows(5)).length, 0, "a due schedule starts once and advances");
        assert.equal((await unit.brainWorkforce.expireApprovals(5)).length, 0);
    });

    test("policy, audit, revocation and purge", async () => {
        await brain.policies.update(owner, { moderateRequiresApproval: true });
        assert.equal((await brain.policies.get(workspaceId)).moderateRequiresApproval, true);
        assert.ok((await brain.audit.list(owner, { limit: 200 })).length > 10);
        const purged = await brain.datasets.purge(owner, opportunities.id);
        assert.equal(purged.success, true);
        assert.equal((await brain.datasets.list(owner)).length, 1);
        assert.equal((await brain.datasets.revoke(owner, accounts.id)).status, "revoked");
        await assert.rejects(brain.datasets.sync(owner, accounts.id, false));
    });

    test("unlinking a business source stops its datasets and removes it from connected sources", async () => {
        const replacement = await brain.datasets.create(owner, datasetInput({ name: "Accounts v2", source: { path: "/accounts", recordsPath: "items" }, primaryKeyField: "account_id" }));
        await waitForSync(replacement.id, null);
        const result = await brain.sources.unlink(owner, connectionId);
        assert.equal(result.revokedDatasets, 1);
        assert.equal((await unit.brainData.findDataset(replacement.id, workspaceId))?.status, "revoked");
        const overview = await brain.overview.overview(owner, "7d" as never) as unknown as { telemetry: { sources: { total: number } } };
        assert.equal(overview.telemetry.sources.total, 0);
        await assert.rejects(brain.sources.unlink(owner, connectionId), /Link this connection/);
    });
    test("a whole PostgreSQL database loads securely: sealed raw copies, pseudonymised personal data, resumable scans", async () => {
        // A separate business database with two schemas, a composite key, personal columns and a table larger than one run reads.
        const sourceUrl = new URL(adminUrl!);
        sourceUrl.pathname = `/${sourceName}`;
        await initializeDatabase(sourceUrl.toString(), adminUrl);
        sourceSql = postgres(sourceUrl.toString(), { max: 2, onnotice: () => {} });
        await sourceSql.unsafe(`
            CREATE SCHEMA sales; CREATE SCHEMA procurement;
            CREATE TABLE sales.customers (id integer PRIMARY KEY, company text NOT NULL, email text, first_name text, region text, created_at timestamptz NOT NULL DEFAULT now());
            CREATE TABLE sales.orders (id bigint PRIMARY KEY, customer_id integer, amount numeric(12,2), order_date date NOT NULL);
            CREATE TABLE procurement.purchase_order_lines (order_id integer, line_no integer, sku text, quantity integer, PRIMARY KEY (order_id, line_no));
            CREATE TABLE public._prisma_migrations (id text PRIMARY KEY);
            CREATE VIEW sales.big_orders AS SELECT * FROM sales.orders WHERE amount > 500;
            INSERT INTO sales.customers (id, company, email, first_name, region)
                SELECT n, 'Company ' || n, 'buyer' || n || '@client' || n || '.com', 'Person' || n, (ARRAY['EMEA','APAC','NA'])[1 + n % 3] FROM generate_series(1, 50) n;
            INSERT INTO sales.orders SELECT n, 1 + n % 50, (n % 997)::numeric, DATE '2025-01-01' + (n % 500) FROM generate_series(1, 10500) n;
            INSERT INTO procurement.purchase_order_lines SELECT 1 + n / 4, n % 4, 'SKU-' || n, n % 9 FROM generate_series(1, 300) n;`);
        const [definition] = await connection.db.insert(schema.connectionDefinitions).values({ workspaceId, code: `pg-${randomUUID().slice(0, 8)}`, name: "PostgreSQL", adapterKey: "postgres", configSchema: { fields: [] } as never, isEnabled: true }).returning();
        const [database] = await connection.db.insert(schema.connections).values({ workspaceId, name: "Asterion Business Group", provider: "postgres", definitionId: definition.id, status: "connected" }).returning();
        readers.set(database.id, { id: database.id, name: database.name, provider: "postgres", adapterKey: "postgres", configuration: {}, metadata: {}, handle: { execute: postgresOperations(sourceSql) } });

        await assert.rejects(brain.sources.loadDatabase(owner, database.id, { scope: "database", domain: "Operations" }), /Link this connection/);
        await brain.sources.link(owner, database.id);
        const missing = await brain.sources.loadDatabase(admin, database.id, { scope: "tables", tables: [{ schema: "sales", name: "missing" }], domain: "Sales" });
        assert.deepEqual(missing.created, []);
        assert.match(missing.skipped[0].reason, /Not found/, "only discovered tables can be loaded; the caller cannot name arbitrary objects");
        const tables = await brain.sources.tables(owner, database.id);
        assert.deepEqual(tables.map(table => `${table.schema}.${table.name}`), ["procurement.purchase_order_lines", "sales.big_orders", "sales.customers", "sales.orders"], "migration tables are not business data");

        const load = await brain.sources.loadDatabase(owner, database.id, { scope: "database", domain: "Operations", schemaDomains: { sales: "Sales" } });
        assert.deepEqual(load.created.map(dataset => [dataset.name, dataset.domain, dataset.primaryKeyField, dataset.timeField]).sort(), [
            ["Customers", "Sales", "id", "created_at"],
            ["Orders", "Sales", "id", "order_date"],
            ["Purchase Order Lines", "Operations", "__brain_key", null],
        ], "views are left out of a whole-database load unless asked for");
        assert.equal(load.created.every(dataset => dataset.classification === "confidential"), true);

        // The first datasets start at once; the scheduler continues the 10,500-row table across runs until its scan completes.
        for (let attempt = 0; attempt < 60; attempt++) {
            const rows = (await unit.brainData.listDatasets(workspaceId)).filter(dataset => dataset.connectionId === database.id);
            if (rows.every(dataset => dataset.lastSuccessAt && !dataset.leaseOwner && Object.keys(dataset.cursor).length === 0 && !dataset.nextSyncAt)) break;
            await sleep(150);
            await brain.scheduler.tick();
        }
        const loaded = new Map((await brain.datasets.list(owner)).filter(dataset => dataset.connectionId === database.id).map(dataset => [dataset.name, dataset]));
        assert.equal(loaded.get("Orders")?.counts?.silver, 10_500, "a large table is read completely, not cut off at one run");
        assert.equal(loaded.get("Customers")?.counts?.silver, 50);
        assert.equal(loaded.get("Purchase Order Lines")?.counts?.silver, 300, "composite keys identify every line");
        assert.deepEqual(loaded.get("Customers")?.protectedFields, ["email", "first_name"]);

        // Nothing personal is readable anywhere in the Brain's own tables, and Bronze is sealed.
        const leaks = await connection.db.execute(sql`SELECT 'bronze' AS zone, count(*)::int AS n FROM brain_bronze_records WHERE payload::text ~* '(buyer[0-9]+@|Person[0-9]+)'
            UNION ALL SELECT 'silver', count(*)::int FROM brain_silver_records WHERE data::text ~* '(buyer[0-9]+@|Person[0-9]+)'
            UNION ALL SELECT 'entities', count(*)::int FROM brain_entities WHERE attributes::text ~* '(buyer[0-9]+@|Person[0-9]+)' OR display_name ~* '(buyer[0-9]+@|Person[0-9]+)'
            UNION ALL SELECT 'quarantine', count(*)::int FROM brain_quarantine_records WHERE payload::text ~* '(buyer[0-9]+@|Person[0-9]+)'
            UNION ALL SELECT 'datasets', count(*)::int FROM brain_datasets WHERE cursor::text ~* '(buyer[0-9]+@|Person[0-9]+)'`);
        assert.deepEqual([...leaks].map(row => Number(row.n)), [0, 0, 0, 0, 0], JSON.stringify([...leaks]));
        const [sealing] = await connection.db.execute(sql`SELECT count(*) FILTER (WHERE NOT (payload ? '$sealed'))::int AS unsealed FROM brain_bronze_records`);
        assert.equal(Number(sealing.unsealed), 0);
        const [customer] = await connection.db.execute(sql`SELECT s.data FROM brain_silver_records s JOIN brain_datasets d ON d.id = s.dataset_id WHERE d.name = 'Customers' LIMIT 1`);
        const data = customer.data as Record<string, unknown>;
        assert.ok(isPseudonym(data.email) && isPseudonym(data.first_name));
        assert.match(String(data.company), /^Company \d+$/, "business columns stay usable for analysis");

        // Loading again adds nothing; the views can still be chosen explicitly.
        const again = await brain.sources.loadDatabase(owner, database.id, { scope: "database", domain: "Operations" });
        assert.equal(again.created.length, 0);
        assert.ok(again.skipped.every(item => item.reason.startsWith("Already loaded")));
        // Loads are rate limited per person (three a minute), so a second administrator loads the view.
        await assert.rejects(brain.sources.loadDatabase(owner, database.id, { scope: "database", domain: "Operations" }), /Too many requests/);
        const view = await brain.sources.loadDatabase(admin, database.id, { scope: "tables", tables: [{ schema: "sales", name: "big_orders" }], domain: "Sales" });
        assert.equal(view.created[0]?.name, "Big Orders");

        // Rows stored before sealing existed are sealed by the scheduler and still open.
        const [legacy] = await connection.db.insert(schema.brainBronzeRecords).values({ workspaceId, datasetId: load.created[0].id, sourceKey: "legacy-1", payload: { email: "old@client.com" }, payloadHash: "0".repeat(64), schemaVersion: 1 }).returning();
        assert.equal(await brain.pipeline.sealLegacyRecords(50), 1);
        const [resealed] = await connection.db.select().from(schema.brainBronzeRecords).where(eq(schema.brainBronzeRecords.id, legacy.id));
        assert.equal(JSON.stringify(resealed.payload).includes("old@client.com"), false);
    });
});
