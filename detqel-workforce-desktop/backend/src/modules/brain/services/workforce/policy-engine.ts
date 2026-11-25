import {
    BRAIN_LIMITS, BRAIN_POLICY_DECISIONS, BRAIN_RISK_ORDER, BRAIN_RISK_TIERS, type BrainPolicyDecision, type BrainRiskTier,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import type { BrainPolicySettings } from "../../../../shared/types/entities.js";
import { roleAllows } from "../../../workspaces/services/workspace-access.service.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import type { BrainActor } from "../brain-types.js";

export interface PolicySettingsView {
    readonly actionTiers: Readonly<Record<string, BrainRiskTier>>;
    readonly moderateRequiresApproval: boolean;
    readonly criticalEnabled: boolean;
    readonly criticalRequiredApprovals: number;
    readonly approvalTtlHours: number;
    readonly workflowsEnabled: boolean;
    readonly externalSearchEnabled: boolean;
}
export const DEFAULT_POLICY_SETTINGS: PolicySettingsView = {
    actionTiers: {}, moderateRequiresApproval: false, criticalEnabled: false, criticalRequiredApprovals: BRAIN_LIMITS.defaultCriticalApprovals,
    approvalTtlHours: BRAIN_LIMITS.defaultApprovalTtlHours, workflowsEnabled: true, externalSearchEnabled: true,
};

/** What the policy engine needs to know about an action. The descriptor comes from code, never from a prompt. */
export interface ActionDescriptor {
    readonly key: string;
    readonly riskTier: BrainRiskTier;
    readonly access: "read" | "write";
    /** Reaches a system outside the platform (sends, posts, publishes). External actions are never below high. */
    readonly external: boolean;
}
export interface PolicyOutcome {
    readonly decision: BrainPolicyDecision;
    readonly tier: BrainRiskTier;
    readonly reason: string;
    readonly requiredApprovals: number;
}

const isTier = (value: unknown): value is BrainRiskTier => typeof value === "string" && value in BRAIN_RISK_ORDER;

/**
 * The tier an action runs at. Tenants may reclassify actions, but external actions never drop below high and
 * critical actions never drop at all: the platform floor cannot be policy-configured away (PRD 8.4).
 */
export function effectiveTier(action: ActionDescriptor, settings: PolicySettingsView): BrainRiskTier {
    const configured = settings.actionTiers[action.key];
    let tier = isTier(configured) ? configured : action.riskTier;
    if (action.riskTier === BRAIN_RISK_TIERS.critical) tier = BRAIN_RISK_TIERS.critical;
    if (action.external && BRAIN_RISK_ORDER[tier] < BRAIN_RISK_ORDER.high) tier = BRAIN_RISK_TIERS.high;
    return tier;
}

/**
 * The action-risk policy (FR-AGT-006). Decides from the caller's verified role, the action's code-defined tier and
 * the tenant's settings; the request text plays no part, so a prompt cannot grant itself permission.
 */
export function decide(actor: BrainActor, action: ActionDescriptor, settings: PolicySettingsView): PolicyOutcome {
    const tier = effectiveTier(action, settings);
    const outcome = (decision: BrainPolicyDecision, reason: string, requiredApprovals = 0): PolicyOutcome => ({ decision, tier, reason, requiredApprovals });
    if (actor.kind === "user" && action.access === "write" && !roleAllows(actor.role, "write")) return outcome(BRAIN_POLICY_DECISIONS.deny, "Your workspace role cannot run actions that change data.");
    switch (tier) {
        case BRAIN_RISK_TIERS.low:
            return outcome(BRAIN_POLICY_DECISIONS.allow, "Low risk: runs within your permissions and is logged.");
        case BRAIN_RISK_TIERS.moderate:
            return settings.moderateRequiresApproval
                ? outcome(BRAIN_POLICY_DECISIONS.requireApproval, "This workspace requires confirmation for moderate-risk actions.", 1)
                : outcome(BRAIN_POLICY_DECISIONS.allow, "Moderate risk: allowed by workspace policy and logged.");
        case BRAIN_RISK_TIERS.high:
            return outcome(BRAIN_POLICY_DECISIONS.requireApproval, "High risk: needs explicit human approval of the exact action before it runs.", 1);
        default:
            return settings.criticalEnabled
                ? outcome(BRAIN_POLICY_DECISIONS.requireApproval, "Critical: needs approval from several authorised people.", Math.max(2, settings.criticalRequiredApprovals))
                : outcome(BRAIN_POLICY_DECISIONS.deny, "Critical actions are disabled for this workspace.");
    }
}

/** Who may approve: managers and above for moderate and high; only owners and administrators for critical. */
export function canApprove(role: string, tier: string): boolean {
    return tier === BRAIN_RISK_TIERS.critical ? roleAllows(role, "manage") : roleAllows(role, "write");
}

export function settingsView(row: BrainPolicySettings | null): PolicySettingsView {
    if (!row) return DEFAULT_POLICY_SETTINGS;
    const tiers: Record<string, BrainRiskTier> = {};
    for (const [key, value] of Object.entries(row.actionTiers ?? {})) if (isTier(value)) tiers[key] = value;
    return {
        actionTiers: tiers, moderateRequiresApproval: row.moderateRequiresApproval, criticalEnabled: row.criticalEnabled,
        criticalRequiredApprovals: row.criticalRequiredApprovals, approvalTtlHours: row.approvalTtlHours,
        workflowsEnabled: row.workflowsEnabled, externalSearchEnabled: row.externalSearchEnabled,
    };
}

/** Tenant policy settings, cached briefly because every tool call and workflow step reads them. */
export class BrainPolicyService {
    private readonly cache = new Map<string, { expires: number; value: PolicySettingsView }>();

    constructor(private readonly unit: IUnitOfWork, private readonly audit: BrainAuditService) {}

    async get(workspaceId: string): Promise<PolicySettingsView> {
        const cached = this.cache.get(workspaceId);
        if (cached && cached.expires > Date.now()) return cached.value;
        const value = settingsView(await this.unit.brainWorkforce.getPolicySettings(workspaceId));
        this.cache.set(workspaceId, { expires: Date.now() + 15_000, value });
        if (this.cache.size > 512) this.cache.delete(this.cache.keys().next().value!);
        return value;
    }

    async update(actor: BrainActor, input: Partial<PolicySettingsView>): Promise<PolicySettingsView> {
        const previous = await this.get(actor.workspaceId);
        const row = await this.unit.brainWorkforce.upsertPolicySettings(actor.workspaceId, { ...input, actionTiers: input.actionTiers ? { ...input.actionTiers } : undefined, updatedBy: actor.userId });
        this.cache.delete(actor.workspaceId);
        await this.audit.record(entryFor(actor, "policy.settings.updated", "policy_settings", actor.workspaceId, { metadata: { previous, next: settingsView(row) } }));
        return settingsView(row);
    }
}
