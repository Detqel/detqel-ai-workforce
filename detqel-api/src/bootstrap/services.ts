import { AnalyticsService } from "../modules/analytics/services/analytics.service.js";
import { ApprovalService } from "../modules/approvals/services/approval.service.js";
import { AuthService } from "../modules/auth/services/auth.service.js";
import { AutomationService } from "../modules/automations/services/automation.service.js";
import { BusinessService } from "../modules/business/services/business.service.js";
import { ConnectionService } from "../modules/connections/services/connection.service.js";
import { DomainService } from "../modules/domains/services/domain.service.js";
import { ExecutionService } from "../modules/executions/services/execution.service.js";
import { HealthService } from "../modules/health/services/health.service.js";
import { MissionService } from "../modules/missions/services/mission.service.js";
import { NotificationService } from "../modules/notifications/services/notification.service.js";
import { UserService } from "../modules/users/services/user.service.js";
import { WorkforceService } from "../modules/workforce/services/agent.service.js";
import { WorkspaceService } from "../modules/workspaces/services/workspace.service.js";
import { SettingsService } from "../modules/settings/services/settings.service.js";
import { LookupService } from "../modules/lookups/services/lookup.service.js";
import type { Environment } from "../config/env.js";
import { SessionService } from "../shared/security/session.js";
import { ConnectionAccessService } from "../modules/connections/services/connection-access.service.js";
import { ConnectionCredentialsService } from "../modules/connections/services/connection-credentials.service.js";
import { ConnectorAdapterRegistry } from "../modules/connections/adapters/connector-adapter.registry.js";
import type { IUnitOfWork } from "../shared/contracts/unit-of-work.js";
export function createServices(unit: IUnitOfWork, checkDatabase: () => Promise<void>, config: Environment) {
    const sessions = new SessionService(config.AUTH_SESSION_SECRET, config.AUTH_SESSION_TTL_SECONDS);
    const credentials = new ConnectionCredentialsService(config.CONNECTOR_ENCRYPTION_KEY);
    const adapters = new ConnectorAdapterRegistry({
        requestTimeoutMs: config.CONNECTOR_REQUEST_TIMEOUT_MS,
        allowedCommandPaths: config.CONNECTOR_ALLOWED_COMMANDS,
        allowedFilesystemRoots: config.CONNECTOR_ALLOWED_ROOTS,
    });
    return {
        auth: new AuthService(unit.users, unit.workspaces, sessions),
        workspaces: new WorkspaceService(unit),
        domains: new DomainService(unit.domains),
        users: new UserService(unit.users),
        business: new BusinessService(unit.business),
        workforce: new WorkforceService(unit.workforce),
        connections: new ConnectionService(unit.connections, unit.connectorCatalog, credentials, adapters),
        connectionAccess: new ConnectionAccessService(sessions, unit.users, unit.workspaces),
        sessions,
        missions: new MissionService(unit),
        approvals: new ApprovalService(unit),
        executions: new ExecutionService(unit),
        analytics: new AnalyticsService(unit.analytics, unit.activities),
        automations: new AutomationService(unit.automations),
        notifications: new NotificationService(unit.notifications),
        health: new HealthService(checkDatabase),
        settings: new SettingsService(unit.settings),
        lookups: new LookupService(unit.lookups),
    };
}
export type ApplicationServices = ReturnType<typeof createServices>;
declare module "fastify" {
    interface FastifyInstance {
        services: ApplicationServices;
    }
}
