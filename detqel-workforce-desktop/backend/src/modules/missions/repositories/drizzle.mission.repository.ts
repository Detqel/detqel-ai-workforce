import { PAGINATION_LIMITS } from "../../../constants/httpConstants.js";
import { and, desc, eq } from "drizzle-orm";
import { type DatabaseSession } from "../../../infrastructure/database/connection.js";
import { approvals, executions, missionAgents, missionEvents, missions, missionSources, type Approval, type Execution, type Mission, type MissionEvent, type MissionSource, type NewApproval, type NewExecution, type NewMission, type NewMissionEvent, type NewMissionSource } from "../../../infrastructure/database/schema/missions.js";
import type { IMissionRepository } from "./mission.repository.js";
export class MissionRepository implements IMissionRepository {
    constructor(private readonly database: DatabaseSession) { }
    async listByWorkspace(workspaceId: string, status?: string, limit: number = PAGINATION_LIMITS.standard): Promise<Mission[]> {
        const conditions = [eq(missions.workspaceId, workspaceId)];
        if (status)
            conditions.push(eq(missions.status, status));
        return this.database
            .select()
            .from(missions)
            .where(and(...conditions))
            .orderBy(desc(missions.createdAt))
            .limit(limit);
    }
    async findById(missionId: string): Promise<Mission | null> {
        const [mission] = await this.database
            .select()
            .from(missions)
            .where(eq(missions.id, missionId))
            .limit(1);
        return mission || null;
    }
    async getMissionWithDetails(missionId: string) {
        return this.database.query.missions.findFirst({
            where: eq(missions.id, missionId),
            with: {
                missionAgents: {
                    with: {
                        agent: true,
                    },
                },
                events: {
                    orderBy: (events, { asc }) => [asc(events.createdAt)],
                },
                sources: true,
                approvals: true,
                executions: true,
            },
        });
    }
    async createMission(data: NewMission, assignedAgents?: Array<{
        agentId: string;
        role?: string;
    }>): Promise<Mission> {
        const [mission] = await this.database.insert(missions).values(data).returning();
        if (assignedAgents && assignedAgents.length > 0) {
            await this.database.insert(missionAgents).values(assignedAgents.map((a) => ({
                missionId: mission.id,
                agentId: a.agentId,
                role: a.role || "primary",
                status: "assigned",
            })));
        }
        return mission;
    }
    async updateStatus(missionId: string, status: string): Promise<Mission | null> {
        const updateData: Partial<NewMission> = {
            status,
            updatedAt: new Date(),
        };
        if (status === "executing" || status === "planning") {
            updateData.startedAt = new Date();
        }
        if (status === "completed" || status === "failed" || status === "cancelled") {
            updateData.completedAt = new Date();
        }
        const [updated] = await this.database
            .update(missions)
            .set(updateData)
            .where(eq(missions.id, missionId))
            .returning();
        return updated || null;
    }
    // Mission Events
    async logEvent(data: NewMissionEvent): Promise<MissionEvent> {
        const [event] = await this.database
            .insert(missionEvents)
            .values(data)
            .returning();
        return event;
    }
    async listEvents(missionId: string): Promise<MissionEvent[]> {
        return this.database
            .select()
            .from(missionEvents)
            .where(eq(missionEvents.missionId, missionId))
            .orderBy(desc(missionEvents.createdAt));
    }
    // Mission Sources
    async addSource(data: NewMissionSource): Promise<MissionSource> {
        const [source] = await this.database
            .insert(missionSources)
            .values(data)
            .returning();
        return source;
    }
    // Approvals
    async listApprovals(workspaceId: string, status?: string): Promise<Approval[]> {
        const conditions = [eq(approvals.workspaceId, workspaceId)];
        if (status)
            conditions.push(eq(approvals.status, status));
        return this.database
            .select()
            .from(approvals)
            .where(and(...conditions))
            .orderBy(desc(approvals.createdAt));
    }
    async createApproval(data: NewApproval): Promise<Approval> {
        const [approval] = await this.database
            .insert(approvals)
            .values(data)
            .returning();
        return approval;
    }
    async reviewApproval(approvalId: string, userId: string, status: "approved" | "rejected"): Promise<Approval | null> {
        const [reviewed] = await this.database
            .update(approvals)
            .set({
            status,
            reviewedBy: userId,
            reviewedAt: new Date(),
        })
            .where(eq(approvals.id, approvalId))
            .returning();
        return reviewed || null;
    }
    // Executions
    async recordExecution(data: NewExecution): Promise<Execution> {
        const [execution] = await this.database
            .insert(executions)
            .values(data)
            .returning();
        return execution;
    }
    async updateExecutionStatus(executionId: string, status: string, result?: Record<string, unknown>, error?: string): Promise<Execution | null> {
        const updateData: Partial<NewExecution> = { status };
        if (result)
            updateData.result = result;
        if (error)
            updateData.error = error;
        if (status === "completed" || status === "failed") {
            updateData.completedAt = new Date();
        }
        const [updated] = await this.database
            .update(executions)
            .set(updateData)
            .where(eq(executions.id, executionId))
            .returning();
        return updated || null;
    }
}
