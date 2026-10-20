import { relations } from "drizzle-orm";
import { userActivities } from "./activities.js";
import { predictions, simulations } from "./analytics.js";
import { users, workspaceMembers, workspaces } from "./auth.js";
import { automationRuns, automations, scheduledTasks } from "./automations.js";
import { businessGoals, businessKnowledge, businessMemory, businessProfile, businessRules, businessState, } from "./business.js";
import { connections } from "./connections.js";
import { connectorTypes } from "./connector-types.js";
import { connectorCatalog } from "./connector-catalog.js";
import { approvals, executions, missionAgents, missionEvents, missions, missionSources, } from "./missions.js";
import { userNotifications } from "./notifications.js";
import { agentConnections, agentMemory, agents } from "./workforce.js";
export const usersRelations = relations(users, ({ many }) => ({
    workspacesCreated: many(workspaces, { relationName: "workspaceCreator" }),
    memberships: many(workspaceMembers),
    agentsCreated: many(agents, { relationName: "agentCreator" }),
    missionsInitiated: many(missions, { relationName: "missionInitiator" }),
    approvalsReviewed: many(approvals, { relationName: "approvalReviewer" }),
    simulationsCreated: many(simulations, { relationName: "simulationCreator" }),
    automationsCreated: many(automations, { relationName: "automationCreator" }),
    activities: many(userActivities),
    notifications: many(userNotifications),
}));
export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
    creator: one(users, {
        fields: [workspaces.createdBy],
        references: [users.id],
        relationName: "workspaceCreator",
    }),
    members: many(workspaceMembers),
    businessProfile: one(businessProfile),
    businessKnowledge: many(businessKnowledge),
    businessGoals: many(businessGoals),
    businessRules: many(businessRules),
    businessState: many(businessState),
    businessMemory: many(businessMemory),
    connections: many(connections),
    agents: many(agents),
    missions: many(missions),
    approvals: many(approvals),
    predictions: many(predictions),
    simulations: many(simulations),
    automations: many(automations),
    scheduledTasks: many(scheduledTasks),
    activities: many(userActivities),
    notifications: many(userNotifications),
}));
export const userNotificationsRelations = relations(userNotifications, ({ one }) => ({
    user: one(users, {
        fields: [userNotifications.userId],
        references: [users.id],
    }),
    workspace: one(workspaces, {
        fields: [userNotifications.workspaceId],
        references: [workspaces.id],
    }),
}));
export const userActivitiesRelations = relations(userActivities, ({ one }) => ({
    user: one(users, {
        fields: [userActivities.userId],
        references: [users.id],
    }),
    workspace: one(workspaces, {
        fields: [userActivities.workspaceId],
        references: [workspaces.id],
    }),
}));
export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [workspaceMembers.workspaceId],
        references: [workspaces.id],
    }),
    user: one(users, {
        fields: [workspaceMembers.userId],
        references: [users.id],
    }),
}));
export const businessProfileRelations = relations(businessProfile, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [businessProfile.workspaceId],
        references: [workspaces.id],
    }),
}));
export const businessKnowledgeRelations = relations(businessKnowledge, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [businessKnowledge.workspaceId],
        references: [workspaces.id],
    }),
}));
export const businessGoalsRelations = relations(businessGoals, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [businessGoals.workspaceId],
        references: [workspaces.id],
    }),
}));
export const businessRulesRelations = relations(businessRules, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [businessRules.workspaceId],
        references: [workspaces.id],
    }),
}));
export const businessStateRelations = relations(businessState, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [businessState.workspaceId],
        references: [workspaces.id],
    }),
}));
export const businessMemoryRelations = relations(businessMemory, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [businessMemory.workspaceId],
        references: [workspaces.id],
    }),
    sourceMission: one(missions, {
        fields: [businessMemory.sourceMissionId],
        references: [missions.id],
    }),
}));
export const connectionsRelations = relations(connections, ({ one, many }) => ({
    catalog: one(connectorCatalog, {
        fields: [connections.catalogId],
        references: [connectorCatalog.id],
    }),
    type: one(connectorTypes, {
        fields: [connections.connectionType],
        references: [connectorTypes.code],
    }),
    workspace: one(workspaces, {
        fields: [connections.workspaceId],
        references: [workspaces.id],
    }),
    agentConnections: many(agentConnections),
}));
export const connectorTypesRelations = relations(connectorTypes, ({ many }) => ({
    connections: many(connections),
    catalog: many(connectorCatalog),
}));
export const connectorCatalogRelations = relations(connectorCatalog, ({ one, many }) => ({
    type: one(connectorTypes, {
        fields: [connectorCatalog.connectorType],
        references: [connectorTypes.code],
    }),
    connections: many(connections),
}));
export const agentsRelations = relations(agents, ({ one, many }) => ({
    workspace: one(workspaces, {
        fields: [agents.workspaceId],
        references: [workspaces.id],
    }),
    creator: one(users, {
        fields: [agents.createdBy],
        references: [users.id],
        relationName: "agentCreator",
    }),
    connections: many(agentConnections),
    memories: many(agentMemory),
    missionAgents: many(missionAgents),
    events: many(missionEvents),
    approvalsRequested: many(approvals, { relationName: "approvalRequester" }),
}));
export const agentConnectionsRelations = relations(agentConnections, ({ one }) => ({
    agent: one(agents, {
        fields: [agentConnections.agentId],
        references: [agents.id],
    }),
    connection: one(connections, {
        fields: [agentConnections.connectionId],
        references: [connections.id],
    }),
}));
export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
    agent: one(agents, {
        fields: [agentMemory.agentId],
        references: [agents.id],
    }),
}));
export const missionsRelations = relations(missions, ({ one, many }) => ({
    workspace: one(workspaces, {
        fields: [missions.workspaceId],
        references: [workspaces.id],
    }),
    initiator: one(users, {
        fields: [missions.initiatedBy],
        references: [users.id],
        relationName: "missionInitiator",
    }),
    parentMission: one(missions, {
        fields: [missions.parentMissionId],
        references: [missions.id],
        relationName: "subMissions",
    }),
    subMissions: many(missions, { relationName: "subMissions" }),
    missionAgents: many(missionAgents),
    events: many(missionEvents),
    sources: many(missionSources),
    approvals: many(approvals),
    executions: many(executions),
    predictions: many(predictions),
    simulations: many(simulations),
    automationRuns: many(automationRuns),
}));
export const missionAgentsRelations = relations(missionAgents, ({ one }) => ({
    mission: one(missions, {
        fields: [missionAgents.missionId],
        references: [missions.id],
    }),
    agent: one(agents, {
        fields: [missionAgents.agentId],
        references: [agents.id],
    }),
}));
export const missionEventsRelations = relations(missionEvents, ({ one }) => ({
    mission: one(missions, {
        fields: [missionEvents.missionId],
        references: [missions.id],
    }),
    agent: one(agents, {
        fields: [missionEvents.agentId],
        references: [agents.id],
    }),
}));
export const missionSourcesRelations = relations(missionSources, ({ one }) => ({
    mission: one(missions, {
        fields: [missionSources.missionId],
        references: [missions.id],
    }),
}));
export const approvalsRelations = relations(approvals, ({ one, many }) => ({
    workspace: one(workspaces, {
        fields: [approvals.workspaceId],
        references: [workspaces.id],
    }),
    mission: one(missions, {
        fields: [approvals.missionId],
        references: [missions.id],
    }),
    requestedByAgent: one(agents, {
        fields: [approvals.requestedBy],
        references: [agents.id],
        relationName: "approvalRequester",
    }),
    reviewedByUser: one(users, {
        fields: [approvals.reviewedBy],
        references: [users.id],
        relationName: "approvalReviewer",
    }),
    executions: many(executions),
}));
export const executionsRelations = relations(executions, ({ one }) => ({
    mission: one(missions, {
        fields: [executions.missionId],
        references: [missions.id],
    }),
    approval: one(approvals, {
        fields: [executions.approvalId],
        references: [approvals.id],
    }),
}));
export const predictionsRelations = relations(predictions, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [predictions.workspaceId],
        references: [workspaces.id],
    }),
    mission: one(missions, {
        fields: [predictions.missionId],
        references: [missions.id],
    }),
}));
export const simulationsRelations = relations(simulations, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [simulations.workspaceId],
        references: [workspaces.id],
    }),
    mission: one(missions, {
        fields: [simulations.missionId],
        references: [missions.id],
    }),
    creator: one(users, {
        fields: [simulations.createdBy],
        references: [users.id],
        relationName: "simulationCreator",
    }),
}));
export const automationsRelations = relations(automations, ({ one, many }) => ({
    workspace: one(workspaces, {
        fields: [automations.workspaceId],
        references: [workspaces.id],
    }),
    creator: one(users, {
        fields: [automations.createdBy],
        references: [users.id],
        relationName: "automationCreator",
    }),
    runs: many(automationRuns),
}));
export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
    automation: one(automations, {
        fields: [automationRuns.automationId],
        references: [automations.id],
    }),
    mission: one(missions, {
        fields: [automationRuns.missionId],
        references: [missions.id],
    }),
}));
export const scheduledTasksRelations = relations(scheduledTasks, ({ one }) => ({
    workspace: one(workspaces, {
        fields: [scheduledTasks.workspaceId],
        references: [workspaces.id],
    }),
}));
