import { AppError } from "../../../shared/errors/app-error.js";
import type { Automation, AutomationRun, NewAutomation, NewAutomationRun, NewScheduledTask, ScheduledTask } from "../../../shared/types/entities.js";
import type { IAutomationRepository } from "../../automations/repositories/automation.repository.js";
import type { IMissionRepository } from "../../missions/repositories/mission.repository.js";
import { assertMissionInWorkspace } from "../../missions/services/mission-scope.js";
export class AutomationService {
    constructor(private readonly repository: IAutomationRepository, private readonly missions: IMissionRepository) { }
    listAutomations(workspaceId: string): Promise<Automation[]> { return this.repository.listAutomations(workspaceId); }
    createAutomation(data: NewAutomation): Promise<Automation> { return this.repository.createAutomation(data); }
    listRuns(automationId: string): Promise<AutomationRun[]> { return this.repository.listRuns(automationId); }
    /** The workspace that owns an automation, so access can be checked before it is run or inspected. */
    async requireWorkspaceId(automationId: string): Promise<string> {
        const workspaceId = await this.repository.findAutomationWorkspaceId(automationId);
        if (!workspaceId) throw new AppError(404, "Automation not found");
        return workspaceId;
    }
    async recordRun(data: NewAutomationRun): Promise<AutomationRun> {
        await assertMissionInWorkspace(this.missions, data.missionId, await this.requireWorkspaceId(data.automationId));
        return this.repository.recordRun(data);
    }
    listTasks(workspaceId: string): Promise<ScheduledTask[]> { return this.repository.listTasks(workspaceId); }
    createTask(data: NewScheduledTask): Promise<ScheduledTask> { return this.repository.createTask(data); }
}
