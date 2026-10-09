import type { Approval, Execution, Mission, MissionEvent, MissionSource, NewApproval, NewExecution, NewMission, NewMissionEvent, NewMissionSource } from "../../../shared/types/entities.js";
import type { MissionWithDetails } from "../../../shared/types/graphs.js";
export interface IMissionRepository {
    listByWorkspace(workspaceId: string, status?: string, limit?: number): Promise<Mission[]>;
    findById(missionId: string): Promise<Mission | null>;
    getMissionWithDetails(missionId: string): Promise<MissionWithDetails | undefined>;
    createMission(data: NewMission, assignedAgents?: Array<{
        agentId: string;
        role?: string;
    }>): Promise<Mission>;
    updateStatus(missionId: string, status: string): Promise<Mission | null>;
    logEvent(data: NewMissionEvent): Promise<MissionEvent>;
    listEvents(missionId: string): Promise<MissionEvent[]>;
    addSource(data: NewMissionSource): Promise<MissionSource>;
    listApprovals(workspaceId: string, status?: string): Promise<Approval[]>;
    createApproval(data: NewApproval): Promise<Approval>;
    reviewApproval(approvalId: string, userId: string, status: "approved" | "rejected"): Promise<Approval | null>;
    recordExecution(data: NewExecution): Promise<Execution>;
    updateExecutionStatus(executionId: string, status: string, result?: Record<string, unknown>, error?: string): Promise<Execution | null>;
}
