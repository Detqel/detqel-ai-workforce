import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import type { IUnitOfWork } from "../../src/shared/contracts/unit-of-work.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { BrainAuditService } from "../../src/modules/brain/services/brain-audit.service.js";
import { systemActor, userActor } from "../../src/modules/brain/services/brain-types.js";
import { agentByKey, BRAIN_AGENTS, BRAIN_TOOL_KEYS } from "../../src/modules/brain/services/workforce/agent-catalog.js";
import { BrainOrchestrator, taskStatus } from "../../src/modules/brain/services/workforce/brain-orchestrator.js";
import type { IBrainModel } from "../../src/modules/brain/services/workforce/brain-model.js";
import { groundedNumbers, numericValue, verifyExecution } from "../../src/modules/brain/services/workforce/output-verifier.js";
import { BrainPolicyService, canApprove, decide, DEFAULT_POLICY_SETTINGS, effectiveTier } from "../../src/modules/brain/services/workforce/policy-engine.js";
import { detectIntent, horizonFor, matchMetric, rulePlan } from "../../src/modules/brain/services/workforce/rule-planner.js";
import { actionHash, ToolGateway } from "../../src/modules/brain/services/workforce/tool-gateway.js";
import type { ToolDefinition } from "../../src/modules/brain/services/workforce/tool-registry.js";
import { canTransition, evaluateCondition, resolveTemplates, validateSteps, WORKFLOW_TEMPLATES } from "../../src/modules/brain/services/workflow/workflow-definitions.js";
import { classifyError, validateInputs } from "../../src/modules/brain/services/workflow/workflow-engine.js";

const workspaceId = "5f1a9a42-7d3e-4c1b-8a60-93b7c2d4e611";
const userId = "b7bc2723-5cdd-4c33-b8b7-260825d65030";
const manager = userActor(userId, workspaceId, "manager");
const employee = userActor(userId, workspaceId, "employee");

/** A unit of work recording what the Brain wrote. Only the methods these tests use exist. */
function fakeUnit(settings: Record<string, unknown> | null = null) {
    const audits: Array<Record<string, unknown>> = [];
    const approvals: Array<Record<string, unknown>> = [];
    const tasks: Array<Record<string, unknown>> = [];
    const steps: Array<Record<string, unknown>> = [];
    const unit = {
        brainGovernance: { recordAudit: async (rows: Array<Record<string, unknown>>) => { audits.push(...rows); }, publishEvents: async () => {} },
        brainWorkforce: {
            getPolicySettings: async () => settings,
            createApproval: async (row: Record<string, unknown>) => { const created = { id: `approval-${approvals.length + 1}`, ...row }; approvals.push(created); return created; },
            createTask: async (row: Record<string, unknown>) => { const created = { id: `task-${tasks.length + 1}`, ...row }; tasks.push(created); return created; },
            updateTask: async (id: string, data: Record<string, unknown>) => { Object.assign(tasks.find(task => task.id === id)!, data); return null; },
            createSteps: async (rows: Array<Record<string, unknown>>) => rows.map((row, index) => { const created = { id: `step-${index}`, ...row }; steps.push(created); return created; }),
            updateStep: async (id: string, data: Record<string, unknown>) => { Object.assign(steps.find(step => step.id === id)!, data); return null; },
        },
        activities: { recordActivity: async () => ({}) },
    } as unknown as IUnitOfWork;
    return { unit, audits, approvals, tasks, steps };
}

const fakeTool = (overrides: Partial<ToolDefinition>): ToolDefinition => ({
    key: BRAIN_TOOL_KEYS.queryMetric, version: "1.0.0", riskTier: "low", access: "read", external: false, description: "Read a metric", example: "{}",
    input: z.object({ metricKey: z.string(), periods: z.number().optional(), dimension: z.string().optional() }).strict(),
    handler: async () => ({ data: { value: 24_500_000 }, summary: "Read the metric.", statements: [{ kind: "fact", text: "Net revenue was $24.5M in the period starting 2026-10-01." }], evidence: [{ type: "metric", title: "Net revenue", reference: "metric:net_revenue@v1" }], headline: { value: 24_500_000, label: "Net revenue (2026-10-01)", unit: "currency", currency: "USD", delta: 18, deltaLabel: "vs 2026-09-01", deltaIsPercent: true, icon: "trending-up" } }),
    ...overrides,
} as ToolDefinition);

describe("action-risk policy", () => {
    const action = { key: "x", riskTier: "low" as const, access: "read" as const, external: false };

    test("low runs, moderate follows tenant settings, high needs approval, critical is disabled by default", () => {
        assert.equal(decide(manager, action, DEFAULT_POLICY_SETTINGS).decision, "allow");
        assert.equal(decide(manager, { ...action, riskTier: "moderate" }, DEFAULT_POLICY_SETTINGS).decision, "allow");
        assert.equal(decide(manager, { ...action, riskTier: "moderate" }, { ...DEFAULT_POLICY_SETTINGS, moderateRequiresApproval: true }).decision, "require_approval");
        assert.deepEqual(decide(manager, { ...action, riskTier: "high" }, DEFAULT_POLICY_SETTINGS).decision, "require_approval");
        assert.equal(decide(manager, { ...action, riskTier: "critical" }, DEFAULT_POLICY_SETTINGS).decision, "deny");
        const critical = decide(manager, { ...action, riskTier: "critical" }, { ...DEFAULT_POLICY_SETTINGS, criticalEnabled: true, criticalRequiredApprovals: 3 });
        assert.equal(critical.decision, "require_approval");
        assert.equal(critical.requiredApprovals, 3);
    });

    test("write actions are refused for read-only roles regardless of tier", () => {
        assert.equal(decide(employee, { ...action, access: "write" }, DEFAULT_POLICY_SETTINGS).decision, "deny");
        assert.equal(decide(systemActor(workspaceId), { ...action, access: "write", riskTier: "moderate" }, DEFAULT_POLICY_SETTINGS).decision, "allow");
        assert.equal(decide(systemActor(workspaceId), { ...action, riskTier: "high" }, DEFAULT_POLICY_SETTINGS).decision, "require_approval", "scheduled work cannot skip approvals");
    });

    test("tenant overrides cannot drop external actions below high or critical actions at all", () => {
        const settings = { ...DEFAULT_POLICY_SETTINGS, actionTiers: { send: "low" as const, wipe: "low" as const, doc: "high" as const } };
        assert.equal(effectiveTier({ key: "send", riskTier: "high", access: "write", external: true }, settings), "high");
        assert.equal(effectiveTier({ key: "wipe", riskTier: "critical", access: "write", external: false }, settings), "critical");
        assert.equal(effectiveTier({ key: "doc", riskTier: "moderate", access: "write", external: false }, settings), "high", "raising a tier is allowed");
    });

    test("approvers: managers for high, owners and administrators for critical", () => {
        assert.equal(canApprove("manager", "high"), true);
        assert.equal(canApprove("analyst", "high"), false);
        assert.equal(canApprove("manager", "critical"), false);
        assert.equal(canApprove("admin", "critical"), true);
    });
});

describe("verification", () => {
    test("model text may only repeat numbers the tools produced", () => {
        const evidence = ["Net revenue was $24.5M; forecast 25,812,000 (+5.4%)."];
        assert.deepEqual(groundedNumbers("Revenue is about $24.5M and the forecast is $25.8M, up 5.4%. Three drivers stand out.", evidence).ungrounded, []);
        assert.deepEqual(groundedNumbers("Revenue will reach $31M, up 27%.", evidence).ungrounded, ["$31M", "27%"]);
        assert.equal(numericValue("$1.2B"), 1_200_000_000);
        assert.equal(numericValue("-14%"), -14);
    });

    test("a task is complete only when every step returned a result", () => {
        const report = verifyExecution([
            { index: 0, tool: "a", status: "succeeded", hasOutput: true, error: null },
            { index: 1, tool: "b", status: "waiting_approval", hasOutput: false, error: null },
        ]);
        assert.equal(report.verified, false);
        assert.equal(report.checks.find(check => check.name === "no-pending-approvals")!.passed, false);
        assert.equal(taskStatus([]), "succeeded");
    });
});

describe("rule planner", () => {
    const catalog = {
        metrics: [
            { key: "net_revenue", name: "Net revenue", unit: "currency", dimensions: ["region"], status: "approved", grain: "month" },
            { key: "support_tickets", name: "Support tickets", unit: "count", dimensions: [], status: "approved", grain: "week" },
            { key: "marketing_spend", name: "Marketing spend", unit: "currency", dimensions: ["channel", "region"], status: "approved", grain: "month" },
        ],
        datasets: [{ name: "CRM Opportunities", domain: "CRM Pipeline" }],
    };

    test("maps questions to the agent that owns the intent", () => {
        assert.equal(detectIntent("What's our sales forecast for next quarter?"), "forecast");
        assert.equal(detectIntent("Run a what-if simulation with 15% more APAC outbound"), "simulation");
        assert.equal(detectIntent("Why did revenue drop last month?"), "root_cause");
        assert.equal(detectIntent("Explain the quarantined records in Silver"), "data_health");
        assert.equal(detectIntent("hello"), "conversational");
        const forecast = rulePlan("What's our sales forecast for next quarter?", catalog);
        assert.deepEqual(forecast.steps.map(step => [step.agent, step.tool, step.input]), [["forecasting", BRAIN_TOOL_KEYS.forecast, { metricKey: "net_revenue", horizon: 3 }]]);
        const simulation = rulePlan("Simulate cutting prices by 10%", catalog);
        assert.equal((simulation.steps[0].input.assumptions as Array<{ value: number }>)[0].value, -10);
        assert.equal(rulePlan("Send an email to our top accounts", catalog).clarification !== null, true);
        assert.equal(matchMetric("how many support tickets", catalog.metrics)!.key, "support_tickets");
        assert.equal(horizonFor("next quarter", "week"), 13);
    });

    test("every rule-planned step uses a tool its agent owns", () => {
        for (const question of ["forecast revenue", "what if prices rise 5%", "optimise the marketing budget", "why did revenue fall", "data quality", "pending mappings", "approvals", "weekly report automation", "executive summary", "campaign ideas", "market research", "hello", "revenue by region"]) {
            for (const step of rulePlan(question, catalog).steps) assert.ok(agentByKey(step.agent)?.tools.includes(step.tool), `${question}: ${step.agent} cannot use ${step.tool}`);
        }
    });

    test("every catalogue agent with tools has at least one skill and a version", () => {
        for (const agent of BRAIN_AGENTS) {
            assert.match(agent.version, /^\d+\.\d+\.\d+$/);
            if (agent.tools.length) assert.ok(agent.skills.length > 0, agent.key);
        }
    });
});

describe("tool gateway", () => {
    test("refuses tools outside the agent's allow-list and invalid input, independently of any plan", async () => {
        const { unit, audits } = fakeUnit();
        const audit = new BrainAuditService(unit);
        const gateway = new ToolGateway(unit, audit, new Map([[BRAIN_TOOL_KEYS.queryMetric, fakeTool({})]]), new BrainPolicyService(unit, audit));
        const context = { actor: manager, taskId: "t", correlationId: "c", agentKey: "research" };
        const blocked = await gateway.execute(context, agentByKey("research")!, BRAIN_TOOL_KEYS.queryMetric, { metricKey: "net_revenue" }, 0);
        assert.equal(blocked.status, "blocked");
        assert.ok(audits.some(entry => entry.action === "agent.tool.blocked" && entry.outcome === "denied"));
        const invalid = await gateway.execute({ ...context, agentKey: "business-analyst" }, agentByKey("business-analyst")!, BRAIN_TOOL_KEYS.queryMetric, { metricKey: 5 }, 0);
        assert.equal(invalid.status, "failed");
        const ok = await gateway.execute({ ...context, agentKey: "business-analyst" }, agentByKey("business-analyst")!, BRAIN_TOOL_KEYS.queryMetric, { metricKey: "net_revenue" }, 0);
        assert.equal(ok.status, "succeeded");
        assert.ok(audits.some(entry => entry.action === "agent.tool.executed" && entry.policyDecision === "allow"));
    });

    test("an action needing approval does not run; the approval is bound to the exact payload", async () => {
        const { unit, approvals } = fakeUnit({ actionTiers: {}, moderateRequiresApproval: true, criticalEnabled: false, criticalRequiredApprovals: 2, approvalTtlHours: 24, workflowsEnabled: true, externalSearchEnabled: true });
        const audit = new BrainAuditService(unit);
        let ran = 0;
        const tool = fakeTool({ key: BRAIN_TOOL_KEYS.createDocument, riskTier: "moderate", access: "write", input: z.object({ title: z.string(), content: z.string() }).strict(), handler: async () => { ran++; return { data: {}, summary: "saved", statements: [], evidence: [] }; } });
        const gateway = new ToolGateway(unit, audit, new Map([[tool.key, tool]]), new BrainPolicyService(unit, audit));
        const input = { title: "Brief", content: "Body text" };
        const result = await gateway.execute({ actor: manager, taskId: "t", correlationId: "c", agentKey: "document" }, agentByKey("document")!, tool.key, input, 2);
        assert.equal(result.status, "waiting_approval");
        assert.equal(ran, 0);
        assert.equal(approvals[0].payloadHash, actionHash(tool, input));
        assert.equal(approvals[0].stepKey, "2");
        const approved = { ...approvals[0], status: "approved", payload: { input } } as never;
        assert.equal((await gateway.executeApproved(approved, manager, agentByKey("document")!)).status, "succeeded");
        assert.equal(ran, 1);
        const tampered = { ...approvals[0], status: "approved", payload: { input: { ...input, content: "Changed" } } } as never;
        await assert.rejects(gateway.executeApproved(tampered, manager, agentByKey("document")!), (error: AppError) => error.statusCode === 409);
        assert.equal(ran, 1, "a changed payload never runs under the old approval");
    });

    test("critical actions are blocked by default", async () => {
        const { unit } = fakeUnit();
        const audit = new BrainAuditService(unit);
        const tool = fakeTool({ key: BRAIN_TOOL_KEYS.transferFunds, riskTier: "critical", access: "write", external: true, input: z.object({}).strict() });
        const gateway = new ToolGateway(unit, audit, new Map([[tool.key, tool]]), new BrainPolicyService(unit, audit));
        const result = await gateway.execute({ actor: userActor(userId, workspaceId, "owner"), taskId: null, correlationId: "c", agentKey: "operations" }, agentByKey("operations")!, tool.key, {}, 0);
        assert.equal(result.status, "blocked");
        assert.match(result.error!, /disabled/);
    });
});

describe("orchestrator", () => {
    const catalogStubs = {
        semantic: { visibleMetrics: async () => [{ key: "net_revenue", name: "Net revenue", unit: "currency", dimensions: ["region"], status: "approved", timeGrain: "month" }] },
        datasets: { list: async () => [] },
    };

    function build(model: IBrainModel) {
        const { unit, tasks, steps } = fakeUnit();
        const audit = new BrainAuditService(unit);
        const gateway = new ToolGateway(unit, audit, new Map([[BRAIN_TOOL_KEYS.queryMetric, fakeTool({})]]), new BrainPolicyService(unit, audit));
        const orchestrator = new BrainOrchestrator(unit, gateway, model, catalogStubs.semantic as never, catalogStubs.datasets as never, audit);
        return { orchestrator, tasks, steps };
    }

    test("without a model the rule planner answers from governed tool output with labelled insights", async () => {
        const { orchestrator, tasks, steps } = build({ available: async () => false, structured: async () => { throw new Error("not called"); } });
        const result = await orchestrator.run({ actor: manager, question: "How is net revenue doing?", conversationId: null, history: [] });
        assert.equal(result.status, "partial", "the knowledge step is not in this test's registry, so it fails visibly");
        assert.equal(result.payload.planner, "rules");
        assert.equal(result.payload.metricCard?.primaryValue, "$24.5M");
        assert.ok(result.payload.insights?.some(line => line.startsWith("Observed fact: Net revenue was $24.5M")));
        assert.ok(result.payload.insights?.some(line => line.startsWith("Caveat:")), "the failed step is reported, not hidden");
        assert.equal(tasks[0].planner, "rules");
        assert.equal(steps[0].status, "succeeded");
    });

    test("a model plan is validated against the catalogue and ungrounded wording is discarded", async () => {
        const calls: string[] = [];
        const model: IBrainModel = {
            available: async () => true,
            structured: async request => {
                calls.push(request.schemaName);
                if (request.schemaName === "brain_plan") return { usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, costUsd: 0.001 }, value: {
                    intent: "analytics", clarification: null,
                    steps: [
                        { agent: "business-analyst", tool: BRAIN_TOOL_KEYS.queryMetric, purpose: "Read revenue", inputJson: "{\"metricKey\":\"net_revenue\"}", dependsOn: [] },
                        { agent: "research", tool: BRAIN_TOOL_KEYS.transferFunds, purpose: "Sneaky", inputJson: "{}", dependsOn: [] },
                    ],
                } as never };
                return { usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0, costUsd: 0.001 }, value: { narrative: "Revenue hit $99M, a record.", highlights: [] } as never };
            },
        };
        const { orchestrator, tasks } = build(model);
        const result = await orchestrator.run({ actor: manager, question: "How is revenue?", conversationId: null, history: [] });
        assert.deepEqual(calls, ["brain_plan", "brain_answer"]);
        assert.equal(result.status, "succeeded", "only the valid step ran; the out-of-catalogue step was dropped before execution");
        assert.equal(result.payload.planner, "model");
        assert.notEqual(result.payload.content, "Revenue hit $99M, a record.");
        assert.ok(result.payload.verification.notes.some(note => note.includes("$99M")));
        assert.equal((tasks[0].usage as { costUsd: number }).costUsd, 0.002);
    });
});

describe("workflow definitions", () => {
    const actions = new Set(["brain.run_forecast", "brain.notify_members", "brain.create_document", "brain.quality_check", "connector.http_post", "brain.approval_gate"]);

    test("templates are valid DAGs over known actions", () => {
        for (const template of WORKFLOW_TEMPLATES) validateSteps(template.steps, actions);
    });

    test("cycles, unknown dependencies and unknown actions are refused", () => {
        const step = (key: string, dependsOn: string[] = [], action = "brain.notify_members") => ({ key, name: key, action, input: {}, dependsOn });
        assert.throws(() => validateSteps([step("a", ["b"]), step("b", ["a"])], actions), /cycle/);
        assert.throws(() => validateSteps([step("a", ["missing"])], actions), /unknown step/);
        assert.throws(() => validateSteps([step("a", [], "shell.exec")], actions), /unknown action/);
    });

    test("templates resolve without evaluation, keeping whole-value types", () => {
        const scope = { inputs: { metric_key: "net_revenue", count: 3 }, steps: { forecast: { output: { summaryText: "ok", nested: { value: 2 } } } }, run: { id: "r1" } };
        assert.deepEqual(resolveTemplates({ metricKey: "{{inputs.metric_key}}", n: "{{inputs.count}}", text: "Run {{run.id}}: {{steps.forecast.output.summaryText}}", missing: "{{inputs.none}}", proto: "{{__proto__.polluted}}" }, scope),
            { metricKey: "net_revenue", n: 3, text: "Run r1: ok", missing: undefined, proto: undefined });
        assert.equal(evaluateCondition({ step: "forecast", path: "nested.value", op: "gte", value: 2 }, { forecast: { nested: { value: 2 } } }), true);
        assert.equal(evaluateCondition({ step: "forecast", path: "nested.value", op: "eq", value: "2" }, { forecast: { nested: { value: 2 } } }), false);
    });

    test("run states only move along permitted transitions", () => {
        assert.equal(canTransition("queued", "running"), true);
        assert.equal(canTransition("succeeded", "running"), false);
        assert.equal(canTransition("waiting_approval", "running"), true);
        assert.equal(canTransition("cancelled", "running"), false);
        assert.equal(canTransition("failed", "running"), true, "a failed run can be retried manually");
    });

    test("inputs are type-checked and errors are classified for retry", () => {
        assert.throws(() => validateInputs([{ name: "metric_key", type: "string", required: true }], {}), /required/);
        assert.throws(() => validateInputs([{ name: "n", type: "number", required: false }], { n: "3" }), /must be a number/);
        assert.equal(classifyError(new AppError(503, "down")), "transient");
        assert.equal(classifyError(new AppError(422, "bad")), "permanent");
        assert.equal(classifyError(new AppError(403, "no")), "policy");
    });
});
