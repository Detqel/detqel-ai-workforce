import type { Agent, AgentConnection, AgentMemory, Approval, BusinessProfile, Connection, Execution, Mission, MissionAgent, MissionEvent, MissionSource, User, Workspace, WorkspaceMember } from "./entities.js";
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
