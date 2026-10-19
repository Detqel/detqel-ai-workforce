import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import type { Mission, MissionEvent, MissionSource, NewMission, NewMissionEvent, NewMissionSource } from "../../../shared/types/entities.js";
import type { MissionWithDetails } from "../../../shared/types/graphs.js";
export class MissionService {
    constructor(private readonly unit: IUnitOfWork) { }
    private get repository() { return this.unit.missions; }
    listByWorkspace(workspaceId: string, status?: string, limit?: number): Promise<Mission[]> { return this.repository.listByWorkspace(workspaceId, status, limit); }
    getMissionWithDetails(missionId: string): Promise<MissionWithDetails | undefined> { return this.repository.getMissionWithDetails(missionId); }
    logEvent(data: NewMissionEvent): Promise<MissionEvent> { return this.repository.logEvent(data); }
    addSource(data: NewMissionSource): Promise<MissionSource> { return this.repository.addSource(data); }
    createWithEvent(missionData: NewMission, assignedAgents: Array<{
        agentId: string;
        role?: string;
    }> | undefined) {
        return this.unit.transaction(async (repositories) => {
            const mission = await repositories.missions.createMission({
                ...missionData,
                status: "planning",
            }, assignedAgents);
            // Automatically record initialization event
            await repositories.missions.logEvent({
                missionId: mission.id,
                eventType: "intent",
                title: "Mission Initialized",
                description: `Mission started with title: "${mission.title}"`,
                payload: { userRequest: mission.userRequest },
            });
            return mission;
        });
    }
    updateStatusWithEvent(id: string, status: string) {
        return this.unit.transaction(async (repositories) => {
            const updated = await repositories.missions.updateStatus(id, status);
            if (!updated)
                return null;
            await repositories.missions.logEvent({
                missionId: id,
                eventType: "agent_action",
                title: `Status Changed to ${status.toUpperCase()}`,
                description: `Lifecycle state updated to ${status}`,
            });
            return updated;
        });
    }
}
