import { BRAIN_POLICY_ALL_ROLES, BRAIN_POLICY_EFFECTS, type BrainPolicyResource } from "../../../../constants/brainConstants.js";
import type { BrainAccessPolicy, BrainFilter } from "../../../../shared/types/entities.js";

export interface AccessDecision {
    readonly allowed: boolean;
    readonly maskedFields: ReadonlyArray<string>;
    readonly rowFilters: ReadonlyArray<BrainFilter>;
}
export const FULL_ACCESS: AccessDecision = { allowed: true, maskedFields: [], rowFilters: [] };
export const MASKED_VALUE = "[masked]";

/** Workspace owners administer policies, and scheduled system work runs before any user sees results. */
const UNRESTRICTED_ROLES = new Set(["owner", "system"]);

/**
 * Row and column policy for one resource and role. Deny wins over everything; masks accumulate; row filters
 * all apply together. Policies are enforced here in the service layer, before any value reaches a user, an
 * agent or a model, and never depend on what a prompt asked for.
 */
export function evaluateAccess(policies: ReadonlyArray<BrainAccessPolicy>, role: string, resourceType: BrainPolicyResource, resourceId: string): AccessDecision {
    if (UNRESTRICTED_ROLES.has(role)) return FULL_ACCESS;
    const applicable = policies.filter(policy => policy.resourceType === resourceType && policy.resourceId === resourceId
        && (policy.role === role || policy.role === BRAIN_POLICY_ALL_ROLES));
    if (applicable.some(policy => policy.effect === BRAIN_POLICY_EFFECTS.deny)) return { allowed: false, maskedFields: [], rowFilters: [] };
    const maskedFields = [...new Set(applicable.filter(policy => policy.effect === BRAIN_POLICY_EFFECTS.mask).flatMap(policy => policy.maskedFields))];
    const rowFilters = applicable.filter(policy => policy.effect === BRAIN_POLICY_EFFECTS.rowFilter && policy.rowFilter).map(policy => policy.rowFilter!);
    return { allowed: true, maskedFields, rowFilters };
}

/** Both decisions must allow; restrictions from either apply. */
export function combineAccess(first: AccessDecision, second: AccessDecision): AccessDecision {
    if (!first.allowed || !second.allowed) return { allowed: false, maskedFields: [], rowFilters: [] };
    return { allowed: true, maskedFields: [...new Set([...first.maskedFields, ...second.maskedFields])], rowFilters: [...first.rowFilters, ...second.rowFilters] };
}

export function maskRecord(record: Record<string, unknown>, maskedFields: ReadonlyArray<string>): Record<string, unknown> {
    if (!maskedFields.length) return record;
    const masked = { ...record };
    for (const field of maskedFields) if (field in masked && masked[field] !== null) masked[field] = MASKED_VALUE;
    return masked;
}
