import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../shared/errors/app-error.js";
import type { Mission, MissionEvent, MissionSource, NewMission, NewMissionEvent, NewMissionSource } from "../../../shared/types/entities.js";
import type { MissionWithDetails } from "../../../shared/types/graphs.js";
export class MissionService {
    constructor(private readonly unit: IUnitOfWork) { }
    private get repository() { return this.unit.missions; }
    listByWorkspace(workspaceId: string, status?: string, limit?: number): Promise<Mission[]> { return this.repository.listByWorkspace(workspaceId, status, limit); }
    getMissionWithDetails(missionId: string): Promise<MissionWithDetails | undefined> { return this.repository.getMissionWithDetails(missionId); }
    logEvent(data: NewMissionEvent): Promise<MissionEvent> { return this.repository.logEvent(data); }
    addSource(data: NewMissionSource): Promise<MissionSource> { return this.repository.addSource(data); }
    /** The workspace that owns a mission, so access can be checked before the mission is read or changed. */
    async requireWorkspaceId(missionId: string): Promise<string> {
        const mission = await this.repository.findById(missionId);
        if (!mission) throw new AppError(404, "Mission not found");
        return mission.workspaceId;
    }
    createWithEvent(missionData: NewMission, assignedAgents: Array<{
        agentId: string;
        role?: string;
    }> | undefined) {
        return this.unit.transaction(async (repositories) => {
            // Mission details return the assigned agents, so only this workspace's agents or platform agents may be assigned.
            for (const { agentId } of assignedAgents ?? []) {
                const agent = await repositories.workforce.findById(agentId);
                if (!agent || (agent.workspaceId !== null && agent.workspaceId !== missionData.workspaceId)) throw new AppError(404, "Agent not found in this workspace");
            }
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
