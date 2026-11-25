// Shared persistence DTOs. Type-only exports prevent ORM runtime dependencies in application layers.
export type { NewUserActivity, UserActivity } from "../../infrastructure/database/schema/activities.js";
export type { NewPrediction, NewSimulation, Prediction, Simulation } from "../../infrastructure/database/schema/analytics.js";
export type { NewUser, NewWorkspace, NewWorkspaceMember, User, Workspace, WorkspaceMember } from "../../infrastructure/database/schema/auth.js";
export type { Automation, AutomationRun, NewAutomation, NewAutomationRun, NewScheduledTask, ScheduledTask } from "../../infrastructure/database/schema/automations.js";
export type { BusinessGoal, BusinessKnowledge, BusinessMemory, BusinessProfile, BusinessRule, BusinessState, NewBusinessGoal, NewBusinessKnowledge, NewBusinessMemory, NewBusinessProfile, NewBusinessRule, NewBusinessState } from "../../infrastructure/database/schema/business.js";
export type { Connection, NewConnection } from "../../infrastructure/database/schema/connections.js";
export type { ConnectionDefinition, NewConnectionDefinition } from "../../infrastructure/database/schema/connection-definitions.js";
export type { IndustryDomain, NewIndustryDomain } from "../../infrastructure/database/schema/domains.js";
export type { Approval, Execution, Mission, MissionAgent, MissionEvent, MissionSource, NewApproval, NewExecution, NewMission, NewMissionAgent, NewMissionEvent, NewMissionSource } from "../../infrastructure/database/schema/missions.js";
export type { NewUserNotification, UserNotification } from "../../infrastructure/database/schema/notifications.js";
export type { Agent, AgentConnection, AgentMemory, NewAgent, NewAgentConnection, NewAgentMemory } from "../../infrastructure/database/schema/workforce.js";
export type { AgentLevel, AgentRun, AgentSection, AgentStatus, AgentTemplate, AgentTemplateVersion, NewAgentLevel, NewAgentRun, NewAgentSection, NewAgentStatus, NewAgentTemplate, NewAgentTemplateVersion, NewOrganization, NewOrganizationAgent, Organization, OrganizationAgent } from "../../infrastructure/database/schema/recruit.js";
export type { AgentTeam, NewAgentTeam, AgentTeamMember, NewAgentTeamMember } from "../../infrastructure/database/schema/teams.js";
export type {
    BrainAccessPolicy, BrainActionApproval, BrainAgentTask, BrainAnalysisRun, BrainApprovalDecision, BrainAuditEvent, BrainBronzeRecord,
    BrainConversation, BrainDataset, BrainEntity, BrainEntityAttribute, BrainEntityLink, BrainEntityType, BrainEvent, BrainFilter,
    BrainMessage, BrainMetricDefinition, BrainMetricObservation, BrainPipelineRun, BrainPolicySettings, BrainQualityRule,
    BrainQuarantineRecord, BrainReason, BrainRelationshipType, BrainRetryEntry, BrainScenario, BrainSchemaChanges, BrainSchemaField,
    BrainSchemaVersion, BrainSemanticMapping, BrainSilverRecord, BrainSourceRef, BrainTaskStep, BrainWorkflowDefinition, BrainWorkflowRun,
    BrainWorkflowStepRun, NewBrainAccessPolicy, NewBrainActionApproval, NewBrainAgentTask, NewBrainAnalysisRun, NewBrainAuditEvent,
    NewBrainDataset, NewBrainEntityType, NewBrainEvent, NewBrainMetricDefinition, NewBrainPipelineRun, NewBrainQualityRule,
    NewBrainRelationshipType, NewBrainScenario, NewBrainSemanticMapping, NewBrainTaskStep, NewBrainWorkflowDefinition, NewBrainWorkflowRun,
} from "../../infrastructure/database/schema/brain.js";
