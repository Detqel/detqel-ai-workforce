import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
    async getHeatmapData(workspaceId: string, options?: { userId?: string; days?: number; timeZone?: string }): Promise<ActivityHeatmapResult> {
        const categories = ["Discussions", "Investigations", "Documents", "Predictions", "Simulations", "Automations", "Decisions"];
        const daysCount = options?.days ?? 42;
        const timeZone = options?.timeZone ?? "UTC";
        const conditions = [
            eq(userActivities.workspaceId, workspaceId),
            inArray(sql`lower(${userActivities.activityType})`, categories.map(category => category.toLowerCase())),
            sql`${userActivities.createdAt} >= ((CURRENT_TIMESTAMP AT TIME ZONE ${timeZone})::date - (${daysCount}::int - 1))::timestamp AT TIME ZONE ${timeZone}`,
            sql`${userActivities.createdAt} < ((CURRENT_TIMESTAMP AT TIME ZONE ${timeZone})::date + 1)::timestamp AT TIME ZONE ${timeZone}`,
        ];
        if (options?.userId) conditions.push(eq(userActivities.userId, options.userId));
        const rows = await this.database.select({
            activityType: sql<string>`lower(${userActivities.activityType})`,
            activityDate: sql<string>`to_char(${userActivities.createdAt} AT TIME ZONE ${timeZone}, 'YYYY-MM-DD')`,
            activityCount: sql<number>`count(*)::int`,
        }).from(userActivities).where(and(...conditions)).groupBy(sql`1`, sql`2`);
        const counts = new Map(rows.map(row => [`${row.activityType}:${row.activityDate}`, row.activityCount]));
        const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
        const part = (type: string) => parts.find(value => value.type === type)!.value;
        const start = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - daysCount + 1);
        const days = Array.from({ length: daysCount }, (_, index) => {
            const date = new Date(start);
            date.setUTCDate(start.getUTCDate() + index);
            return date.toISOString().slice(0, 10);
        });
        const label = (date: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00Z`));
        const matrix = Object.fromEntries(categories.map(category => [category, days.map(date => {
            const count = counts.get(`${category.toLowerCase()}:${date}`) ?? 0;
            return { date, formattedDate: label(date), count, level: count >= 8 ? 4 : count >= 4 ? 3 : count >= 2 ? 2 : count === 1 ? 1 : 0 };
        })]));
        return { categories, days, matrix, totalActivities: rows.reduce((total, row) => total + row.activityCount, 0),
            milestoneDates: [0, .25, .5, .75, 1].map(fraction => label(days[Math.round((days.length - 1) * fraction)])) };
    }
}
