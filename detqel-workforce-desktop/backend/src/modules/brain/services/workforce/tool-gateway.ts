import {
    BRAIN_APPROVAL_STATUSES, BRAIN_AUDIT_OUTCOMES, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_POLICY_DECISIONS, BRAIN_RISK_ORDER,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainActionApproval } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, hashOf, type BrainActor } from "../brain-types.js";
import type { AgentDefinition } from "./agent-catalog.js";
import { decide, type BrainPolicyService, type PolicyOutcome } from "./policy-engine.js";
import type { ToolContext, ToolDefinition, ToolOutput } from "./tool-registry.js";

const logger = createScopedLogger("brain-tool-gateway");

export interface ToolExecution {
    readonly status: "succeeded" | "failed" | "blocked" | "waiting_approval";
    readonly output: ToolOutput | null;
    readonly error: string | null;
    readonly policy: PolicyOutcome | null;
    readonly approvalId: string | null;
    readonly durationMs: number;
    readonly input: Record<string, unknown>;
}

/** The approval binds to this exact tool, version and input. Any change produces a different hash. */
export const actionHash = (tool: Pick<ToolDefinition, "key" | "version">, input: unknown) => hashOf({ tool: tool.key, version: tool.version, input });

const safeError = (error: unknown): string =>
    error instanceof AppError && (error.statusCode < 500 || error.expose) ? error.message : "The tool could not complete this step.";

/** Keeps a tool's structured data within the size a model and the task record can hold. */
function bounded(output: ToolOutput): ToolOutput {
    if (JSON.stringify(output.data).length <= BRAIN_LIMITS.maxToolOutputCharacters) return output;
    return { ...output, data: { truncated: true, summary: output.summary } };
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number, outer?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new AppError(504, "The tool took too long to respond.")), timeoutMs);
    const onAbort = () => controller.abort(outer?.reason);
    outer?.addEventListener("abort", onAbort, { once: true });
    try {
        return await Promise.race([
            work(controller.signal),
            new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason ?? new AppError(504, "The tool took too long to respond.")), { once: true })),
        ]);
    } finally {
        clearTimeout(timer);
        outer?.removeEventListener("abort", onAbort);
    }
}

/**
 * The only path from an agent to a tool (FR-AGT-002..006). Independently of any plan or model it checks that the
 * agent may use the tool, validates the input against the tool's typed contract, applies the action-risk policy,
 * binds approvals to the exact payload, enforces a timeout, and audits every call with its policy decision.
 */
export class ToolGateway {
    constructor(
        private readonly unit: IUnitOfWork,
        private readonly audit: BrainAuditService,
        private readonly tools: ReadonlyMap<string, ToolDefinition>,
        private readonly policies: BrainPolicyService,
    ) {}

    tool(key: string): ToolDefinition | undefined { return this.tools.get(key); }
    catalog(): ToolDefinition[] { return [...this.tools.values()]; }

    async execute(context: ToolContext, agent: AgentDefinition, toolKey: string, rawInput: unknown, stepIndex: number): Promise<ToolExecution> {
        const started = Date.now();
        const tool = this.tools.get(toolKey);
        const blocked = async (reason: string, policy: PolicyOutcome | null = null): Promise<ToolExecution> => {
            await this.audit.recordQuietly(entryFor(context.actor, "agent.tool.blocked", "tool", toolKey, { outcome: BRAIN_AUDIT_OUTCOMES.denied, decision: policy?.decision ?? BRAIN_POLICY_DECISIONS.deny, correlationId: context.correlationId, metadata: { agent: `${agent.key}@${agent.version}`, taskId: context.taskId, reason } }));
            return { status: "blocked", output: null, error: reason, policy, approvalId: null, durationMs: Date.now() - started, input: {} };
        };
        if (!tool) return blocked("That tool does not exist.");
        if (!agent.tools.includes(tool.key)) return blocked(`${agent.name} is not permitted to use ${tool.key}.`);
        if (BRAIN_RISK_ORDER[tool.riskTier] > BRAIN_RISK_ORDER[agent.maxRiskTier]) return blocked(`${tool.key} exceeds ${agent.name}'s risk ceiling.`);
        const parsed = tool.input.safeParse(rawInput ?? {});
        if (!parsed.success) {
            const detail = parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
            return { status: "failed", output: null, error: `The step's input was not valid (${detail}).`, policy: null, approvalId: null, durationMs: Date.now() - started, input: {} };
        }
        const input = parsed.data as Record<string, unknown>;
        const settings = await this.policies.get(context.actor.workspaceId);
        const policy = decide(context.actor, tool, settings);
        if (policy.decision === BRAIN_POLICY_DECISIONS.deny) return { ...(await blocked(policy.reason, policy)), input };
        if (policy.decision === BRAIN_POLICY_DECISIONS.requireApproval) {
            const approval = await this.requestApproval(context, agent, tool, input, policy, stepIndex, settings.approvalTtlHours);
            return { status: "waiting_approval", output: null, error: null, policy, approvalId: approval.id, durationMs: Date.now() - started, input };
        }
        return this.run(context, agent, tool, input, policy, started);
    }

    /**
     * Runs an agent action after its approval. The payload hash is recomputed from what is about to run, so an
     * approval can never authorise anything other than the exact action the approvers saw.
     */
    async executeApproved(approval: BrainActionApproval, requester: BrainActor, agent: AgentDefinition): Promise<ToolExecution> {
        const tool = this.tools.get(approval.action);
        if (!tool) throw new AppError(409, "The approved tool is no longer available.");
        const input = (approval.payload as { input?: Record<string, unknown> }).input ?? {};
        if (actionHash(tool, input) !== approval.payloadHash) throw new AppError(409, "The approved action no longer matches what was approved.");
        const context: ToolContext = { actor: requester, taskId: approval.taskId, correlationId: approval.id, agentKey: agent.key };
        const settings = await this.policies.get(requester.workspaceId);
        return this.run(context, agent, tool, input, decide(requester, tool, settings), Date.now());
    }

    private async run(context: ToolContext, agent: AgentDefinition, tool: ToolDefinition, input: Record<string, unknown>, policy: PolicyOutcome, started: number): Promise<ToolExecution> {
        try {
            const output = bounded(await withTimeout(signal => tool.handler({ ...context, signal }, input), BRAIN_LIMITS.toolTimeoutMs, context.signal));
            await this.audit.recordQuietly(entryFor(context.actor, "agent.tool.executed", "tool", tool.key, { decision: policy.decision, correlationId: context.correlationId, metadata: { agent: `${agent.key}@${agent.version}`, toolVersion: tool.version, tier: policy.tier, taskId: context.taskId, inputHash: hashOf(input), durationMs: Date.now() - started } }));
            return { status: "succeeded", output, error: null, policy, approvalId: null, durationMs: Date.now() - started, input };
        } catch (error) {
            if (!(error instanceof AppError) || error.statusCode >= 500) logger.warn({ tool: tool.key, taskId: context.taskId, error: String(error) }, "A tool failed");
            await this.audit.recordQuietly(entryFor(context.actor, "agent.tool.failed", "tool", tool.key, { outcome: BRAIN_AUDIT_OUTCOMES.failure, decision: policy.decision, correlationId: context.correlationId, metadata: { agent: `${agent.key}@${agent.version}`, taskId: context.taskId, error: safeError(error) } }));
            return { status: "failed", output: null, error: safeError(error), policy, approvalId: null, durationMs: Date.now() - started, input };
        }
    }

    private async requestApproval(context: ToolContext, agent: AgentDefinition, tool: ToolDefinition, input: Record<string, unknown>, policy: PolicyOutcome, stepIndex: number, ttlHours: number): Promise<BrainActionApproval> {
        const approval = await this.unit.brainWorkforce.createApproval({
            workspaceId: context.actor.workspaceId, taskId: context.taskId, stepKey: String(stepIndex), action: tool.key,
            title: `${agent.name}: ${tool.description}`.slice(0, 255), riskTier: policy.tier,
            payload: { input }, payloadHash: actionHash(tool, input),
            preview: { action: tool.key, version: tool.version, ...(tool.preview ? tool.preview(input as never) : { input }) },
            status: BRAIN_APPROVAL_STATUSES.pending, requiredApprovals: Math.max(1, policy.requiredApprovals),
            requestedByAgent: `${agent.key}@${agent.version}`, requestedByUser: context.actor.userId,
            expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
        });
        await this.audit.recordQuietly(entryFor(context.actor, "agent.tool.approval_requested", "approval", approval.id, { decision: policy.decision, correlationId: context.correlationId, metadata: { tool: tool.key, tier: policy.tier, taskId: context.taskId } }));
        await this.audit.publishQuietly(context.actor.workspaceId, BRAIN_EVENT_TYPES.approvalRequested, { approvalId: approval.id, action: tool.key, riskTier: policy.tier }, { actorId: actorId(context.actor), correlationId: context.correlationId });
        return approval;
    }
}
