import type { IRepository } from "../../../shared/contracts/repository.js";
import type { Agent, AgentConnection, AgentMemory, NewAgent, NewAgentConnection, NewAgentMemory } from "../../../shared/types/entities.js";
import type { AgentWithDetails } from "../../../shared/types/graphs.js";
export interface IWorkforceRepository extends IRepository<Agent, NewAgent> {
    listAgentsForWorkspace(workspaceId: string): Promise<Agent[]>;
    getAgentWithDetails(agentId: string): Promise<AgentWithDetails | undefined>;
    attachConnection(data: NewAgentConnection): Promise<AgentConnection>;
    addMemory(data: NewAgentMemory): Promise<AgentMemory>;
    listMemories(agentId: string): Promise<AgentMemory[]>;
}
