import type { Automation, AutomationRun, NewAutomation, NewAutomationRun, NewScheduledTask, ScheduledTask } from "../../../shared/types/entities.js";
import type { IAutomationRepository } from "../../automations/repositories/automation.repository.js";
export class AutomationService {
    constructor(private readonly repository: IAutomationRepository) { }
    listAutomations(workspaceId: string): Promise<Automation[]> { return this.repository.listAutomations(workspaceId); }
    createAutomation(data: NewAutomation): Promise<Automation> { return this.repository.createAutomation(data); }
    listRuns(automationId: string): Promise<AutomationRun[]> { return this.repository.listRuns(automationId); }
    recordRun(data: NewAutomationRun): Promise<AutomationRun> { return this.repository.recordRun(data); }
    listTasks(workspaceId: string): Promise<ScheduledTask[]> { return this.repository.listTasks(workspaceId); }
    createTask(data: NewScheduledTask): Promise<ScheduledTask> { return this.repository.createTask(data); }
}
