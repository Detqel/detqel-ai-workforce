import {
    BRAIN_APPROVAL_STATUSES, BRAIN_ERRORS, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_RISK_TIERS, BRAIN_STEP_STATUSES, BRAIN_WORKFLOW_STATUSES, BRAIN_WORKFLOW_TRIGGERS,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainActionApproval, BrainApprovalDecision, BrainEvent, BrainWorkflowDefinition } from "../../../../shared/types/entities.js";
import { agentKindOf } from "../../../connections/services/connector-agent-policy.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, systemActor, userActor, type BrainActor } from "../brain-types.js";
import { agentByKey } from "../workforce/agent-catalog.js";
import { canApprove } from "../workforce/policy-engine.js";
import type { ToolGateway } from "../workforce/tool-gateway.js";
import type { WorkflowPort } from "../workforce/tool-registry.js";
import { type RoleResolver, type WorkflowEngine } from "./workflow-engine.js";
import { SYSTEM_EXTERNAL_ACTION_KEY, WORKFLOW_TEMPLATES, validateSteps, type WorkflowInput, type WorkflowStep, type WorkflowTrigger } from "./workflow-definitions.js";

const logger = createScopedLogger("brain-workflows");

export interface WorkflowDefinitionInput {
    readonly key: string;
    readonly name: string;
    readonly description?: string | null;
    readonly inputSchema: WorkflowInput[];
    readonly steps: WorkflowStep[];
    readonly trigger: WorkflowTrigger;
}

const nextRunFor = (trigger: WorkflowTrigger) => trigger.type === BRAIN_WORKFLOW_TRIGGERS.schedule ? new Date(Date.now() + trigger.intervalMinutes * 60_000) : null;
const snake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

/** Workflow definitions, runs and approval decisions, plus the workflow operations agents may request. */
export class WorkflowService implements WorkflowPort {
    constructor(
        private readonly unit: IUnitOfWork,
        private readonly audit: BrainAuditService,
        private readonly engine: WorkflowEngine,
        private readonly gateway: ToolGateway,
        private readonly roleOf: RoleResolver,
    ) {}

    templates() {
        return WORKFLOW_TEMPLATES.map(template => ({ key: template.key, name: template.name, description: template.description, trigger: template.trigger, inputs: template.inputSchema, steps: template.steps.map(step => ({ key: step.key, name: step.name, action: step.action })) }));
    }

    actions() {
        return [...this.engine.knownActions()].map(key => {
            const action = this.engine.action(key)!;
            return { key, name: action.name, description: action.description, riskTier: action.riskTier, external: action.external };
        });
    }

    listDefinitions(actor: BrainActor) {
        return this.unit.brainWorkforce.listWorkflowDefinitions(actor.workspaceId, BRAIN_LIMITS.listLimit);
    }

    async getDefinition(actor: BrainActor, id: string): Promise<BrainWorkflowDefinition> {
        const definition = await this.unit.brainWorkforce.findWorkflowDefinition(id, actor.workspaceId);
        if (!definition) throw new AppError(404, BRAIN_ERRORS.workflowNotFound);
        return definition;
    }

    async createDefinition(actor: BrainActor, input: WorkflowDefinitionInput): Promise<BrainWorkflowDefinition> {
        validateSteps(input.steps, this.engine.knownActions());
        if (await this.unit.brainWorkforce.findLatestWorkflowByKey(actor.workspaceId, input.key)) throw new AppError(409, "A workflow with this key already exists. Edit it to create a new version.");
        const definition = await this.unit.brainWorkforce.createWorkflowDefinition({
            workspaceId: actor.workspaceId, key: input.key, name: input.name, description: input.description ?? null, version: 1, status: BRAIN_WORKFLOW_STATUSES.draft,
            inputSchema: input.inputSchema as unknown as Array<Record<string, unknown>>, steps: input.steps as unknown as Array<Record<string, unknown>>, trigger: input.trigger, createdBy: actor.userId,
        });
        await this.audit.record(entryFor(actor, "workflow.definition.created", "workflow", definition.id, { metadata: { key: definition.key, steps: input.steps.length } }));
        return definition;
    }

    async createFromTemplate(actor: BrainActor, input: { template: string; name: string; key?: string; description?: string }): Promise<BrainWorkflowDefinition> {
        const template = WORKFLOW_TEMPLATES.find(item => item.key === input.template);
        if (!template) throw new AppError(404, "Workflow template not found");
        const key = await this.uniqueKey(actor.workspaceId, input.key ?? input.name, template.key);
        return this.createDefinition(actor, { key, name: input.name, description: input.description ?? template.description, inputSchema: template.inputSchema, steps: template.steps, trigger: template.trigger });
    }

    /**
     * FR-INT-007: a recommendation that implies a consequential change becomes a draft workflow whose first step is
     * a human approval gate, so nothing happens until an authorised person approves it.
     */
    async draftFromRecommendation(actor: BrainActor, run: { id: string; result: unknown }, index: number): Promise<BrainWorkflowDefinition> {
        const recommendation = ((run.result as { recommendations?: Array<{ title: string; rationale: string; expectedImpact: string }> }).recommendations ?? [])[index];
        if (!recommendation) throw new AppError(404, "Recommendation not found");
        const key = await this.uniqueKey(actor.workspaceId, `recommendation-${run.id.slice(0, 8)}-${index}`, "recommendation");
        return this.createDefinition(actor, {
            key, name: recommendation.title.slice(0, 200), description: `${recommendation.rationale} Source analysis run ${run.id}.`, inputSchema: [], trigger: { type: "manual" },
            steps: [
                { key: "approve", name: "Approve the recommendation", action: "brain.approval_gate", input: { title: recommendation.title.slice(0, 200), summary: `${recommendation.rationale} Expected impact: ${recommendation.expectedImpact}`.slice(0, 2_000) }, dependsOn: [] },
                { key: "notify", name: "Notify the team", action: "brain.notify_members", input: { title: `Approved: ${recommendation.title}`.slice(0, 200), message: recommendation.expectedImpact.slice(0, 2_000), minimumAccess: "write" }, dependsOn: ["approve"] },
            ],
        });
    }

    private async uniqueKey(workspaceId: string, base: string, fallback: string): Promise<string> {
        const stem = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || fallback;
        let key = /^[a-z]/.test(stem) ? stem : `w-${stem}`.slice(0, 70);
        for (let suffix = 2; await this.unit.brainWorkforce.findLatestWorkflowByKey(workspaceId, key); suffix++) key = `${stem.slice(0, 70)}-${suffix}`;
        return key;
    }

    /** Drafts change in place; a published definition is never edited, so the change becomes the next draft version. */
    async updateDefinition(actor: BrainActor, id: string, input: Omit<WorkflowDefinitionInput, "key">): Promise<BrainWorkflowDefinition> {
        validateSteps(input.steps, this.engine.knownActions());
        const existing = await this.getDefinition(actor, id);
        const values = { name: input.name, description: input.description ?? null, inputSchema: input.inputSchema as unknown as Array<Record<string, unknown>>, steps: input.steps as unknown as Array<Record<string, unknown>>, trigger: input.trigger };
        let definition: BrainWorkflowDefinition;
        if (existing.status === BRAIN_WORKFLOW_STATUSES.draft) definition = (await this.unit.brainWorkforce.updateWorkflowDefinition(id, actor.workspaceId, values))!;
        else {
            const latest = await this.unit.brainWorkforce.findLatestWorkflowByKey(actor.workspaceId, existing.key);
            definition = await this.unit.brainWorkforce.createWorkflowDefinition({ workspaceId: actor.workspaceId, key: existing.key, version: (latest?.version ?? existing.version) + 1, status: BRAIN_WORKFLOW_STATUSES.draft, createdBy: actor.userId, ...values });
        }
        await this.audit.record(entryFor(actor, "workflow.definition.updated", "workflow", definition.id, { metadata: { key: definition.key, version: definition.version } }));
        return definition;
    }

    /** Activating a version archives the previously active one, so exactly one version of a key runs. */
    async activate(actor: BrainActor, id: string): Promise<BrainWorkflowDefinition> {
        const definition = await this.getDefinition(actor, id);
        validateSteps(definition.steps as unknown as WorkflowStep[], this.engine.knownActions());
        for (const other of await this.unit.brainWorkforce.listWorkflowDefinitions(actor.workspaceId, 500)) {
            if (other.key === definition.key && other.id !== id && other.status === BRAIN_WORKFLOW_STATUSES.active) await this.unit.brainWorkforce.updateWorkflowDefinition(other.id, actor.workspaceId, { status: BRAIN_WORKFLOW_STATUSES.archived, nextRunAt: null });
        }
        const activated = await this.unit.brainWorkforce.updateWorkflowDefinition(id, actor.workspaceId, { status: BRAIN_WORKFLOW_STATUSES.active, nextRunAt: nextRunFor(definition.trigger as WorkflowTrigger) });
        await this.audit.record(entryFor(actor, "workflow.definition.activated", "workflow", id, { metadata: { key: definition.key, version: definition.version } }));
        return activated!;
    }

    async archive(actor: BrainActor, id: string): Promise<BrainWorkflowDefinition> {
        await this.getDefinition(actor, id);
        const archived = await this.unit.brainWorkforce.updateWorkflowDefinition(id, actor.workspaceId, { status: BRAIN_WORKFLOW_STATUSES.archived, nextRunAt: null });
        await this.audit.record(entryFor(actor, "workflow.definition.archived", "workflow", id));
        return archived!;
    }

    async startRun(actor: BrainActor, id: string, inputs: Record<string, unknown>, idempotencyKey?: string) {
        const definition = await this.getDefinition(actor, id);
        const { run, created } = await this.engine.start(actor, definition, inputs, BRAIN_WORKFLOW_TRIGGERS.manual, idempotencyKey ? `manual:${idempotencyKey}` : undefined);
        return { run, created };
    }

    listRuns(actor: BrainActor, options: { definitionId?: string; status?: string; limit?: number }) {
        return this.unit.brainWorkforce.listWorkflowRuns(actor.workspaceId, { ...options, limit: Math.min(options.limit ?? 25, BRAIN_LIMITS.listLimit) });
    }

    /** Run status, per-step history, errors and action evidence (FR-WF-008). */
    async getRun(actor: BrainActor, id: string) {
        const run = await this.unit.brainWorkforce.findWorkflowRun(id, actor.workspaceId);
        if (!run) throw new AppError(404, BRAIN_ERRORS.workflowRunNotFound);
        const [definition, steps, approvals] = await Promise.all([
            this.unit.brainWorkforce.findWorkflowDefinition(run.definitionId, actor.workspaceId),
            this.unit.brainWorkforce.listStepRuns(run.id),
            this.unit.brainWorkforce.listApprovals(actor.workspaceId, { limit: 100 }),
        ]);
        return { run, definition: definition ? { id: definition.id, key: definition.key, name: definition.name, version: definition.version, steps: definition.steps } : null, steps, approvals: approvals.filter(approval => approval.runId === run.id).map(approvalView) };
    }

    cancelRun(actor: BrainActor, id: string) { return this.engine.cancel(actor, id); }
    retryRun(actor: BrainActor, id: string) { return this.engine.retry(actor, id); }

    async listApprovals(actor: BrainActor, status?: string) {
        const [approvals, workspace] = await Promise.all([this.unit.brainWorkforce.listApprovals(actor.workspaceId, { status, limit: BRAIN_LIMITS.listLimit }), this.unit.workspaces.findById(actor.workspaceId)]);
        return approvals.map(approval => ({ ...approvalView(approval), workspace: workspace ? { id: workspace.id, name: workspace.name } : null, canDecide: canApprove(actor.role, approval.riskTier) }));
    }

    /**
     * Records a decision bound to the payload hash the reviewer saw. A changed payload, a second decision by the
     * same person, or self-approval of a critical action is refused. Enough approvals approve; any rejection rejects.
     */
    async decideApproval(actor: BrainActor, id: string, input: { decision: "approved" | "rejected"; note?: string | null; payloadHash: string }) {
        const approval = await this.unit.brainWorkforce.findApproval(id, actor.workspaceId);
        if (!approval) throw new AppError(404, BRAIN_ERRORS.approvalNotFound);
        if (approval.status !== BRAIN_APPROVAL_STATUSES.pending) throw new AppError(409, BRAIN_ERRORS.approvalClosed);
        if (approval.expiresAt.getTime() <= Date.now()) {
            await this.unit.brainWorkforce.updateApproval(id, BRAIN_APPROVAL_STATUSES.pending, { status: BRAIN_APPROVAL_STATUSES.expired, decidedAt: new Date() });
            throw new AppError(409, BRAIN_ERRORS.approvalClosed);
        }
        if (input.payloadHash !== approval.payloadHash) throw new AppError(409, BRAIN_ERRORS.approvalChanged);
        if (!canApprove(actor.role, approval.riskTier)) throw new AppError(403, approval.riskTier === BRAIN_RISK_TIERS.critical ? "Only workspace owners and administrators can approve critical actions." : "Workspace owner, administrator or manager access is required to decide approvals.");
        if (approval.decisions.some(decision => decision.userId === actor.userId)) throw new AppError(409, BRAIN_ERRORS.approvalDuplicateDecision);
        if (approval.riskTier === BRAIN_RISK_TIERS.critical && approval.requestedByUser === actor.userId && input.decision === "approved") throw new AppError(403, BRAIN_ERRORS.approvalSelf);
        const decisions: BrainApprovalDecision[] = [...approval.decisions, { userId: actor.userId!, decision: input.decision, note: input.note?.slice(0, 1_000) ?? null, at: new Date().toISOString() }];
        const approvedCount = decisions.filter(decision => decision.decision === "approved").length;
        const status = input.decision === "rejected" ? BRAIN_APPROVAL_STATUSES.rejected : approvedCount >= approval.requiredApprovals ? BRAIN_APPROVAL_STATUSES.approved : BRAIN_APPROVAL_STATUSES.pending;
        const updated = await this.unit.brainWorkforce.updateApproval(id, BRAIN_APPROVAL_STATUSES.pending, { decisions, status, ...(status !== BRAIN_APPROVAL_STATUSES.pending ? { decidedAt: new Date() } : {}) });
        if (!updated) throw new AppError(409, BRAIN_ERRORS.approvalClosed);
        await this.audit.record(entryFor(actor, `approval.${input.decision}`, "approval", id, { metadata: { status, tier: approval.riskTier, action: approval.action, payloadHash: approval.payloadHash, approvals: approvedCount, required: approval.requiredApprovals } }));
        await this.audit.publishQuietly(actor.workspaceId, BRAIN_EVENT_TYPES.approvalDecided, { approvalId: id, decision: input.decision, status }, { actorId: actorId(actor) });
        await this.audit.activity(actor.workspaceId, actor.userId, "decisions", `${input.decision === "approved" ? "Approved" : "Rejected"} "${approval.title}"`, "brain-approval", id, { event: "approval-decided", decision: input.decision });
        if (status !== BRAIN_APPROVAL_STATUSES.pending) {
            // Decision memory (PRD 6.5): the decision, its approvers and the exact payload version it applied to.
            await this.unit.business.addMemory({
                workspaceId: actor.workspaceId, memoryType: "decision", title: `${status === BRAIN_APPROVAL_STATUSES.approved ? "Approved" : "Rejected"}: ${approval.title}`.slice(0, 255),
                content: `${approval.riskTier} risk action ${approval.action} was ${status}. ${input.note ? `Note: ${input.note.slice(0, 500)}` : ""}`.trim(),
                importance: approval.riskTier === BRAIN_RISK_TIERS.critical || approval.riskTier === BRAIN_RISK_TIERS.high ? "high" : "medium",
                metadata: { approvalId: id, payloadHash: approval.payloadHash, decisions },
            }).catch(error => logger.warn({ approvalId: id, error: String(error) }, "Decision memory could not be recorded"));
            await this.afterDecision(updated);
        }
        return approvalView(updated);
    }

    /** Resumes whatever was waiting: a workflow run, or an agent action that now runs with its bound payload. */
    private async afterDecision(approval: BrainActionApproval): Promise<void> {
        if (approval.runId) {
            await this.engine.resumeAfterDecision(approval).catch(error => logger.warn({ approvalId: approval.id, error: String(error) }, "The workflow did not resume after the decision"));
            return;
        }
        if (!approval.taskId) return;
        const task = await this.unit.brainWorkforce.findTask(approval.taskId, approval.workspaceId);
        const step = task ? (await this.unit.brainWorkforce.listSteps(task.id)).find(item => String(item.stepIndex) === approval.stepKey) : undefined;
        if (!task || !step) return;
        if (approval.status !== BRAIN_APPROVAL_STATUSES.approved) {
            await this.unit.brainWorkforce.updateStep(step.id, { status: BRAIN_STEP_STATUSES.failed, error: "Rejected by an approver.", finishedAt: new Date() });
            return;
        }
        const role = task.initiatedBy ? await this.roleOf(task.initiatedBy, task.workspaceId) : null;
        const requester = task.initiatedBy && role ? userActor(task.initiatedBy, task.workspaceId, role) : systemActor(task.workspaceId);
        const agent = agentByKey(step.agentKey);
        if (!agent) return;
        const execution = await this.gateway.executeApproved(approval, requester, agent).catch(error => ({ status: "failed" as const, output: null, error: error instanceof AppError ? error.message : "The approved action failed." }));
        await this.unit.brainWorkforce.updateStep(step.id, { status: execution.status, output: execution.output ? { summary: execution.output.summary, statements: execution.output.statements, data: execution.output.data } : null, error: execution.error, finishedAt: new Date() });
        if (task.conversationId) {
            const content = execution.status === "succeeded" ? `Approved action completed: ${execution.output!.summary}` : `The approved action did not complete: ${execution.error}`;
            await this.unit.brainGovernance.addMessage({ workspaceId: task.workspaceId, conversationId: task.conversationId, role: "assistant", content, payload: { approvals: [approval.id], insights: execution.output?.statements.map(statement => statement.text) ?? [] }, taskId: task.id });
        }
    }

    // ---- WorkflowPort: what agents may ask of the workflow engine ----

    async draftFromTemplate(actor: BrainActor, input: { template: string; name: string; description?: string }) {
        const definition = await this.createFromTemplate(actor, input);
        return { id: definition.id, key: definition.key, name: definition.name, status: definition.status };
    }

    async requestExternalAction(actor: BrainActor, input: { connectionName: string; path: string; payload: Record<string, unknown>; title: string; summary: string; recipients: string[] }, context: { taskId: string | null; correlationId: string }) {
        const connections = await this.unit.connections.listByWorkspace(actor.workspaceId);
        const wanted = input.connectionName.toLowerCase();
        const candidates = connections.filter(connection => connection.name.toLowerCase() === wanted || connection.name.toLowerCase().includes(wanted));
        if (!candidates.length) throw new AppError(404, `No connection named "${input.connectionName}" exists in this workspace.`);
        const definitionIds = await Promise.all(candidates.map(async connection => ({ connection, definition: await this.unit.connectionDefinitions.findInWorkspace(connection.definitionId, actor.workspaceId) })));
        const target = definitionIds.find(item => item.definition && agentKindOf(item.definition.adapterKey) === "api")?.connection;
        if (!target) throw new AppError(422, "External delivery needs an HTTP API connection.");
        const definition = await this.systemDefinition(actor);
        const { run } = await this.engine.start(actor, definition, { connection_id: target.id, path: input.path, body: input.payload, title: input.title, summary: input.summary, recipients: input.recipients }, BRAIN_WORKFLOW_TRIGGERS.manual, context.taskId ? `task:${context.taskId}:${context.correlationId}` : undefined);
        const advanced = await this.engine.advance(run.id, actor.workspaceId);
        const approval = (await this.unit.brainWorkforce.listApprovals(actor.workspaceId, { status: BRAIN_APPROVAL_STATUSES.pending, limit: 20 })).find(item => item.runId === run.id);
        return { runId: run.id, approvalId: approval?.id ?? null, status: advanced?.status ?? run.status };
    }

    async pendingApprovals(actor: BrainActor) {
        return (await this.unit.brainWorkforce.listApprovals(actor.workspaceId, { status: BRAIN_APPROVAL_STATUSES.pending, limit: 25 })).map(approval => ({ id: approval.id, title: approval.title, riskTier: approval.riskTier, action: approval.action, createdAt: approval.createdAt, expiresAt: approval.expiresAt }));
    }

    // ---- Triggers, called by the scheduler ----

    /** Starts one run per due scheduled definition, as its creator (so it runs with their current permissions). */
    async triggerScheduled(limit: number): Promise<number> {
        const due = await this.unit.brainWorkforce.claimDueScheduledWorkflows(limit);
        for (const definition of due) {
            try {
                const actor = await this.ownerActor(definition);
                await this.engine.start(actor, definition, {}, BRAIN_WORKFLOW_TRIGGERS.schedule, `schedule:${definition.id}:${new Date().toISOString().slice(0, 16)}`);
            } catch (error) {
                logger.warn({ definitionId: definition.id, error: String(error) }, "A scheduled workflow could not start");
            }
        }
        return due.length;
    }

    /** Event-triggered execution (FR-WF-007): matching active definitions start once per event (idempotent). */
    async handleEvent(event: BrainEvent): Promise<number> {
        const definitions = await this.unit.brainWorkforce.listActiveEventWorkflows(event.workspaceId, event.eventType);
        let started = 0;
        for (const definition of definitions) {
            const trigger = definition.trigger as WorkflowTrigger;
            if (trigger.type === "event" && trigger.filter && (event.payload as Record<string, unknown>)[trigger.filter.field] !== trigger.filter.equals) continue;
            const schema = definition.inputSchema as unknown as WorkflowInput[];
            const payload = event.payload as Record<string, unknown>;
            const inputs = Object.fromEntries(schema.map(field => [field.name, payload[field.name] ?? Object.entries(payload).find(([key]) => snake(key) === field.name)?.[1]]).filter(([, value]) => value !== undefined));
            try {
                const actor = await this.ownerActor(definition);
                await this.engine.start(actor, definition, inputs, BRAIN_WORKFLOW_TRIGGERS.event, `event:${event.id}:${definition.id}`);
                started++;
            } catch (error) {
                logger.warn({ definitionId: definition.id, eventId: event.id, error: String(error) }, "An event-triggered workflow could not start");
            }
        }
        return started;
    }

    private async ownerActor(definition: BrainWorkflowDefinition): Promise<BrainActor> {
        if (!definition.createdBy) return systemActor(definition.workspaceId);
        const role = await this.roleOf(definition.createdBy, definition.workspaceId).catch(() => null);
        if (!role) throw new AppError(403, "The workflow's owner no longer has access to the workspace.");
        return userActor(definition.createdBy, definition.workspaceId, role);
    }

    /** The approval-gated definition agents use for external actions, created on first use and kept active. */
    private async systemDefinition(actor: BrainActor): Promise<BrainWorkflowDefinition> {
        const existing = await this.unit.brainWorkforce.findLatestWorkflowByKey(actor.workspaceId, SYSTEM_EXTERNAL_ACTION_KEY);
        if (existing?.status === BRAIN_WORKFLOW_STATUSES.active) return existing;
        const template = WORKFLOW_TEMPLATES.find(item => item.key === "approved-outreach")!;
        const definition = existing ?? await this.unit.brainWorkforce.createWorkflowDefinition({
            workspaceId: actor.workspaceId, key: SYSTEM_EXTERNAL_ACTION_KEY, name: "Approved external action", description: "Created by the AI Workforce for agent-requested external actions. Every run waits for approval of the exact payload.",
            version: 1, status: BRAIN_WORKFLOW_STATUSES.draft, inputSchema: template.inputSchema as unknown as Array<Record<string, unknown>>, steps: template.steps as unknown as Array<Record<string, unknown>>, trigger: { type: "manual" }, createdBy: null,
        });
        return (await this.unit.brainWorkforce.updateWorkflowDefinition(definition.id, actor.workspaceId, { status: BRAIN_WORKFLOW_STATUSES.active }))!;
    }
}

export function approvalView(approval: BrainActionApproval) {
    return {
        id: approval.id, runId: approval.runId, taskId: approval.taskId, stepKey: approval.stepKey, action: approval.action, title: approval.title,
        riskTier: approval.riskTier, preview: approval.preview, payloadHash: approval.payloadHash, status: approval.status,
        requiredApprovals: approval.requiredApprovals, decisions: approval.decisions, requestedByAgent: approval.requestedByAgent,
        requestedByUser: approval.requestedByUser, decidedAt: approval.decidedAt, expiresAt: approval.expiresAt, createdAt: approval.createdAt,
    };
}
