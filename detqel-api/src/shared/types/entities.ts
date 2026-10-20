// Shared persistence DTOs. Type-only exports prevent ORM runtime dependencies in application layers.
export type { NewUserActivity, UserActivity } from "../../infrastructure/database/schema/activities.js";
export type { NewPrediction, NewSimulation, Prediction, Simulation } from "../../infrastructure/database/schema/analytics.js";
export type { NewUser, NewWorkspace, NewWorkspaceMember, User, Workspace, WorkspaceMember } from "../../infrastructure/database/schema/auth.js";
export type { Automation, AutomationRun, NewAutomation, NewAutomationRun, NewScheduledTask, ScheduledTask } from "../../infrastructure/database/schema/automations.js";
export type { BusinessGoal, BusinessKnowledge, BusinessMemory, BusinessProfile, BusinessRule, BusinessState, NewBusinessGoal, NewBusinessKnowledge, NewBusinessMemory, NewBusinessProfile, NewBusinessRule, NewBusinessState } from "../../infrastructure/database/schema/business.js";
export type { Connection, NewConnection } from "../../infrastructure/database/schema/connections.js";
export type { ConnectorType, NewConnectorType } from "../../infrastructure/database/schema/connector-types.js";
export type { ConnectorCatalog, NewConnectorCatalog } from "../../infrastructure/database/schema/connector-catalog.js";
export type { IndustryDomain, NewIndustryDomain } from "../../infrastructure/database/schema/domains.js";
export type { Approval, Execution, Mission, MissionAgent, MissionEvent, MissionSource, NewApproval, NewExecution, NewMission, NewMissionAgent, NewMissionEvent, NewMissionSource } from "../../infrastructure/database/schema/missions.js";
export type { NewUserNotification, UserNotification } from "../../infrastructure/database/schema/notifications.js";
export type { Agent, AgentConnection, AgentMemory, NewAgent, NewAgentConnection, NewAgentMemory } from "../../infrastructure/database/schema/workforce.js";
