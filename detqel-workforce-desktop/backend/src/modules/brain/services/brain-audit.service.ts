import { randomUUID } from "node:crypto";
import {
    BRAIN_ACTOR_TYPES, BRAIN_AUDIT_OUTCOMES, BRAIN_EVENT_VERSION, BRAIN_LIMITS,
    type BrainActorType, type BrainAuditOutcome, type BrainEventType, type BrainPolicyDecision,
} from "../../../constants/brainConstants.js";
import { redactValue } from "../../../shared/agents/context/data-guard.js";
import type { IUnitOfWork, IRepositorySet } from "../../../shared/contracts/unit-of-work.js";
import { createScopedLogger } from "../../../shared/logging/logger.js";
import type { BrainAuditEvent } from "../../../shared/types/entities.js";
import { actorId, type BrainActor } from "./brain-types.js";

const logger = createScopedLogger("brain-audit");
const MAX_METADATA_CHARACTERS = 8_000;

export interface AuditEntry {
    readonly workspaceId: string;
    readonly actorType: BrainActorType;
    readonly actorId: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId?: string | null;
    readonly decision?: BrainPolicyDecision | null;
    readonly outcome?: BrainAuditOutcome;
    readonly correlationId?: string | null;
    readonly metadata?: Record<string, unknown>;
}

/** Audit metadata never holds secrets and stays small enough to query; oversized details are summarised. */
function safeMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!metadata) return {};
    const redacted = (redactValue(metadata) ?? {}) as Record<string, unknown>;
    const text = JSON.stringify(redacted);
    return text.length <= MAX_METADATA_CHARACTERS ? redacted : { truncated: true, keys: Object.keys(redacted).slice(0, 40) };
}

export const entryFor = (actor: BrainActor, action: string, targetType: string, targetId: string | null, extra: Partial<AuditEntry> = {}): AuditEntry => ({
    workspaceId: actor.workspaceId,
    actorType: actor.kind === "user" ? BRAIN_ACTOR_TYPES.user : BRAIN_ACTOR_TYPES.system,
    actorId: actorId(actor),
    action, targetType, targetId, ...extra,
});

/**
 * Records who did what to which target, with the policy decision and outcome (PRD 11), and publishes versioned
 * events through the transactional outbox (PRD 13.1). Callers inside a transaction pass its repositories so the
 * audit entry and event commit or roll back with the change they describe.
 */
export class BrainAuditService {
    constructor(private readonly unit: IUnitOfWork) {}

    async record(entry: AuditEntry, repositories: IRepositorySet = this.unit): Promise<void> {
        await repositories.brainGovernance.recordAudit([{
            workspaceId: entry.workspaceId,
            actorType: entry.actorType,
            actorId: entry.actorId.slice(0, 120),
            action: entry.action.slice(0, 120),
            targetType: entry.targetType.slice(0, 60),
            targetId: entry.targetId?.slice(0, 120) ?? null,
            policyDecision: entry.decision ?? null,
            outcome: entry.outcome ?? BRAIN_AUDIT_OUTCOMES.success,
            correlationId: entry.correlationId ?? null,
            metadata: safeMetadata(entry.metadata),
        }]);
    }

    /** For paths where losing the audit entry must not undo the user's work; failures are logged loudly. */
    async recordQuietly(entry: AuditEntry): Promise<void> {
        await this.record(entry).catch(error => logger.error({ action: entry.action, workspaceId: entry.workspaceId, error: String(error) }, "Audit entry could not be recorded"));
    }

    async publish(workspaceId: string, eventType: BrainEventType, payload: Record<string, unknown>, options: { actorId: string; correlationId?: string }, repositories: IRepositorySet = this.unit): Promise<void> {
        await repositories.brainGovernance.publishEvents([{
            workspaceId, eventType, eventVersion: BRAIN_EVENT_VERSION, actorId: options.actorId.slice(0, 120),
            correlationId: options.correlationId ?? randomUUID(), payload: safeMetadata(payload),
        }]);
    }

    async publishQuietly(workspaceId: string, eventType: BrainEventType, payload: Record<string, unknown>, options: { actorId: string; correlationId?: string }): Promise<void> {
        await this.publish(workspaceId, eventType, payload, options).catch(error => logger.error({ eventType, workspaceId, error: String(error) }, "Event could not be published"));
    }

    /** Feeds the dashboard activity heatmap; it is a convenience view, so a failure is logged and ignored. */
    async activity(workspaceId: string, userId: string | null, activityType: string, title: string, entityType: string, entityId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
        await this.unit.activities.recordActivity({ workspaceId, userId, activityType, title: title.slice(0, 255), entityType, entityId, metadata })
            .catch(error => logger.warn({ workspaceId, activityType, error: String(error) }, "Activity could not be recorded"));
    }

    /** Reading the audit trail is itself audited (PRD 11.1). */
    async list(actor: BrainActor, options: { targetType?: string; targetId?: string; limit?: number; before?: Date }): Promise<BrainAuditEvent[]> {
        const events = await this.unit.brainGovernance.listAudit(actor.workspaceId, { ...options, limit: Math.min(options.limit ?? 50, BRAIN_LIMITS.auditListLimit) });
        await this.record(entryFor(actor, "audit.read", "audit", null, { metadata: { filters: { targetType: options.targetType ?? null, targetId: options.targetId ?? null }, returned: events.length } }));
        return events;
    }
}
