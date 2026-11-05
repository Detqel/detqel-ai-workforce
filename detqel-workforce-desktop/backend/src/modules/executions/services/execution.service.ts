import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { NewExecution } from "../../../shared/types/entities.js";
export class ExecutionService {
    constructor(private readonly unit: IUnitOfWork) { }
    private get repository() { return this.unit.missions; }
    /** The workspace that owns the mission an execution is recorded against. */
    async requireMissionWorkspaceId(missionId: string): Promise<string> {
        const mission = await this.repository.findById(missionId);
        if (!mission) throw new AppError(404, "Mission not found");
        return mission.workspaceId;
    }
    /** The workspace that owns an execution (through its mission). */
    async requireWorkspaceId(executionId: string): Promise<string> {
        const workspaceId = await this.repository.findExecutionWorkspaceId(executionId);
        if (!workspaceId) throw new AppError(404, "Execution not found");
        return workspaceId;
    }
    createWithEvent(body: NewExecution) {
        return this.unit.transaction(async (repositories) => {
            if (body.approvalId) {
                const [mission, approval] = await Promise.all([repositories.missions.findById(body.missionId), repositories.missions.findApprovalById(body.approvalId)]);
                if (!mission || !approval || approval.workspaceId !== mission.workspaceId) throw new AppError(404, "Approval not found in this workspace");
            }
            const execution = await repositories.missions.recordExecution({
                ...body,
                status: "running",
                startedAt: new Date(),
            });
            await repositories.missions.logEvent({
                missionId: body.missionId,
                eventType: "execution",
                title: `Action Dispatched: ${body.actionType}`,
                description: `Dispatched action payload to executor.`,
                payload: { executionId: execution.id, actionType: body.actionType },
            });
            return execution;
        });
    }
    updateStatusWithEvent(id: string, body: {
        status: string;
        result?: Record<string, unknown>;
        error?: string;
    }) {
        return this.unit.transaction(async (repositories) => {
            const updated = await repositories.missions.updateExecutionStatus(id, body.status, body.result, body.error);
            if (!updated)
                return null;
            await repositories.missions.logEvent({
                missionId: updated.missionId,
                eventType: body.status === "failed" ? "error" : "execution",
                title: `Execution ${body.status.toUpperCase()}: ${updated.actionType}`,
                description: body.error || `Execution concluded with status ${body.status}`,
                payload: { executionId: updated.id, result: body.result, error: body.error },
            });
            return updated;
        });
    }
}
