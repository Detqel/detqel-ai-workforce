import { and, desc, eq, gte, sql } from "drizzle-orm";
import { type DatabaseSession } from "../../../infrastructure/database/connection.js";
import { userActivities, type NewUserActivity, type UserActivity, } from "../../../infrastructure/database/schema/activities.js";
import type { IActivityRepository } from "./activity.repository.js";
import type { ActivityHeatmapDayCell, ActivityHeatmapResult } from "./activity.types.js";
export class ActivityRepository implements IActivityRepository {
    constructor(private readonly database: DatabaseSession) { }
    /**
     * Log an activity performed by a user or agent in the workspace
     */
    async recordActivity(data: NewUserActivity): Promise<UserActivity> {
        const [record] = await this.database
            .insert(userActivities)
            .values(data)
            .returning();
        return record;
    }
    /**
     * Batch insert activities (e.g. for bulk operations or migrations)
     */
    async recordBatchActivities(data: NewUserActivity[]): Promise<UserActivity[]> {
        if (data.length === 0)
            return [];
        return this.database.insert(userActivities).values(data).returning();
    }
    /**
     * List recent activities for a workspace, optionally filtered by user or category
     */
    async listActivities(workspaceId: string, options?: {
        userId?: string;
        activityType?: string;
        limit?: number;
    }): Promise<UserActivity[]> {
        const conditions = [eq(userActivities.workspaceId, workspaceId)];
        if (options?.userId) {
            conditions.push(eq(userActivities.userId, options.userId));
        }
        if (options?.activityType) {
            conditions.push(eq(sql `lower(${userActivities.activityType})`, options.activityType.toLowerCase()));
        }
        return this.database
            .select()
            .from(userActivities)
            .where(and(...conditions))
            .orderBy(desc(userActivities.createdAt))
            .limit(options?.limit || 50);
    }
    /**
     * Efficiently aggregates database activity counts per category and date
     * using a single grouped SQL query over the given time window (default: last 28 days / 4 weeks).
     */
    async getHeatmapData(workspaceId: string, options?: {
        userId?: string;
        days?: number;
    }): Promise<ActivityHeatmapResult> {
        const categories = [
            "Investigations",
            "Predictions",
            "Simulations",
            "Automations",
            "Decisions",
        ];
        const daysCount = options?.days && options.days > 0 ? options.days : 28;
        // Start of the window
        const now = new Date();
        const startDate = new Date(now);
        startDate.setDate(now.getDate() - (daysCount - 1));
        startDate.setHours(0, 0, 0, 0);
        const conditions = [
            eq(userActivities.workspaceId, workspaceId),
            gte(userActivities.createdAt, startDate),
        ];
        if (options?.userId) {
            conditions.push(eq(userActivities.userId, options.userId));
        }
        // High-performance aggregation: grouped directly in the database
        const rows = await this.database
            .select({
            activityType: sql<string> `lower(${userActivities.activityType})`,
            activityDate: sql<string> `to_char(${userActivities.createdAt}, 'YYYY-MM-DD')`,
            activityCount: sql<number> `count(*)::int`,
        })
            .from(userActivities)
            .where(and(...conditions))
            .groupBy(sql `lower(${userActivities.activityType})`, sql `to_char(${userActivities.createdAt}, 'YYYY-MM-DD')`);
        // Map counts by [activityType][YYYY-MM-DD]
        const countMap: Record<string, Record<string, number>> = {};
        let totalActivities = 0;
        for (const row of rows) {
            const typeKey = row.activityType.toLowerCase();
            if (!countMap[typeKey]) {
                countMap[typeKey] = {};
            }
            countMap[typeKey][row.activityDate] = row.activityCount;
            totalActivities += row.activityCount;
        }
        // Construct contiguous array of day strings
        const dayKeys: string[] = [];
        const dayLabels: string[] = [];
        for (let i = 0; i < daysCount; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const dateStr = `${yyyy}-${mm}-${dd}`;
            dayKeys.push(dateStr);
            const monthName = d.toLocaleDateString("en-US", { month: "short" });
            dayLabels.push(`${monthName} ${d.getDate()}`);
        }
        // Generate 5 milestone tick dates evenly across the window
        const milestoneIndices = [
            0,
            Math.floor(daysCount * 0.25),
            Math.floor(daysCount * 0.5),
            Math.floor(daysCount * 0.75),
            daysCount - 1,
        ];
        const milestoneDates = milestoneIndices.map((idx) => dayLabels[idx]);
        // Build the 5-row intensity matrix
        const matrix: Record<string, ActivityHeatmapDayCell[]> = {};
        for (const cat of categories) {
            const catKey = cat.toLowerCase();
            matrix[cat] = dayKeys.map((dateStr, idx) => {
                const count = countMap[catKey]?.[dateStr] || 0;
                let level = 0;
                if (count >= 4)
                    level = 4;
                else if (count >= 2)
                    level = 3;
                else if (count === 1)
                    level = 2;
                else
                    level = 0;
                return {
                    date: dateStr,
                    formattedDate: dayLabels[idx],
                    count,
                    level,
                };
            });
        }
        return {
            categories,
            milestoneDates,
            totalActivities,
            days: dayKeys,
            matrix,
        };
    }
}
