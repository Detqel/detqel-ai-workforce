import type {
    Agent,
    AgentConnection,
    AgentMemory,
    AgentSection,
    NewAgent,
    NewAgentConnection,
    NewAgentMemory,
    OrganizationAgent,
} from "../../../shared/types/entities.js";
import type {
    AgentTemplateWithDetails,
    AgentWithDetails,
    AgentTeamWithMembers,
    RecruitedOrganizationAgent,
} from "../../../shared/types/graphs.js";
import type {
    CreateCustomAgentPayload,
    CreateTeamPayload,
    IWorkforceRepository,
    MarketplaceFilterOptions,
    RecruitAgentPayload,
    UpdateTeamPayload,
} from "../repositories/workforce.repository.js";
import type { IConnectionRepository } from "../../connections/repositories/connection.repository.js";
import { AppError } from "../../../shared/errors/app-error.js";

/** Where an agent lives. Platform agents are shared by every workspace and can be read but not changed by users. */
export interface AgentScope {
    workspaceId: string | null;
    isPlatform: boolean;
}

export class WorkforceService {
    constructor(private readonly repository: IWorkforceRepository, private readonly connections: IConnectionRepository) { }
    listAgentsForWorkspace(workspaceId: string): Promise<Agent[]> { return this.repository.listAgentsForWorkspace(workspaceId); }
    getAgentWithDetails(agentId: string): Promise<AgentWithDetails | undefined> { return this.repository.getAgentWithDetails(agentId); }
    async getAgentScope(agentId: string): Promise<AgentScope> {
        const agent = await this.repository.findById(agentId);
        if (!agent) throw new AppError(404, "Agent not found");
        return { workspaceId: agent.workspaceId, isPlatform: agent.workspaceId === null || agent.agentType === "platform" };
    }
    async attachConnection(data: NewAgentConnection): Promise<AgentConnection> {
        const { workspaceId } = await this.getAgentScope(data.agentId);
        // An agent's details include its connections, so it may only use connections from its own workspace.
        if (!workspaceId || !(await this.connections.findInWorkspace(data.connectionId, workspaceId))) throw new AppError(404, "Connection not found in this workspace");
        return this.repository.attachConnection(data);
    }
    addMemory(data: NewAgentMemory): Promise<AgentMemory> { return this.repository.addMemory(data); }
    listMemories(agentId: string): Promise<AgentMemory[]> { return this.repository.listMemories(agentId); }
    findMany(options?: {
        limit?: number;
        offset?: number;
    }): Promise<Agent[]> { return this.repository.findMany(options); }
    create(data: NewAgent): Promise<Agent> { return this.repository.create(data); }
    // Marketplace methods
    listMarketplaceSections(): Promise<(AgentSection & { templateCount: number })[]> {
        return this.repository.listMarketplaceSections();
    }
    listMarketplaceTemplates(options?: MarketplaceFilterOptions): Promise<AgentTemplateWithDetails[]> {
        return this.repository.listMarketplaceTemplates(options);
    }
    getMarketplaceTemplate(identifier: string): Promise<AgentTemplateWithDetails | undefined> {
        return this.repository.getMarketplaceTemplate(identifier);
    }
    recruitTemplate(data: RecruitAgentPayload): Promise<OrganizationAgent> {
        return this.repository.recruitTemplate(data);
    }
    createCustomAgent(data: CreateCustomAgentPayload): Promise<RecruitedOrganizationAgent> {
        return this.repository.createCustomAgent(data);
    }
    listRecruitedOrganizationAgents(workspaceId: string): Promise<RecruitedOrganizationAgent[]> {
        return this.repository.listRecruitedOrganizationAgents(workspaceId);
    }
    listTeams(workspaceId: string): Promise<AgentTeamWithMembers[]> {
        return this.repository.listTeams(workspaceId);
    }
    getTeamById(id: string, workspaceId: string): Promise<AgentTeamWithMembers | undefined> {
        return this.repository.getTeamById(id, workspaceId);
    }
    /** Team details include each member's agent, so every member must be an agent recruited into the same workspace. */
    private async assertAgentsInWorkspace(agentIds: string[], workspaceId: string): Promise<void> {
        const unique = [...new Set(agentIds)];
        if (await this.repository.countOrganizationAgentsInWorkspace(unique, workspaceId) !== unique.length) {
            throw new AppError(404, "One or more agents were not found in this workspace");
        }
    }
    /** The workspace that owns a team, so access can be checked before its members are changed. */
    async requireTeamWorkspaceId(teamId: string): Promise<string> {
        const workspaceId = await this.repository.getTeamWorkspaceId(teamId);
        if (!workspaceId) throw new AppError(404, "Team not found");
        return workspaceId;
    }
    async createTeam(data: CreateTeamPayload): Promise<AgentTeamWithMembers> {
        await this.assertAgentsInWorkspace([...(data.memberAgentIds ?? []), ...(data.leadAgentId ? [data.leadAgentId] : [])], data.workspaceId);
        return this.repository.createTeam(data);
    }
    updateTeam(id: string, workspaceId: string, data: UpdateTeamPayload): Promise<AgentTeamWithMembers | undefined> {
        return this.repository.updateTeam(id, workspaceId, data);
    }
    deleteTeam(id: string, workspaceId: string): Promise<boolean> {
        return this.repository.deleteTeam(id, workspaceId);
    }
    async addTeamMember(teamId: string, agentId: string, memberRole?: string, isLead?: boolean, assignedBy?: string): Promise<void> {
        await this.assertAgentsInWorkspace([agentId], await this.requireTeamWorkspaceId(teamId));
        return this.repository.addTeamMember(teamId, agentId, memberRole, isLead, assignedBy);
    }
    removeTeamMember(teamId: string, agentId: string): Promise<void> {
        return this.repository.removeTeamMember(teamId, agentId);
    }
}
