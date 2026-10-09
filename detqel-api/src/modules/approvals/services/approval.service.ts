import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import type { Approval, NewApproval } from "../../../shared/types/entities.js";
export class ApprovalService {
    constructor(private readonly unit: IUnitOfWork) { }
    private get repository() { return this.unit.missions; }
    listApprovals(workspaceId: string, status?: string): Promise<Approval[]> { return this.repository.listApprovals(workspaceId, status); }
    createWithEvent(body: NewApproval) {
        return this.unit.transaction(async (repositories) => {
            const approval = await repositories.missions.createApproval({
                ...body,
                status: "pending",
            });
            if (body.missionId) {
                await repositories.missions.logEvent({
                    missionId: body.missionId,
                    eventType: "approval",
                    title: `Approval Required: ${body.title}`,
                    description: `Risk level: ${body.riskLevel}. Action requires human signoff.`,
                    payload: { approvalId: approval.id },
                });
            }
            return approval;
        });
    }
    reviewWithEvent(id: string, userId: string, status: "approved" | "rejected") {
        return this.unit.transaction(async (repositories) => {
            const reviewed = await repositories.missions.reviewApproval(id, userId, status);
            if (!reviewed)
                return null;
            if (reviewed.missionId) {
                await repositories.missions.logEvent({
                    missionId: reviewed.missionId,
                    eventType: "approval",
                    title: `Approval ${status.toUpperCase()}`,
                    description: `Approval "${reviewed.title}" marked as ${status} by user ${userId}.`,
                    payload: { approvalId: reviewed.id, status },
                });
            }
            return reviewed;
        });
    }
}
