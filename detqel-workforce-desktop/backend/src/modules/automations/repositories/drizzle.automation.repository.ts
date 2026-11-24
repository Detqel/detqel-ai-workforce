import { userActivities } from "../../../infrastructure/database/schema/activities.js";
import { AppError } from "../../../shared/errors/app-error.js";
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
        return this.database.transaction(async tx => {
            const [auto] = await tx.insert(automations).values(data).returning();
            await tx.insert(userActivities).values({ workspaceId: auto.workspaceId, userId: auto.createdBy, activityType: "automations", title: "Automation created", entityType: "automation", entityId: auto.id, metadata: { event: "automation-created" } });
            return auto;
        });
    }
    async updateAutomation(id: string, data: Partial<NewAutomation>): Promise<Automation | null> {
        const [updated] = await this.database
            .update(automations)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(automations.id, id))
            .returning();
        return updated || null;
    }
    async findAutomationWorkspaceId(automationId: string): Promise<string | null> {
        const [row] = await this.database
            .select({ workspaceId: automations.workspaceId })
            .from(automations)
            .where(eq(automations.id, automationId))
            .limit(1);
        return row?.workspaceId ?? null;
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
        return this.database.transaction(async tx => {
            const [run] = await tx.insert(automationRuns).values(data).returning();
            const [automation] = await tx.select({ workspaceId: automations.workspaceId }).from(automations).where(eq(automations.id, run.automationId));
            if (!automation) throw new AppError(404, "Automation not found");
            await tx.insert(userActivities).values({ workspaceId: automation.workspaceId, activityType: "automations", title: "Automation run recorded", entityType: "automation-run", entityId: run.id, metadata: { event: "automation-run-recorded", automationId: run.automationId, status: run.status } });
            return run;
        });
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
