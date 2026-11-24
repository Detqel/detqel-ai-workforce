import { and, eq } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { connectionDefinitions, type ConnectionDefinition, type NewConnectionDefinition } from "../../../infrastructure/database/schema/connection-definitions.js";
import type { IConnectionDefinitionRepository } from "./connection-definition.repository.js";

export class ConnectionDefinitionRepository implements IConnectionDefinitionRepository {
    constructor(private readonly database: DatabaseSession) {}
    async findInWorkspace(id: string, workspaceId: string): Promise<ConnectionDefinition | null> {
        const [entry] = await this.database.select().from(connectionDefinitions)
            .where(and(eq(connectionDefinitions.id, id), eq(connectionDefinitions.workspaceId, workspaceId))).limit(1);
        return entry ?? null;
    }
    async createDiscovered(input: NewConnectionDefinition): Promise<ConnectionDefinition> {
        const [created] = await this.database.insert(connectionDefinitions).values(input).onConflictDoNothing({ target: connectionDefinitions.code }).returning();
        if (created) return created;
        const [existing] = await this.database.select().from(connectionDefinitions)
            .where(and(eq(connectionDefinitions.code, input.code), eq(connectionDefinitions.workspaceId, input.workspaceId))).limit(1);
        if (!existing) throw new Error("Discovered connection definition could not be stored");
        return existing;
    }
}
