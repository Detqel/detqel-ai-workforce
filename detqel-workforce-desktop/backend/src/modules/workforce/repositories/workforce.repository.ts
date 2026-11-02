import type { IRepository } from "../../../shared/contracts/repository.js";
import type {
    Agent,
    AgentConnection,
    AgentMemory,
    AgentSection,
    AgentTeam,
    NewAgent,
    NewAgentConnection,
    NewAgentMemory,
    OrganizationAgent,
} from "../../../shared/types/entities.js";
import type { AgentTeamWithMembers, AgentTemplateWithDetails, AgentWithDetails, RecruitedOrganizationAgent } from "../../../shared/types/graphs.js";

export interface MarketplaceFilterOptions {
    sectionSlug?: string;
    levelCode?: string;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface RecruitAgentPayload {
    workspaceId: string;
    templateId: string;
    customName?: string;
    customRole?: string;
    customInstructions?: string;
    userId?: string;
}

export interface CreateCustomAgentPayload {
    workspaceId: string;
    name: string;
    role: string;
    sectionId: string;
    levelId?: string;
    summary?: string;
    description?: string;
    systemPrompt?: string;
    capabilities?: string[];
    userId?: string;
}

export interface CreateTeamPayload {
    workspaceId: string;
    name: string;
    description?: string;
    focus?: string;
    icon?: string;
    accentColor?: string;
    missionObjective?: string;
    memberAgentIds?: string[];
    leadAgentId?: string;
    userId?: string;
}

export interface UpdateTeamPayload {
    name?: string;
    description?: string;
    focus?: string;
    icon?: string;
    accentColor?: string;
    missionObjective?: string;
    status?: string;
}

export interface IWorkforceRepository extends IRepository<Agent, NewAgent> {
    listAgentsForWorkspace(workspaceId: string): Promise<Agent[]>;
    getAgentWithDetails(agentId: string): Promise<AgentWithDetails | undefined>;
    attachConnection(data: NewAgentConnection): Promise<AgentConnection>;
    addMemory(data: NewAgentMemory): Promise<AgentMemory>;
    listMemories(agentId: string): Promise<AgentMemory[]>;
    listMarketplaceSections(): Promise<(AgentSection & { templateCount: number })[]>;
    listMarketplaceTemplates(options?: MarketplaceFilterOptions): Promise<AgentTemplateWithDetails[]>;
    getMarketplaceTemplate(identifier: string): Promise<AgentTemplateWithDetails | undefined>;
    recruitTemplate(data: RecruitAgentPayload): Promise<OrganizationAgent>;
    createCustomAgent(data: CreateCustomAgentPayload): Promise<RecruitedOrganizationAgent>;
    listRecruitedOrganizationAgents(workspaceId: string): Promise<RecruitedOrganizationAgent[]>;
    listTeams(workspaceId: string): Promise<AgentTeamWithMembers[]>;
    getTeamById(id: string, workspaceId: string): Promise<AgentTeamWithMembers | undefined>;
    createTeam(data: CreateTeamPayload): Promise<AgentTeamWithMembers>;
    updateTeam(id: string, workspaceId: string, data: UpdateTeamPayload): Promise<AgentTeamWithMembers | undefined>;
    deleteTeam(id: string, workspaceId: string): Promise<boolean>;
    addTeamMember(teamId: string, agentId: string, memberRole?: string, isLead?: boolean, assignedBy?: string): Promise<void>;
    removeTeamMember(teamId: string, agentId: string): Promise<void>;
}
