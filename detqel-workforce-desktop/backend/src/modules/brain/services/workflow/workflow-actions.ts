import { z } from "zod";
import { AGENT_CONNECTOR_KINDS } from "../../../../constants/agentContextConstants.js";
import { BRAIN_ERRORS, BRAIN_RISK_TIERS, BRAIN_RUN_TRIGGERS } from "../../../../constants/brainConstants.js";
import { CONNECTOR_OPERATIONS } from "../../../../constants/connectorOperationConstants.js";
import { redactValue } from "../../../../shared/agents/context/data-guard.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainWorkflowRun } from "../../../../shared/types/entities.js";
import { agentKindOf } from "../../../connections/services/connector-agent-policy.js";
import { roleAllows, type WorkspaceAccess } from "../../../workspaces/services/workspace-access.service.js";
import type { BrainAuditService } from "../brain-audit.service.js";
import { formatValue, type BrainActor } from "../brain-types.js";
import type { MedallionPipeline } from "../data/medallion-pipeline.service.js";
import type { ConnectionReaderPort } from "../data/source-extractor.js";
import type { IntelligenceService } from "../intelligence/intelligence.service.js";
import type { ActionDescriptor } from "../workforce/policy-engine.js";

export interface WorkflowActionContext {
    readonly actor: BrainActor;
    readonly run: BrainWorkflowRun;
    readonly stepKey: string;
    /** Sent to external systems so a retried side effect is not repeated where the integration supports it (FR-WF-006). */
    readonly idempotencyKey: string;
    readonly signal: AbortSignal;
}
export interface WorkflowActionDefinition<I = unknown> extends ActionDescriptor {
    readonly name: string;
    readonly description: string;
    readonly input: z.ZodType<I>;
    readonly preview?: (input: I) => Record<string, unknown>;
    readonly handler: (context: WorkflowActionContext, input: I) => Promise<Record<string, unknown>>;
}
export interface WorkflowActionDependencies {
    readonly unit: IUnitOfWork;
    readonly pipeline: MedallionPipeline;
    readonly intelligence: IntelligenceService;
    readonly connections: ConnectionReaderPort;
    readonly audit: BrainAuditService;
}

const MAX_RESPONSE_CHARACTERS = 4_000;
const uuid = z.string().uuid();

/** Workflow actions. Each declares its risk tier and whether it reaches an external system; the engine applies policy. */
export function createWorkflowActions(deps: WorkflowActionDependencies): Map<string, WorkflowActionDefinition> {
    const actions: WorkflowActionDefinition<any>[] = [
        {
            key: "brain.sync_dataset", name: "Sync dataset", riskTier: BRAIN_RISK_TIERS.moderate, access: "write", external: false,
            description: "Runs the dataset's Medallion pipeline and waits for it to finish.",
            input: z.object({ datasetId: uuid }).strict(),
            handler: async (context, input: { datasetId: string }) => {
                let started;
                try { started = await deps.pipeline.claimAndStart(context.actor, input.datasetId, BRAIN_RUN_TRIGGERS.workflow); }
                catch (error) {
                    // Another sync holding the lease is a reason to wait and retry, not to fail the workflow.
                    if (error instanceof AppError && error.message === BRAIN_ERRORS.datasetBusy) throw new AppError(503, error.message);
                    throw error;
                }
                const run = await started.completion;
                if (run.status === "failed") throw new AppError(422, `The dataset sync failed: ${run.errorMessage ?? "unknown error"}`);
                return { runId: run.id, status: run.status, passRate: run.passRate, published: run.published, quarantined: run.quarantinedCount };
            },
        },
        {
            key: "brain.quality_check", name: "Check data quality", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Reports the latest pipeline pass rate against the dataset's threshold without failing the workflow.",
            input: z.object({ datasetId: uuid }).strict(),
            handler: async (context, input: { datasetId: string }) => {
                const dataset = await deps.unit.brainData.findDataset(input.datasetId, context.actor.workspaceId);
                if (!dataset) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
                const [run] = await deps.unit.brainData.listRuns(context.actor.workspaceId, { datasetId: dataset.id, limit: 1 });
                const passRate = run?.passRate ?? null;
                const belowThreshold = passRate !== null && passRate < dataset.qualityThreshold;
                return {
                    datasetId: dataset.id, dataset: dataset.name, passRate, threshold: dataset.qualityThreshold, belowThreshold, quarantined: run?.quarantinedCount ?? 0,
                    summaryText: passRate === null ? `${dataset.name} has no completed quality run yet.` : `${dataset.name}: ${(passRate * 100).toFixed(1)}% of records passed (threshold ${(dataset.qualityThreshold * 100).toFixed(0)}%), ${run?.quarantinedCount ?? 0} quarantined.`,
                };
            },
        },
        {
            key: "brain.run_forecast", name: "Run forecast", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Runs a governed forecast and records it in the run registry.",
            input: z.object({ metricKey: z.string().min(1).max(80), horizon: z.number().int().min(1).max(24).default(3) }).strict(),
            handler: async (context, input: { metricKey: string; horizon: number }) => {
                const run = await deps.intelligence.forecast(context.actor, input, { correlationId: context.run.correlationId });
                const result = run.result as { summary?: { next?: { value: number; period: string }; uncertaintyPercent?: number | null }; metric?: { name: string; unit: string; currency: string | null }; reason?: string };
                const next = result.summary?.next;
                const summaryText = run.status === "succeeded" && next && result.metric
                    ? `${result.metric.name} is forecast at ${formatValue(next.value, result.metric.unit, result.metric.currency)} for the period starting ${next.period}${result.summary?.uncertaintyPercent ? ` (±${result.summary.uncertaintyPercent}%)` : ""}. Run ${run.id}.`
                    : `The forecast was withheld: ${result.reason ?? "insufficient data"}.`;
                return { runId: run.id, status: run.status, summaryText };
            },
        },
        {
            key: "brain.run_root_cause", name: "Run root-cause analysis", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Attributes a metric's latest change to the values of one dimension.",
            input: z.object({ metricKey: z.string().min(1).max(80), dimension: z.string().max(120).optional() }).strict(),
            handler: async (context, input: { metricKey: string; dimension?: string }) => {
                const run = await deps.intelligence.rootCause(context.actor, input, { correlationId: context.run.correlationId });
                const statements = ((run.result as { statements?: Array<{ text: string }> }).statements ?? []).slice(0, 3).map(item => item.text);
                return { runId: run.id, status: run.status, summaryText: statements.join(" ") };
            },
        },
        {
            key: "brain.create_document", name: "Save internal document", riskTier: BRAIN_RISK_TIERS.moderate, access: "write", external: false,
            description: "Saves an internal document to the workspace knowledge base.",
            input: z.object({ title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(20_000) }).strict(),
            preview: (input: { title: string; content: string }) => ({ title: input.title, contentPreview: input.content.slice(0, 600) }),
            handler: async (context, input: { title: string; content: string }) => {
                const item = await deps.unit.business.addKnowledge({ workspaceId: context.actor.workspaceId, title: input.title, content: input.content, sourceType: "document", sourceReference: `brain-workflow:${context.run.id}`, metadata: { workflowRunId: context.run.id, step: context.stepKey }, status: "active" });
                await deps.audit.activity(context.actor.workspaceId, context.actor.userId, "documents", `Saved "${input.title}"`, "business-knowledge", item.id, { event: "workflow-document-created" });
                return { documentId: item.id, title: item.title };
            },
        },
        {
            key: "brain.notify_members", name: "Notify workspace members", riskTier: BRAIN_RISK_TIERS.low, access: "read", external: false,
            description: "Sends an in-app notification to workspace members with at least the given access.",
            input: z.object({ title: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(2_000), minimumAccess: z.enum(["read", "write", "manage"]).default("write") }).strict(),
            handler: async (context, input: { title: string; message: string; minimumAccess: WorkspaceAccess }) => {
                const [workspace, members] = await Promise.all([deps.unit.workspaces.findById(context.actor.workspaceId), deps.unit.workspaces.getMembers(context.actor.workspaceId)]);
                const recipients = new Set(members.filter(member => member.status === "active" && roleAllows(member.role, input.minimumAccess)).map(member => member.user.id));
                if (workspace?.createdBy) recipients.add(workspace.createdBy);
                for (const userId of recipients) await deps.unit.notifications.create({ userId, workspaceId: context.actor.workspaceId, title: input.title, message: input.message, type: "info", link: "/brain" });
                return { notified: recipients.size };
            },
        },
        {
            key: "brain.approval_gate", name: "Human approval gate", riskTier: BRAIN_RISK_TIERS.high, access: "read", external: false,
            description: "Pauses the workflow until an authorised person approves the summary shown.",
            input: z.object({ title: z.string().trim().min(1).max(200), summary: z.string().trim().min(1).max(2_000) }).strict(),
            preview: (input: { title: string; summary: string }) => ({ title: input.title, summary: input.summary }),
            handler: async () => ({ approved: true }),
        },
        {
            key: "connector.http_post", name: "Post to a connected HTTP integration", riskTier: BRAIN_RISK_TIERS.high, access: "write", external: true,
            description: "Sends a JSON payload to a connected HTTP API, such as an email or messaging service, after approval.",
            input: z.object({
                connectionId: uuid, path: z.string().max(500).default(""), body: z.record(z.string(), z.unknown()),
                preview: z.object({ title: z.string().max(200).optional(), summary: z.string().max(2_000).optional(), recipients: z.unknown().optional() }).strict().optional(),
            }).strict(),
            preview: (input: { connectionId: string; path: string; body: Record<string, unknown>; preview?: { title?: string; summary?: string; recipients?: unknown } }) => ({
                target: { connectionId: input.connectionId, path: input.path || "/" },
                title: input.preview?.title ?? null, summary: input.preview?.summary ?? null,
                recipients: Array.isArray(input.preview?.recipients) ? input.preview!.recipients.slice(0, 200) : [],
                payloadPreview: JSON.stringify(redactValue(input.body)).slice(0, 1_500),
            }),
            handler: async (context, input: { connectionId: string; path: string; body: Record<string, unknown> }) => {
                // Checked at execution, not only at request time, so unlinking a source stops approved deliveries too.
                if (!await deps.unit.brainData.findSourceLink(context.actor.workspaceId, input.connectionId)) throw new AppError(409, BRAIN_ERRORS.sourceNotLinked);
                const reader = await deps.connections.readerFor(input.connectionId, context.actor.workspaceId);
                if (agentKindOf(reader.adapterKey) !== AGENT_CONNECTOR_KINDS.api || typeof reader.handle.execute !== "function") throw new AppError(422, "External delivery needs an HTTP API connection.");
                const result = await reader.handle.execute({ operation: CONNECTOR_OPERATIONS.write, parameters: { path: input.path, body: { ...input.body, idempotencyKey: context.idempotencyKey } } });
                const response = JSON.stringify(redactValue(result.data) ?? null);
                return { delivered: true, status: (result.metadata ?? {}).status ?? null, response: response.length > MAX_RESPONSE_CHARACTERS ? `${response.slice(0, MAX_RESPONSE_CHARACTERS)}…` : response, idempotencyKey: context.idempotencyKey };
            },
        },
    ];
    return new Map(actions.map(action => [action.key, action]));
}

