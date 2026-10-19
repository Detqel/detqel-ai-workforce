import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import type { NewExecution } from "../../../shared/types/entities.js";
export class ExecutionService {
    constructor(private readonly unit: IUnitOfWork) { }
    private get repository() { return this.unit.missions; }
    createWithEvent(body: NewExecution) {
        return this.unit.transaction(async (repositories) => {
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
