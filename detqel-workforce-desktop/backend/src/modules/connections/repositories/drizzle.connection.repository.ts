import { and, desc, eq } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import { connections, type Connection, type NewConnection, } from "../../../infrastructure/database/schema/connections.js";
import type { IConnectionRepository } from "./connection.repository.js";
export class ConnectionRepository extends BaseRepository<typeof connections, Connection, NewConnection> implements IConnectionRepository {
    constructor(database: DatabaseSession) {
        super(connections, database);
    }
    async listByWorkspace(workspaceId: string): Promise<Connection[]> {
        return this.database
            .select()
            .from(connections)
            .where(eq(connections.workspaceId, workspaceId))
            .orderBy(desc(connections.createdAt));
    }
    async updateStatus(id: string, status: string, synced: boolean = false): Promise<Connection | null> {
        const updateData: Partial<NewConnection> = { status };
        if (synced) {
            updateData.lastSyncedAt = new Date();
        }
        const [updated] = await this.database
            .update(connections)
            .set({ ...updateData, updatedAt: new Date() })
            .where(eq(connections.id, id))
            .returning();
        return updated || null;
    }
    async findInWorkspace(id: string, workspaceId: string): Promise<Connection | null> {
        const [connection] = await this.database.select().from(connections)
            .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId))).limit(1);
        return connection ?? null;
    }
    async updateInWorkspace(id: string, workspaceId: string, data: Partial<NewConnection>): Promise<Connection | null> {
        const [connection] = await this.database.update(connections).set({ ...data, updatedAt: new Date() })
            .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId))).returning();
        return connection ?? null;
    }
    async deleteInWorkspace(id: string, workspaceId: string): Promise<boolean> {
        const deleted = await this.database.delete(connections)
            .where(and(eq(connections.id, id), eq(connections.workspaceId, workspaceId))).returning({ id: connections.id });
        return deleted.length > 0;
    }
}
