import { z } from "zod";
import { BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_TERMINAL_RUN_STATUSES, BRAIN_WORKFLOW_RUN_STATUSES, type BrainWorkflowRunStatus } from "../../../../constants/brainConstants.js";
import { AppError } from "../../../../shared/errors/app-error.js";

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/, "Use lowercase letters, numbers and underscores, starting with a letter.");
export const workflowConditionSchema = z.object({
    step: identifier, path: z.string().max(200), op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "exists"]), value: z.unknown().optional(),
}).strict();
export const workflowStepSchema = z.object({
    key: identifier,
    name: z.string().trim().min(1).max(200),
    action: z.string().max(80),
    input: z.record(z.string(), z.unknown()).default({}),
    dependsOn: z.array(identifier).max(BRAIN_LIMITS.maxWorkflowSteps).default([]),
    condition: workflowConditionSchema.optional(),
    retry: z.object({ maxAttempts: z.number().int().min(1).max(BRAIN_LIMITS.maxWorkflowStepAttempts), backoffSeconds: z.number().int().min(5).max(3_600) }).strict().optional(),
    timeoutSeconds: z.number().int().min(1).max(300).optional(),
}).strict();
export const workflowInputSchema = z.object({
    name: identifier, type: z.enum(["string", "number", "boolean", "object"]), required: z.boolean().default(false), description: z.string().max(300).optional(),
}).strict();
export const workflowTriggerSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("manual") }).strict(),
    z.object({ type: z.literal("schedule"), intervalMinutes: z.number().int().min(BRAIN_LIMITS.minSyncIntervalMinutes).max(BRAIN_LIMITS.maxSyncIntervalMinutes) }).strict(),
    z.object({ type: z.literal("event"), eventType: z.enum(Object.values(BRAIN_EVENT_TYPES) as [string, ...string[]]), filter: z.object({ field: z.string().max(80), equals: z.union([z.string(), z.number(), z.boolean()]) }).strict().optional() }).strict(),
]);
export type WorkflowStep = z.infer<typeof workflowStepSchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowTrigger = z.infer<typeof workflowTriggerSchema>;
export type WorkflowCondition = z.infer<typeof workflowConditionSchema>;

/**
 * Checks a definition before it can be saved or activated (FR-WF-001, FR-WF-002): unique step keys, known
 * actions, dependencies that exist, conditions that reference upstream steps, and no cycles.
 */
export function validateSteps(steps: ReadonlyArray<WorkflowStep>, knownActions: ReadonlySet<string>): void {
    if (!steps.length) throw new AppError(400, "A workflow needs at least one step.");
    if (steps.length > BRAIN_LIMITS.maxWorkflowSteps) throw new AppError(400, `A workflow can have at most ${BRAIN_LIMITS.maxWorkflowSteps} steps.`);
    const keys = new Set<string>();
    for (const step of steps) {
        if (keys.has(step.key)) throw new AppError(400, `Step key "${step.key}" is used twice.`);
        keys.add(step.key);
        if (!knownActions.has(step.action)) throw new AppError(400, `Step "${step.key}" uses an unknown action "${step.action}".`);
    }
    for (const step of steps) {
        for (const dependency of step.dependsOn) if (!keys.has(dependency) || dependency === step.key) throw new AppError(400, `Step "${step.key}" depends on unknown step "${dependency}".`);
        if (step.condition && !step.dependsOn.includes(step.condition.step)) throw new AppError(400, `Step "${step.key}" has a condition on "${step.condition.step}", which must be one of its dependencies.`);
    }
    // Kahn's algorithm: every step must become ready, otherwise there is a cycle.
    const remaining = new Map(steps.map(step => [step.key, new Set(step.dependsOn)]));
    let progressed = true;
    while (remaining.size && progressed) {
        progressed = false;
        for (const [key, dependencies] of remaining) {
            if ([...dependencies].every(dependency => !remaining.has(dependency))) { remaining.delete(key); progressed = true; }
        }
    }
    if (remaining.size) throw new AppError(400, `The workflow's dependencies form a cycle (${[...remaining.keys()].join(", ")}).`);
}

function valueAt(source: unknown, path: string): unknown {
    let current: unknown = source;
    for (const segment of path.split(".").filter(Boolean)) {
        if (current === null || typeof current !== "object" || ["__proto__", "prototype", "constructor"].includes(segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

const TEMPLATE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const WHOLE = /^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/;

/**
 * Resolves `{{inputs.x}}`, `{{steps.key.output.path}}`, `{{run.id}}` and `{{now}}` in step inputs. A value that is
 * exactly one template keeps its type; templates inside text are substituted as text. Nothing is evaluated.
 */
export function resolveTemplates(value: unknown, scope: Record<string, unknown>): unknown {
    if (typeof value === "string") {
        const whole = WHOLE.exec(value);
        if (whole) return valueAt(scope, whole[1]);
        return value.replace(TEMPLATE, (_match, path: string) => {
            const resolved = valueAt(scope, path);
            return resolved === undefined || resolved === null ? "" : typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved);
        });
    }
    if (Array.isArray(value)) return value.map(item => resolveTemplates(item, scope));
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveTemplates(item, scope)]));
    return value;
}

export function evaluateCondition(condition: WorkflowCondition, outputs: Record<string, unknown>): boolean {
    const actual = valueAt(outputs[condition.step], condition.path);
    const expected = condition.value;
    switch (condition.op) {
        case "exists": return actual !== undefined && actual !== null;
        case "eq": return actual === expected;
        case "neq": return actual !== expected;
        case "gt": return typeof actual === "number" && typeof expected === "number" && actual > expected;
        case "gte": return typeof actual === "number" && typeof expected === "number" && actual >= expected;
        case "lt": return typeof actual === "number" && typeof expected === "number" && actual < expected;
        case "lte": return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    }
}

/** The permitted run state transitions (PRD 9.1). Anything else is refused. */
const TRANSITIONS: Readonly<Record<BrainWorkflowRunStatus, ReadonlyArray<BrainWorkflowRunStatus>>> = {
    queued: ["running", "cancelled", "expired"],
    running: ["waiting_approval", "succeeded", "failed", "cancelled", "expired", "running"],
    waiting_approval: ["running", "failed", "cancelled", "expired"],
    succeeded: [], failed: ["running"], cancelled: [], expired: [],
};
export function canTransition(from: string, to: BrainWorkflowRunStatus): boolean {
    return (TRANSITIONS[from as BrainWorkflowRunStatus] ?? []).includes(to);
}
export const isTerminal = (status: string) => (BRAIN_TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
export const ACTIVE_RUN_STATUSES: ReadonlyArray<BrainWorkflowRunStatus> = [BRAIN_WORKFLOW_RUN_STATUSES.queued, BRAIN_WORKFLOW_RUN_STATUSES.running, BRAIN_WORKFLOW_RUN_STATUSES.waitingApproval];

export interface WorkflowTemplate {
    readonly key: string;
    readonly name: string;
    readonly description: string;
    readonly inputSchema: WorkflowInput[];
    readonly steps: WorkflowStep[];
    readonly trigger: WorkflowTrigger;
}

/** Approved starting points. Agents draft workflows only from these, so a model never writes step logic. */
export const WORKFLOW_TEMPLATES: ReadonlyArray<WorkflowTemplate> = [
    {
        key: "weekly-forecast-report", name: "Weekly forecast report", description: "Forecasts a governed metric, saves an internal brief and notifies managers.",
        inputSchema: [{ name: "metric_key", type: "string", required: true, description: "The approved metric to forecast." }],
        trigger: { type: "schedule", intervalMinutes: 7 * 24 * 60 },
        steps: [
            { key: "forecast", name: "Run governed forecast", action: "brain.run_forecast", input: { metricKey: "{{inputs.metric_key}}", horizon: 3 }, dependsOn: [] },
            { key: "brief", name: "Save the weekly brief", action: "brain.create_document", input: { title: "Weekly forecast brief ({{now}})", content: "{{steps.forecast.output.summaryText}}" }, dependsOn: ["forecast"], condition: { step: "forecast", path: "status", op: "eq", value: "succeeded" } },
            { key: "notify", name: "Notify managers", action: "brain.notify_members", input: { title: "Weekly forecast is ready", message: "{{steps.forecast.output.summaryText}}", minimumAccess: "write" }, dependsOn: ["brief"] },
        ],
    },
    {
        key: "data-quality-alert", name: "Data quality alert", description: "After each pipeline run, alerts managers when the pass rate falls below the dataset's threshold.",
        inputSchema: [{ name: "dataset_id", type: "string", required: true, description: "Filled from the pipeline event." }],
        trigger: { type: "event", eventType: BRAIN_EVENT_TYPES.pipelineCompleted },
        steps: [
            { key: "check", name: "Check data quality", action: "brain.quality_check", input: { datasetId: "{{inputs.dataset_id}}" }, dependsOn: [] },
            { key: "alert", name: "Alert managers", action: "brain.notify_members", input: { title: "Data quality below threshold", message: "{{steps.check.output.summaryText}}", minimumAccess: "write" }, dependsOn: ["check"], condition: { step: "check", path: "belowThreshold", op: "eq", value: true } },
        ],
    },
    {
        key: "approved-outreach", name: "Approved outreach", description: "Sends a prepared payload through a connected HTTP integration only after a person approves the exact content and recipients.",
        inputSchema: [
            { name: "connection_id", type: "string", required: true }, { name: "path", type: "string", required: false },
            { name: "body", type: "object", required: true }, { name: "title", type: "string", required: true },
            { name: "summary", type: "string", required: true }, { name: "recipients", type: "object", required: false },
        ],
        trigger: { type: "manual" },
        steps: [
            { key: "deliver", name: "Deliver after approval", action: "connector.http_post", input: { connectionId: "{{inputs.connection_id}}", path: "{{inputs.path}}", body: "{{inputs.body}}", preview: { title: "{{inputs.title}}", summary: "{{inputs.summary}}", recipients: "{{inputs.recipients}}" } }, dependsOn: [], retry: { maxAttempts: 3, backoffSeconds: 30 } },
            { key: "notify", name: "Confirm delivery", action: "brain.notify_members", input: { title: "Approved outreach delivered", message: "{{inputs.title}} was delivered.", minimumAccess: "write" }, dependsOn: ["deliver"] },
        ],
    },
];
export const SYSTEM_EXTERNAL_ACTION_KEY = "system_external_action";
