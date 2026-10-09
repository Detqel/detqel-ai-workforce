import { desc, eq } from "drizzle-orm";
import { type DatabaseSession } from "../../../infrastructure/database/connection.js";
import { automationRuns, automations, scheduledTasks, type Automation, type AutomationRun, type NewAutomation, type NewAutomationRun, type NewScheduledTask, type ScheduledTask, } from "../../../infrastructure/database/schema/automations.js";
import type { IAutomationRepository } from "./automation.repository.js";
export class AutomationRepository implements IAutomationRepository {
    constructor(private readonly database: DatabaseSession) { }
    // Automations
    async listAutomations(workspaceId: string): Promise<Automation[]> {
        return this.database
            .select()
            .from(automations)
            .where(eq(automations.workspaceId, workspaceId))
            .orderBy(desc(automations.createdAt));
    }
    async createAutomation(data: NewAutomation): Promise<Automation> {
        const [auto] = await this.database
            .insert(automations)
            .values(data)
            .returning();
        return auto;
    }
    async updateAutomation(id: string, data: Partial<NewAutomation>): Promise<Automation | null> {
        const [updated] = await this.database
            .update(automations)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(automations.id, id))
            .returning();
        return updated || null;
    }
    // Automation Runs
    async listRuns(automationId: string): Promise<AutomationRun[]> {
        return this.database
            .select()
            .from(automationRuns)
            .where(eq(automationRuns.automationId, automationId))
            .orderBy(desc(automationRuns.startedAt));
    }
    async recordRun(data: NewAutomationRun): Promise<AutomationRun> {
        const [run] = await this.database
            .insert(automationRuns)
            .values(data)
            .returning();
        return run;
    }
    // Scheduled Tasks
    async listTasks(workspaceId: string): Promise<ScheduledTask[]> {
        return this.database
            .select()
            .from(scheduledTasks)
            .where(eq(scheduledTasks.workspaceId, workspaceId))
            .orderBy(desc(scheduledTasks.createdAt));
    }
    async createTask(data: NewScheduledTask): Promise<ScheduledTask> {
        const [task] = await this.database
            .insert(scheduledTasks)
            .values(data)
            .returning();
        return task;
    }
}
