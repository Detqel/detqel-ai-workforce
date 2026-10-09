import type { Agent, AgentConnection, AgentMemory, NewAgent, NewAgentConnection, NewAgentMemory } from "../../../shared/types/entities.js";
import type { AgentWithDetails } from "../../../shared/types/graphs.js";
import type { IWorkforceRepository } from "../../workforce/repositories/workforce.repository.js";
export class WorkforceService {
    constructor(private readonly repository: IWorkforceRepository) { }
    listAgentsForWorkspace(workspaceId: string): Promise<Agent[]> { return this.repository.listAgentsForWorkspace(workspaceId); }
    getAgentWithDetails(agentId: string): Promise<AgentWithDetails | undefined> { return this.repository.getAgentWithDetails(agentId); }
    attachConnection(data: NewAgentConnection): Promise<AgentConnection> { return this.repository.attachConnection(data); }
    addMemory(data: NewAgentMemory): Promise<AgentMemory> { return this.repository.addMemory(data); }
    listMemories(agentId: string): Promise<AgentMemory[]> { return this.repository.listMemories(agentId); }
    findMany(options?: {
        limit?: number;
        offset?: number;
    }): Promise<Agent[]> { return this.repository.findMany(options); }
    create(data: NewAgent): Promise<Agent> { return this.repository.create(data); }
}
