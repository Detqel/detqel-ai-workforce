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
    createTeam(data: CreateTeamPayload): Promise<AgentTeamWithMembers> {
        return this.repository.createTeam(data);
    }
    updateTeam(id: string, workspaceId: string, data: UpdateTeamPayload): Promise<AgentTeamWithMembers | undefined> {
        return this.repository.updateTeam(id, workspaceId, data);
    }
    deleteTeam(id: string, workspaceId: string): Promise<boolean> {
        return this.repository.deleteTeam(id, workspaceId);
    }
    addTeamMember(teamId: string, agentId: string, memberRole?: string, isLead?: boolean, assignedBy?: string): Promise<void> {
        return this.repository.addTeamMember(teamId, agentId, memberRole, isLead, assignedBy);
    }
    removeTeamMember(teamId: string, agentId: string): Promise<void> {
        return this.repository.removeTeamMember(teamId, agentId);
    }
}
