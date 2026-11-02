import type { Agent, AgentConnection, AgentLevel, AgentMemory, AgentSection, AgentTemplate, AgentTemplateVersion, AgentTeam, AgentTeamMember, Approval, BusinessProfile, Connection, Execution, Mission, MissionAgent, MissionEvent, MissionSource, OrganizationAgent, User, Workspace, WorkspaceMember } from "./entities.js";
export type UserWithMemberships = User & {
    memberships: (WorkspaceMember & {
        workspace: Workspace;
    })[];
};
export type WorkspaceOverview = Workspace & {
    businessProfile: BusinessProfile | null;
    members: (WorkspaceMember & {
        user: User;
    })[];
};
export type AgentWithDetails = Agent & {
    connections: (AgentConnection & {
        connection: Omit<Connection, "credentialReference">;
    })[];
    memories: AgentMemory[];
};
export type MissionWithDetails = Mission & {
    missionAgents: (MissionAgent & {
        agent: Agent;
    })[];
    events: MissionEvent[];
    sources: MissionSource[];
    approvals: Approval[];
    executions: Execution[];
};
export type UserWorkspace = Pick<Workspace, "id" | "name" | "slug" | "industry" | "description" | "timezone" | "logoUrl" | "status"> & Pick<WorkspaceMember, "role" | "joinedAt">;
export type AuthWorkspace = Pick<Workspace, "id" | "name" | "slug" | "industry" | "description"> & {
    role: string;
    status: string;
};
export type AgentTemplateWithDetails = AgentTemplate & {
    section?: AgentSection | null;
    level?: AgentLevel | null;
    latestVersion?: AgentTemplateVersion | null;
};
export type RecruitedOrganizationAgent = OrganizationAgent & {
    template?: (AgentTemplate & { section?: AgentSection | null }) | null;
    teams?: {
        teamId: string;
        teamName: string;
        memberRole: string;
        isLead: boolean;
        accentColor: string;
    }[];
};
export type TeamMemberWithAgent = AgentTeamMember & {
    agent: OrganizationAgent & {
        template?: (AgentTemplate & { section?: AgentSection | null }) | null;
    };
};
export type AgentTeamWithMembers = AgentTeam & {
    members: TeamMemberWithAgent[];
    memberCount: number;
    lead?: TeamMemberWithAgent | null;
};
