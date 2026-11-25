import type { IActivityRepository } from "../../modules/analytics/repositories/activity.repository.js";
import type { IAnalyticsRepository } from "../../modules/analytics/repositories/analytics.repository.js";
import type { IAutomationRepository } from "../../modules/automations/repositories/automation.repository.js";
import type { IBusinessRepository } from "../../modules/business/repositories/business.repository.js";
import type { IConnectionRepository } from "../../modules/connections/repositories/connection.repository.js";
import type { IDomainRepository } from "../../modules/domains/repositories/domain.repository.js";
import type { IMissionRepository } from "../../modules/missions/repositories/mission.repository.js";
import type { INotificationRepository } from "../../modules/notifications/repositories/notification.repository.js";
import type { IUserRepository } from "../../modules/users/repositories/user.repository.js";
import type { IWorkforceRepository } from "../../modules/workforce/repositories/workforce.repository.js";
import type { IWorkspaceRepository } from "../../modules/workspaces/repositories/workspace.repository.js";
import type { ISettingsRepository } from "../../modules/settings/repositories/settings.repository.js";
import type { IConnectionDefinitionRepository } from "../../modules/connections/repositories/connection-definition.repository.js";
import type { IVirtualKeyRepository } from "../agents/virtual-key.repository.js";
import type { IDiscussionRepository } from "../../modules/discussions/repositories/discussion.repository.js";
import type { IBrainDataRepository } from "../../modules/brain/repositories/brain-data.repository.js";
import type { IBrainSemanticRepository } from "../../modules/brain/repositories/brain-semantic.repository.js";
import type { IBrainIntelligenceRepository } from "../../modules/brain/repositories/brain-intelligence.repository.js";
import type { IBrainWorkforceRepository } from "../../modules/brain/repositories/brain-workforce.repository.js";
import type { IBrainGovernanceRepository } from "../../modules/brain/repositories/brain-governance.repository.js";
export interface IRepositorySet {
    readonly users: IUserRepository;
    readonly workspaces: IWorkspaceRepository;
    readonly business: IBusinessRepository;
    readonly connections: IConnectionRepository;
    readonly workforce: IWorkforceRepository;
    readonly missions: IMissionRepository;
    readonly analytics: IAnalyticsRepository;
    readonly automations: IAutomationRepository;
    readonly activities: IActivityRepository;
    readonly notifications: INotificationRepository;
    readonly domains: IDomainRepository;
    readonly settings: ISettingsRepository;
    readonly connectionDefinitions: IConnectionDefinitionRepository;
    readonly virtualKeys: IVirtualKeyRepository;
    readonly discussions: IDiscussionRepository;
    readonly brainData: IBrainDataRepository;
    readonly brainSemantic: IBrainSemanticRepository;
    readonly brainIntelligence: IBrainIntelligenceRepository;
    readonly brainWorkforce: IBrainWorkforceRepository;
    readonly brainGovernance: IBrainGovernanceRepository;
}
export interface IUnitOfWork extends IRepositorySet {
    transaction<T>(operation: (repositories: IUnitOfWork) => Promise<T>): Promise<T>;
}
