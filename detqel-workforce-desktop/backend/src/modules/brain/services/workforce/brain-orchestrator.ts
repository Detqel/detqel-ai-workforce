import { randomUUID } from "node:crypto";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_PLANNERS, BRAIN_PROMPT_IDS, BRAIN_STATEMENT_KINDS, BRAIN_STEP_STATUSES, BRAIN_TASK_STATUSES } from "../../../../constants/brainConstants.js";
import { untrusted } from "../../../../shared/agents/context/data-guard.js";
import type { CallUsage } from "../../../../shared/agents/litellm.client.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainTaskStep } from "../../../../shared/types/entities.js";
import { roleAllows } from "../../../workspaces/services/workspace-access.service.js";
import { composeAnswer, type AssistantPayload, type StepResult } from "../assistant/answer-composer.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, hashOf, type BrainActor, type BrainStatement } from "../brain-types.js";
import type { DatasetService } from "../data/dataset.service.js";
import type { SemanticQueryService } from "../semantic/semantic-query.service.js";
import { BRAIN_AGENTS, BRAIN_SKILLS, agentByKey } from "./agent-catalog.js";
import { addUsage, ZERO_USAGE, type IBrainModel } from "./brain-model.js";
import { groundedNumbers, verifyExecution } from "./output-verifier.js";
import { BRAIN_INTENTS, rulePlan, type BrainIntent, type BrainPlan, type PlannedStep, type PlanningCatalog } from "./rule-planner.js";
import type { ToolGateway } from "./tool-gateway.js";

const logger = createScopedLogger("brain-orchestrator");

const intentValues = Object.values(BRAIN_INTENTS) as [BrainIntent, ...BrainIntent[]];
const plannerSchema = z.object({
    intent: z.enum(intentValues),
    clarification: z.string().max(400).nullable(),
    steps: z.array(z.object({
        agent: z.string().max(60),
        tool: z.string().max(80),
        purpose: z.string().max(200),
        inputJson: z.string().max(8_000),
        dependsOn: z.array(z.number().int().min(0).max(BRAIN_LIMITS.maxPlanSteps - 1)).max(BRAIN_LIMITS.maxPlanSteps - 1),
    }).strict()).max(BRAIN_LIMITS.maxPlanSteps),
}).strict();
const composerSchema = z.object({
    narrative: z.string().max(800),
    highlights: z.array(z.object({ kind: z.enum(Object.values(BRAIN_STATEMENT_KINDS) as [string, ...string[]]), text: z.string().max(400) }).strict()).max(6),
}).strict();

export interface OrchestratorInput {
    readonly actor: BrainActor;
    readonly question: string;
    readonly conversationId: string | null;
    readonly history: ReadonlyArray<{ role: string; content: string }>;
    readonly signal?: AbortSignal;
}
export interface OrchestratorResult { readonly taskId: string; readonly status: string; readonly payload: AssistantPayload }

const replace = <T>(initial: () => T) => Annotation<T>({ reducer: (_current, next) => next, default: initial });
const State = Annotation.Root({
    catalog: replace<PlanningCatalog>(() => ({ metrics: [], datasets: [] })),
    modelAvailable: replace<boolean>(() => false),
    plan: replace<BrainPlan | null>(() => null),
    planner: replace<"model" | "rules">(() => BRAIN_PLANNERS.rules),
    notes: replace<string[]>(() => []),
    taskId: replace<string>(() => ""),
    steps: replace<BrainTaskStep[]>(() => []),
    results: replace<StepResult[]>(() => []),
    payload: replace<AssistantPayload | null>(() => null),
    usage: replace<CallUsage>(() => ZERO_USAGE),
});
type OrchestratorState = typeof State.State;

/**
 * The AI Workforce orchestrator (PRD 8). A LangGraph state graph that resolves the caller's authorised context,
 * plans bounded steps for specialised agents, delegates each step through the tool gateway, verifies completion,
 * and composes an evidence-labelled answer. The model plans and explains; it never computes the numbers, and its
 * plan is validated against the agent catalogue and tool contracts before anything runs. Without a configured
 * model the deterministic planner and composer answer from governed data alone.
 */
export class BrainOrchestrator {
    constructor(
        private readonly unit: IUnitOfWork,
        private readonly gateway: ToolGateway,
        private readonly model: IBrainModel,
        private readonly semantic: SemanticQueryService,
        private readonly datasets: DatasetService,
        private readonly audit: BrainAuditService,
    ) {}

    async run(input: OrchestratorInput): Promise<OrchestratorResult> {
        const traceId = randomUUID();
        const graph = new StateGraph(State)
            .addNode("resolveContext", state => this.context(input, state))
            .addNode("planTask", state => this.planStep(input, state, traceId))
            .addNode("delegateSteps", state => this.delegate(input, state, traceId))
            .addNode("composeAnswer", state => this.compose(input, state))
            .addEdge(START, "resolveContext")
            .addEdge("resolveContext", "planTask")
            .addConditionalEdges("planTask", state => (state.plan?.steps.length ? "delegateSteps" : "composeAnswer"), ["delegateSteps", "composeAnswer"])
            .addEdge("delegateSteps", "composeAnswer")
            .addEdge("composeAnswer", END)
            .compile();
        const final = await graph.invoke({}, { signal: input.signal, recursionLimit: 12 });
        const status = taskStatus(final.results);
        await this.unit.brainWorkforce.updateTask(final.taskId, {
            status, finishedAt: new Date(), usage: { ...final.usage },
            result: { content: final.payload!.content, statements: final.payload!.statements.length, evidence: final.payload!.evidence.length, approvals: final.payload!.approvals },
            verification: { ...final.payload!.verification, checks: verifyExecution(final.results.map(result => ({ index: result.index, tool: result.tool, status: result.status, hasOutput: Boolean(result.output), error: result.error }))).checks },
        });
        await this.audit.publishQuietly(input.actor.workspaceId, BRAIN_EVENT_TYPES.taskCompleted, { taskId: final.taskId, status, steps: final.results.length }, { actorId: actorId(input.actor), correlationId: traceId });
        await this.audit.recordQuietly(entryFor(input.actor, "agent.task.completed", "agent_task", final.taskId, { correlationId: traceId, metadata: { status, planner: final.planner, agents: final.payload!.agents } }));
        return { taskId: final.taskId, status, payload: final.payload! };
    }

    /** Resolves what the caller may see before anything is planned: governed metrics and datasets, after policy. */
    private async context(input: OrchestratorInput, _state: OrchestratorState): Promise<Partial<OrchestratorState>> {
        const [metrics, datasets, modelAvailable] = await Promise.all([
            this.semantic.visibleMetrics(input.actor),
            this.datasets.list(input.actor),
            this.model.available(input.actor.workspaceId, input.signal).catch(() => false),
        ]);
        return {
            modelAvailable,
            catalog: {
                metrics: metrics.slice(0, 60).map(metric => ({ key: metric.key, name: metric.name, unit: metric.unit, dimensions: metric.dimensions, status: metric.status, grain: metric.timeGrain })),
                datasets: datasets.slice(0, 40).map(dataset => ({ name: dataset.name, domain: dataset.domain })),
            },
        };
    }

    private async planStep(input: OrchestratorInput, state: OrchestratorState, traceId: string): Promise<Partial<OrchestratorState>> {
        const notes: string[] = [];
        let plan: BrainPlan | null = null;
        let planner: "model" | "rules" = BRAIN_PLANNERS.rules;
        let usage = state.usage;
        if (state.modelAvailable) {
            try {
                const response = await this.model.structured({
                    workspaceId: input.actor.workspaceId, promptId: BRAIN_PROMPT_IDS.planner, schemaName: "brain_plan", schema: plannerSchema, purpose: "planning", maxTokens: 2_500, signal: input.signal,
                    input: {
                        question: input.question,
                        history: input.history.slice(-6).map(message => ({ role: message.role, content: message.content.slice(0, 600) })),
                        catalog: state.catalog,
                        agents: BRAIN_AGENTS.filter(agent => agent.tools.length).map(agent => ({
                            key: agent.key, name: agent.name, description: agent.description,
                            skills: agent.skills.map(key => BRAIN_SKILLS.find(skill => skill.key === key)).filter(Boolean).map(skill => ({ key: skill!.key, procedure: skill!.procedure })),
                            tools: agent.tools.map(key => this.gateway.tool(key)).filter(Boolean).map(tool => ({ key: tool!.key, description: tool!.description, riskTier: tool!.riskTier, example: tool!.example })),
                        })),
                    },
                });
                usage = addUsage(usage, response.usage);
                const validated = this.validatePlan(response.value, notes);
                if (validated.steps.length || validated.clarification) { plan = validated; planner = BRAIN_PLANNERS.model; }
                else notes.push("The model's plan had no runnable steps; the rule planner was used.");
            } catch (error) {
                logger.warn({ workspaceId: input.actor.workspaceId, error: String(error) }, "Model planning failed; using the rule planner");
                notes.push("Model planning was unavailable; the rule planner was used.");
            }
        }
        plan ??= rulePlan(input.question, state.catalog);
        const task = await this.unit.brainWorkforce.createTask({
            workspaceId: input.actor.workspaceId, conversationId: input.conversationId, objective: input.question.slice(0, BRAIN_LIMITS.maxQuestionCharacters),
            initiatedBy: input.actor.userId, traceId, status: plan.steps.length ? BRAIN_TASK_STATUSES.running : BRAIN_TASK_STATUSES.succeeded, planner,
            permissionContext: { role: input.actor.role, kind: input.actor.kind, canWrite: input.actor.role === "system" || roleAllows(input.actor.role, "write") },
            plan: { intent: plan.intent, clarification: plan.clarification, steps: plan.steps.map(step => ({ ...step })) },
        });
        const steps = await this.unit.brainWorkforce.createSteps(plan.steps.map((step, index) => {
            const agent = agentByKey(step.agent)!;
            const tool = this.gateway.tool(step.tool);
            return {
                workspaceId: input.actor.workspaceId, taskId: task.id, stepIndex: index, agentKey: agent.key, agentVersion: agent.version,
                skillKey: agent.skills[0] ?? null, toolKey: step.tool, toolVersion: tool?.version ?? "unknown", purpose: step.purpose, input: step.input,
                inputHash: hashOf(step.input), riskTier: tool?.riskTier ?? "low", policyDecision: "pending", status: BRAIN_STEP_STATUSES.pending, dependsOn: step.dependsOn,
            };
        }));
        return { plan, planner, notes: [...state.notes, ...notes], taskId: task.id, steps, usage };
    }

    /** Only known agents, tools they own, valid JSON inputs that pass the tool's contract, and backward dependencies survive. */
    private validatePlan(raw: z.infer<typeof plannerSchema>, notes: string[]): BrainPlan {
        const steps: PlannedStep[] = [];
        raw.steps.forEach((step, index) => {
            const agent = agentByKey(step.agent);
            const tool = this.gateway.tool(step.tool);
            if (!agent || !tool || !agent.tools.includes(tool.key)) { notes.push(`Step ${index + 1} named an agent or tool outside the catalogue and was dropped.`); return; }
            let input: unknown;
            try { input = JSON.parse(step.inputJson || "{}"); } catch { notes.push(`Step ${index + 1} had unreadable input and was dropped.`); return; }
            const parsed = tool.input.safeParse(input);
            if (!parsed.success) { notes.push(`Step ${index + 1} (${tool.key}) had invalid input and was dropped.`); return; }
            steps.push({ agent: agent.key, tool: tool.key, purpose: step.purpose || tool.description, input: parsed.data as Record<string, unknown>, dependsOn: step.dependsOn.filter(dependency => dependency < steps.length) });
        });
        return { intent: raw.intent, clarification: raw.clarification?.trim() || null, steps: steps.slice(0, BRAIN_LIMITS.maxPlanSteps) };
    }

    /** Runs the plan: independent steps in parallel, dependent ones after their prerequisites succeed. */
    private async delegate(input: OrchestratorInput, state: OrchestratorState, traceId: string): Promise<Partial<OrchestratorState>> {
        const plan = state.plan!;
        const results = new Map<number, StepResult>();
        const pending = new Set(plan.steps.map((_, index) => index));
        while (pending.size) {
            const ready = [...pending].filter(index => plan.steps[index].dependsOn.every(dependency => results.get(dependency)?.status === "succeeded"));
            const blocked = [...pending].filter(index => plan.steps[index].dependsOn.some(dependency => results.has(dependency) && results.get(dependency)!.status !== "succeeded"));
            for (const index of blocked) {
                pending.delete(index);
                results.set(index, this.result(index, plan.steps[index], { status: "skipped", output: null, error: "A prerequisite step did not succeed.", approvalId: null }));
                await this.unit.brainWorkforce.updateStep(state.steps[index].id, { status: BRAIN_STEP_STATUSES.skipped, error: "A prerequisite step did not succeed.", finishedAt: new Date() });
            }
            if (!ready.length) break;
            for (let offset = 0; offset < ready.length; offset += BRAIN_LIMITS.maxParallelSteps) {
                await Promise.all(ready.slice(offset, offset + BRAIN_LIMITS.maxParallelSteps).map(async index => {
                    pending.delete(index);
                    const step = plan.steps[index];
                    const agent = agentByKey(step.agent)!;
                    const row = state.steps[index];
                    await this.unit.brainWorkforce.updateStep(row.id, { status: BRAIN_STEP_STATUSES.running, startedAt: new Date(), attempts: 1 });
                    const execution = await this.gateway.execute({ actor: input.actor, taskId: state.taskId, correlationId: traceId, agentKey: agent.key, signal: input.signal }, agent, step.tool, step.input, index);
                    results.set(index, this.result(index, step, execution));
                    await this.unit.brainWorkforce.updateStep(row.id, {
                        status: execution.status, output: execution.output ? { summary: execution.output.summary, statements: execution.output.statements, evidence: execution.output.evidence, data: execution.output.data } : null,
                        policyDecision: execution.policy?.decision ?? "deny", policyReason: execution.policy?.reason ?? execution.error, riskTier: execution.policy?.tier ?? row.riskTier,
                        approvalId: execution.approvalId, error: execution.error, finishedAt: new Date(), durationMs: execution.durationMs,
                    });
                }));
            }
        }
        return { results: [...results.values()].sort((a, b) => a.index - b.index) };
    }

    private result(index: number, step: PlannedStep, execution: { status: StepResult["status"]; output: StepResult["output"]; error: string | null; approvalId: string | null }): StepResult {
        const agent = agentByKey(step.agent);
        return { index, agent: step.agent, agentName: agent?.name ?? step.agent, tool: step.tool, purpose: step.purpose, status: execution.status, output: execution.output, error: execution.error, approvalId: execution.approvalId };
    }

    /**
     * Composes the answer. With a model, the narrative and highlights are written by it and accepted only when every
     * number they contain is grounded in the tools' outputs; otherwise the deterministic composition is used.
     */
    private async compose(input: OrchestratorInput, state: OrchestratorState): Promise<Partial<OrchestratorState>> {
        const plan = state.plan ?? rulePlan(input.question, state.catalog);
        const notes = [...state.notes];
        const options = { planner: state.planner, clarification: plan.clarification, notes };
        const succeeded = state.results.filter(result => result.status === "succeeded" && result.output);
        let usage = state.usage;
        if (state.modelAvailable && succeeded.length) {
            try {
                const evidenceTexts = succeeded.flatMap(result => [JSON.stringify(result.output!.data), ...result.output!.statements.map(statement => statement.text)]);
                const response = await this.model.structured({
                    workspaceId: input.actor.workspaceId, promptId: BRAIN_PROMPT_IDS.composer, schemaName: "brain_answer", schema: composerSchema, purpose: "answer", maxTokens: 1_500, signal: input.signal,
                    input: {
                        question: input.question, intent: plan.intent,
                        steps: state.results.map(result => ({ agent: result.agentName, tool: result.tool, status: result.status, error: result.error, statements: result.output?.statements ?? [] })),
                        retrievedContent: succeeded.flatMap(result => result.output!.untrusted ?? []).slice(0, 8).map(item => untrusted(item.source, item.text)).join("\n").slice(0, BRAIN_LIMITS.maxContextCharacters),
                    },
                });
                usage = addUsage(usage, response.usage);
                const highlights = response.value.highlights as BrainStatement[];
                const written = [response.value.narrative, ...highlights.map(item => item.text)].join("\n");
                const { ungrounded } = groundedNumbers(written, evidenceTexts);
                if (!ungrounded.length) return { usage, payload: composeAnswer(plan.intent, state.results, { ...options, narrative: response.value.narrative, highlights }) };
                notes.push(`The model's wording used numbers not found in the tool results (${ungrounded.slice(0, 3).join(", ")}), so the verified figures are shown instead.`);
            } catch (error) {
                logger.warn({ workspaceId: input.actor.workspaceId, error: String(error) }, "Model composition failed; using the deterministic answer");
            }
        }
        return { usage, payload: composeAnswer(plan.intent, state.results, options) };
    }
}

/** A task is complete only if every step returned a verifiable result (FR-AGT-007). */
export function taskStatus(results: ReadonlyArray<StepResult>): string {
    if (!results.length) return BRAIN_TASK_STATUSES.succeeded;
    if (results.some(result => result.status === "waiting_approval")) return BRAIN_TASK_STATUSES.waitingApproval;
    const succeeded = results.filter(result => result.status === "succeeded").length;
    if (succeeded === results.length) return BRAIN_TASK_STATUSES.succeeded;
    return succeeded ? BRAIN_TASK_STATUSES.partial : BRAIN_TASK_STATUSES.failed;
}
