import { desc, eq, isNull, or } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import { agentConnections, agentMemory, agents, type Agent, type AgentConnection, type AgentMemory, type NewAgent, type NewAgentConnection, type NewAgentMemory, } from "../../../infrastructure/database/schema/workforce.js";
import type { IWorkforceRepository } from "./workforce.repository.js";
export class WorkforceRepository extends BaseRepository<typeof agents, Agent, NewAgent> implements IWorkforceRepository {
    constructor(database: DatabaseSession) {
        super(agents, database);
    }
    async listAgentsForWorkspace(workspaceId: string): Promise<Agent[]> {
        return this.database
            .select()
            .from(agents)
            .where(or(eq(agents.workspaceId, workspaceId), isNull(agents.workspaceId), eq(agents.agentType, "platform")))
            .orderBy(desc(agents.createdAt));
    }
    async getAgentWithDetails(agentId: string) {
        return this.database.query.agents.findFirst({
            where: eq(agents.id, agentId),
            with: {
                connections: {
                    with: {
                        connection: { columns: { credentialReference: false } },
                    },
                },
                memories: {
                    limit: 20,
                },
            },
        });
    }
    async attachConnection(data: NewAgentConnection): Promise<AgentConnection> {
        const [conn] = await this.database
            .insert(agentConnections)
            .values(data)
            .returning();
        return conn;
    }
    async addMemory(data: NewAgentMemory): Promise<AgentMemory> {
        const [mem] = await this.database
            .insert(agentMemory)
            .values(data)
            .returning();
        return mem;
    }
    async listMemories(agentId: string): Promise<AgentMemory[]> {
        return this.database
            .select()
            .from(agentMemory)
            .where(eq(agentMemory.agentId, agentId))
            .orderBy(desc(agentMemory.createdAt));
    }
}
