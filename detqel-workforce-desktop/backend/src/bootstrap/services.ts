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
import { SECRET_PURPOSES } from "../constants/authConstants.js";
import { SessionService } from "../shared/security/session.js";
import { SecretCipher } from "../shared/security/secret-cipher.js";
import { WorkspaceAccessService } from "../modules/workspaces/services/workspace-access.service.js";
import { ConnectionCredentialsService } from "../modules/connections/services/connection-credentials.service.js";
import { ConnectorAdapterRegistry } from "../modules/connections/adapters/connector-adapter.registry.js";
import { DiscussionService } from "../modules/discussions/services/discussion.service.js";
import { DiscussionParticipants } from "../modules/discussions/services/discussion-participants.js";
import { LiteLlmClient } from "../shared/agents/litellm.client.js";
import { VirtualKeyRegistry } from "../shared/agents/virtual-key.registry.js";
import { DiscussionRuntime } from "../shared/agents/graphs/discussion-runtime.js";
import { PomlLoader } from "../shared/agents/poml/loader.js";
import { FileServer } from "../shared/rag/file-server.js";
import { MilvusClient } from "../shared/rag/milvus.client.js";
import { RagService } from "../shared/rag/rag.service.js";
import { AGENT_RUNTIME_SECRET_PURPOSE } from "../constants/agentRuntimeConstants.js";
import { OLLAMA_EMBEDDING_MODEL, OLLAMA_GATEWAY_BASE_URL } from "../constants/dockerConstants.js";
import { AgentModelProvisioner } from "../shared/agents/agent-model.provisioner.js";
import { WorkspaceWebSearch } from "../shared/agents/tools/workspace-web-search.js";
import type { IUnitOfWork } from "../shared/contracts/unit-of-work.js";
export function createServices(unit: IUnitOfWork, checkDatabase: () => Promise<void>, config: Environment, pomlLoader: PomlLoader = new PomlLoader({ bundledDirectory: process.cwd(), runtimeDirectory: process.cwd() })) {
    const sessions = new SessionService(config.AUTH_SESSION_SECRET, config.AUTH_SESSION_TTL_SECONDS);
    const credentials = new ConnectionCredentialsService(config.CONNECTOR_ENCRYPTION_KEY);
    const providerSecrets = new SecretCipher(config.CONNECTOR_ENCRYPTION_KEY, SECRET_PURPOSES.aiProviderCredentials);
    const adapters = new ConnectorAdapterRegistry({
        requestTimeoutMs: config.CONNECTOR_REQUEST_TIMEOUT_MS,
        allowedCommandPaths: config.CONNECTOR_ALLOWED_COMMANDS,
        allowedFilesystemRoots: config.CONNECTOR_ALLOWED_ROOTS,
    });
    const settings = new SettingsService(unit.settings, providerSecrets);
    const discussions = createDiscussionService(unit, config, settings, pomlLoader);
    return {
        auth: new AuthService(unit.users, unit.workspaces, sessions),
        workspaces: new WorkspaceService(unit),
        domains: new DomainService(unit.domains),
        users: new UserService(unit.users, unit.workspaces),
        business: new BusinessService(unit.business),
        workforce: new WorkforceService(unit.workforce, unit.connections),
        connections: new ConnectionService(unit.connections, unit.connectorCatalog, credentials, adapters),
        workspaceAccess: new WorkspaceAccessService(sessions, unit.users, unit.workspaces),
        sessions,
        missions: new MissionService(unit),
        approvals: new ApprovalService(unit),
        executions: new ExecutionService(unit),
        analytics: new AnalyticsService(unit.analytics, unit.activities, unit.missions),
        automations: new AutomationService(unit.automations, unit.missions),
        notifications: new NotificationService(unit.notifications),
        health: new HealthService(checkDatabase),
        settings,
        lookups: new LookupService(unit.lookups),
        discussions,
    };
}

/**
 * Builds the discussion stack: the LiteLLM gateway client, the per-process virtual-key registry, the agent
 * runtime, the file server, and the RAG service. The gateway and vector store are addressed from the managed
 * infrastructure environment; the discussion service is still constructed when they are absent so the module
 * registers, and its endpoints fail fast with a clear message if the gateway or vector store is unconfigured.
 */
function createDiscussionService(unit: IUnitOfWork, config: Environment, settings: SettingsService, pomlLoader: PomlLoader): DiscussionService {
    const gateway = new LiteLlmClient({ baseUrl: config.LITELLM_BASE_URL ?? "", masterKey: config.LITELLM_API_KEY ?? "" });
    const virtualKeyCipher = new SecretCipher(config.CONNECTOR_ENCRYPTION_KEY, AGENT_RUNTIME_SECRET_PURPOSE);
    const keys = new VirtualKeyRegistry(gateway, unit.virtualKeys, virtualKeyCipher);
    // Registers the workspace's Configuration model and the managed embedding model on the gateway on demand.
    const models = new AgentModelProvisioner(
        keys,
        workspaceId => settings.resolveAgentModelConfiguration(workspaceId),
        { model: OLLAMA_EMBEDDING_MODEL, apiBase: OLLAMA_GATEWAY_BASE_URL },
        config.CONNECTOR_ENCRYPTION_KEY,
    );
    const runtime = new DiscussionRuntime(gateway, keys, pomlLoader);
    const milvus = new MilvusClient({ address: config.MILVUS_ADDRESS ?? "", token: config.MILVUS_TOKEN });
    const rag = new RagService(gateway, keys, milvus);
    const fileServer = new FileServer();
    const participants = new DiscussionParticipants(unit.workforce, pomlLoader);
    // Each workspace searches the web with the Tavily key it saved in Settings.
    const webSearch = new WorkspaceWebSearch(workspaceId => settings.resolveWebSearchKey(workspaceId));
    return new DiscussionService(unit, runtime, fileServer, rag, models, participants, webSearch);
}
export type ApplicationServices = ReturnType<typeof createServices>;
declare module "fastify" {
    interface FastifyInstance {
        services: ApplicationServices;
    }
}
