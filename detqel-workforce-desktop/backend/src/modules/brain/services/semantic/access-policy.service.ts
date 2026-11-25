import { BRAIN_ERRORS, BRAIN_POLICY_RESOURCES } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainFilter } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import type { BrainActor } from "../brain-types.js";

export interface AccessPolicyInput {
    readonly name: string;
    readonly role: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly effect: string;
    readonly maskedFields: string[];
    readonly rowFilter?: BrainFilter | null;
}

/** Row and column access policies (PRD 11: authorisation enforced in the service layer). Changes are audited. */
export class AccessPolicyService {
    constructor(private readonly unit: IUnitOfWork, private readonly audit: BrainAuditService, private readonly onChange: (workspaceId: string) => void) {}

    list(actor: BrainActor) {
        return this.unit.brainSemantic.listPolicies(actor.workspaceId);
    }

    async create(actor: BrainActor, input: AccessPolicyInput) {
        await this.assertResource(actor.workspaceId, input.resourceType, input.resourceId);
        const policy = await this.unit.transaction(async repositories => {
            const created = await repositories.brainSemantic.createPolicy({ workspaceId: actor.workspaceId, ...input, rowFilter: input.rowFilter ?? null, createdBy: actor.userId });
            await this.audit.record(entryFor(actor, "policy.access.created", "access_policy", created.id, { metadata: { role: created.role, resourceType: created.resourceType, resourceId: created.resourceId, effect: created.effect, maskedFields: created.maskedFields } }), repositories);
            return created;
        });
        this.onChange(actor.workspaceId);
        return policy;
    }

    async remove(actor: BrainActor, id: string) {
        const existing = await this.unit.brainSemantic.findPolicy(id, actor.workspaceId);
        if (!existing) throw new AppError(404, BRAIN_ERRORS.policyNotFound);
        await this.unit.transaction(async repositories => {
            await repositories.brainSemantic.deletePolicy(id, actor.workspaceId);
            await this.audit.record(entryFor(actor, "policy.access.deleted", "access_policy", id, { metadata: { previous: existing } }), repositories);
        });
        this.onChange(actor.workspaceId);
        return { success: true };
    }

    /** A policy can only target a resource of this workspace. */
    private async assertResource(workspaceId: string, type: string, id: string): Promise<void> {
        const found = type === BRAIN_POLICY_RESOURCES.dataset ? await this.unit.brainData.findDataset(id, workspaceId)
            : type === BRAIN_POLICY_RESOURCES.metric ? await this.unit.brainSemantic.findMetric(id, workspaceId)
                : await this.unit.brainSemantic.findEntityType(id, workspaceId);
        if (!found) throw new AppError(404, "The policy's resource was not found in this workspace.");
    }
}
