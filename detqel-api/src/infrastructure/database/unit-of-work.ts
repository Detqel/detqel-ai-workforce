import { ActivityRepository } from "../../modules/analytics/repositories/drizzle.activity.repository.js";
import { AnalyticsRepository } from "../../modules/analytics/repositories/drizzle.analytics.repository.js";
import { AutomationRepository } from "../../modules/automations/repositories/drizzle.automation.repository.js";
import { BusinessRepository } from "../../modules/business/repositories/drizzle.business.repository.js";
import { ConnectionRepository } from "../../modules/connections/repositories/drizzle.connection.repository.js";
import { DomainRepository } from "../../modules/domains/repositories/drizzle.domain.repository.js";
import { MissionRepository } from "../../modules/missions/repositories/drizzle.mission.repository.js";
import { NotificationRepository } from "../../modules/notifications/repositories/drizzle.notification.repository.js";
import { UserRepository } from "../../modules/users/repositories/drizzle.user.repository.js";
import { WorkforceRepository } from "../../modules/workforce/repositories/drizzle.workforce.repository.js";
import { WorkspaceRepository } from "../../modules/workspaces/repositories/drizzle.workspace.repository.js";
import type { IUnitOfWork } from "../../shared/contracts/unit-of-work.js";
import type { DatabaseSession } from "./connection.js";
// All repositories use the same injected session, including transactions.
export class UnitOfWork implements IUnitOfWork {
    readonly users;
    readonly workspaces;
    readonly business;
    readonly connections;
    readonly workforce;
    readonly missions;
    readonly analytics;
    readonly automations;
    readonly activities;
    readonly notifications;
    readonly domains;
    constructor(private readonly database: DatabaseSession) {
        this.users = new UserRepository(database);
        this.workspaces = new WorkspaceRepository(database);
        this.business = new BusinessRepository(database);
        this.connections = new ConnectionRepository(database);
        this.workforce = new WorkforceRepository(database);
        this.missions = new MissionRepository(database);
        this.analytics = new AnalyticsRepository(database);
        this.automations = new AutomationRepository(database);
        this.activities = new ActivityRepository(database);
        this.notifications = new NotificationRepository(database);
        this.domains = new DomainRepository(database);
    }
    transaction<T>(operation: (repositories: IUnitOfWork) => Promise<T>): Promise<T> {
        return this.database.transaction(tx => operation(new UnitOfWork(tx)));
    }
}
