import type { Automation, AutomationRun, NewAutomation, NewAutomationRun, NewScheduledTask, ScheduledTask } from "../../../shared/types/entities.js";
export interface IAutomationRepository {
    listAutomations(workspaceId: string): Promise<Automation[]>;
    createAutomation(data: NewAutomation): Promise<Automation>;
    updateAutomation(id: string, data: Partial<NewAutomation>): Promise<Automation | null>;
    listRuns(automationId: string): Promise<AutomationRun[]>;
    recordRun(data: NewAutomationRun): Promise<AutomationRun>;
    listTasks(workspaceId: string): Promise<ScheduledTask[]>;
    createTask(data: NewScheduledTask): Promise<ScheduledTask>;
}
