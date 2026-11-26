import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest, HTTPMethods, preHandlerAsyncHookHandler } from "fastify";
import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import { requireUserId } from "../../../shared/security/request-context.js";
import { workspaceFromParams } from "../../../shared/security/workspace-guard.js";
import type { WorkspaceAccess } from "../../workspaces/services/workspace-access.service.js";
import { BrainDataController } from "../controllers/brain-data.controller.js";
import { BrainIntelligenceController } from "../controllers/brain-intelligence.controller.js";
import { BrainSemanticController } from "../controllers/brain-semantic.controller.js";
import { BrainWorkforceController } from "../controllers/brain-workforce.controller.js";
import "../controllers/brain-actor.js";
import { userActor } from "../services/brain-types.js";

type Handler = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
type RouteSpec = readonly [method: HTTPMethods, path: string, access: WorkspaceAccess, summary: string, handler: Handler];

/**
 * Resolves the caller's workspace role from the verified session before any handler runs, and refuses callers
 * without the access level the route needs. The tenant always comes from the path the session was checked
 * against, never from a body field (PRD 11.1).
 */
function brainGuard(app: FastifyInstance, access: WorkspaceAccess): preHandlerAsyncHookHandler {
    const locate = workspaceFromParams();
    return async request => {
        const userId = requireUserId(request);
        const workspaceId = await locate(request);
        const role = await app.services.workspaceAccess.authorizeWithRole(userId, workspaceId, access);
        request.brainActor = userActor(userId, workspaceId, role);
    };
}

export const brainRoutes: FastifyPluginAsync = async app => {
    const brain = app.services.brain;
    const data = new BrainDataController(brain);
    const semantic = new BrainSemanticController(brain);
    const intelligence = new BrainIntelligenceController(brain);
    const workforce = new BrainWorkforceController(brain);
    const base = "/brain/workspaces/:workspaceId";
    const routes: RouteSpec[] = [
        ["GET", "/overview", "read", "Governed telemetry, forecast, scenarios, domain health and approvals for the Business Brain page", workforce.overview],
        ["GET", "/catalog", "read", "Agents, skills, tools, analytical methods and templates", workforce.catalog],
        ["GET", "/context", "read", "Permission-filtered business context for a question", semantic.context],

        ["GET", "/data-sources", "read", "Workspace connections and whether each is linked as a business source", data.listSources],
        ["POST", "/data-sources/:connectionId/link", "manage", "Link a connection to the Business Brain as a business source", data.linkSource],
        ["DELETE", "/data-sources/:connectionId/link", "manage", "Unlink a business source and stop its datasets", data.unlinkSource],
        ["GET", "/data-sources/:connectionId/tables", "write", "Tables and views of a linked database source", data.sourceTables],
        ["GET", "/data-sources/:connectionId/columns", "write", "Columns of a table in a linked database source", data.sourceColumns],
        ["POST", "/data-sources/:connectionId/load", "manage", "Load a whole linked database, or chosen tables, into the Medallion pipeline", data.loadDatabase],
        ["GET", "/datasets", "read", "List registered datasets with zone, freshness and counts", data.listDatasets],
        ["POST", "/datasets", "write", "Register a dataset on a workspace connection and start its initial sync", data.createDataset],
        ["GET", "/datasets/:datasetId", "read", "Dataset detail: rules, recent runs, schema versions and quarantine reasons", data.getDataset],
        ["PUT", "/datasets/:datasetId", "write", "Update a dataset's source and pipeline settings", data.updateDataset],
        ["DELETE", "/datasets/:datasetId", "manage", "Purge a dataset and every derived copy", data.purgeDataset],
        ["POST", "/datasets/:datasetId/sync", "write", "Start a manual sync", data.syncDataset],
        ["POST", "/datasets/:datasetId/retry", "write", "Retry a failed dataset", data.retryDataset],
        ["POST", "/datasets/:datasetId/pause", "write", "Pause scheduled syncs", data.pauseDataset],
        ["POST", "/datasets/:datasetId/resume", "write", "Resume scheduled syncs", data.resumeDataset],
        ["POST", "/datasets/:datasetId/revoke", "manage", "Revoke a dataset's source access", data.revokeDataset],
        ["POST", "/datasets/:datasetId/schema/accept", "write", "Accept a held schema change", data.acceptSchema],
        ["GET", "/datasets/:datasetId/lineage", "read", "Source-to-Gold lineage at dataset and column level", data.lineage],
        ["GET", "/datasets/:datasetId/quality-rules", "read", "List quality rules", data.listRules],
        ["POST", "/datasets/:datasetId/quality-rules", "write", "Create a quality rule", data.createRule],
        ["PUT", "/datasets/:datasetId/quality-rules/:ruleId", "write", "Update a quality rule", data.updateRule],
        ["DELETE", "/datasets/:datasetId/quality-rules/:ruleId", "write", "Delete a quality rule", data.deleteRule],
        ["POST", "/datasets/:datasetId/mappings/suggest", "write", "Propose source-to-canonical mappings for a dataset", semantic.suggestMappings],
        ["GET", "/pipeline-runs", "read", "List pipeline runs", data.listRuns],
        ["GET", "/pipeline-runs/:runId", "read", "Get a pipeline run", data.getRun],
        ["GET", "/quarantine", "read", "List quarantined records with reason codes", data.listQuarantine],
        ["POST", "/quarantine/:recordId/resolve", "write", "Resolve or dismiss a quarantined record", data.resolveQuarantine],

        ["GET", "/ontology", "read", "Ontology summary", semantic.ontologySummary],
        ["GET", "/ontology/templates", "read", "Starter ontology templates", semantic.templates],
        ["POST", "/ontology/templates/:templateKey/apply", "write", "Add a starter template's missing types", semantic.applyTemplate],
        ["GET", "/entity-types", "read", "List entity types", semantic.listEntityTypes],
        ["POST", "/entity-types", "write", "Create an entity type", semantic.createEntityType],
        ["PUT", "/entity-types/:entityTypeId", "write", "Update an entity type (new version)", semantic.updateEntityType],
        ["POST", "/entity-types/:entityTypeId/retire", "write", "Retire an entity type", semantic.retireEntityType],
        ["GET", "/relationship-types", "read", "List relationship types", semantic.listRelationships],
        ["POST", "/relationship-types", "write", "Create a relationship type", semantic.createRelationship],
        ["PUT", "/relationship-types/:relationshipTypeId", "write", "Update a relationship type", semantic.updateRelationship],
        ["DELETE", "/relationship-types/:relationshipTypeId", "write", "Delete a relationship type", semantic.deleteRelationship],
        ["GET", "/mappings", "read", "List semantic mappings", semantic.listMappings],
        ["POST", "/mappings", "write", "Create an approved manual mapping", semantic.createMapping],
        ["POST", "/mappings/:mappingId/review", "write", "Approve or reject a proposed mapping", semantic.reviewMapping],
        ["GET", "/entities", "read", "Search canonical entities", semantic.searchEntities],
        ["GET", "/entities/merge-candidates", "read", "Possible duplicate entities", semantic.mergeCandidates],
        ["GET", "/entities/:entityId", "read", "Get a canonical entity", semantic.getEntity],
        ["POST", "/entities/:entityId/merge", "write", "Merge an entity into another", semantic.mergeEntity],
        ["POST", "/entities/:entityId/unmerge", "write", "Reverse a merge", semantic.unmergeEntity],
        ["GET", "/metrics", "read", "List governed metrics", semantic.listMetrics],
        ["POST", "/metrics", "write", "Define a metric (draft)", semantic.createMetric],
        ["GET", "/metrics/:metricId", "read", "Get a metric definition", semantic.getMetric],
        ["PUT", "/metrics/:metricId", "write", "Change a metric definition (new draft version)", semantic.updateMetric],
        ["POST", "/metrics/:metricId/approve", "manage", "Approve a metric definition and compute Gold values", semantic.approveMetric],
        ["POST", "/metrics/:metricId/retire", "manage", "Retire a metric", semantic.retireMetric],
        ["POST", "/semantic/query", "read", "Authorised semantic metric query", semantic.query],
        ["GET", "/access-policies", "manage", "List row and column access policies", semantic.listPolicies],
        ["POST", "/access-policies", "manage", "Create an access policy", semantic.createPolicy],
        ["DELETE", "/access-policies/:policyId", "manage", "Delete an access policy", semantic.deletePolicy],

        ["GET", "/intelligence/methods", "read", "Approved analytical method registry", intelligence.methods],
        ["POST", "/intelligence/forecasts", "read", "Run a governed forecast", intelligence.forecast],
        ["POST", "/intelligence/simulations", "read", "Run a what-if simulation", intelligence.simulate],
        ["POST", "/intelligence/optimisations", "read", "Run a budget optimisation", intelligence.optimise],
        ["POST", "/intelligence/root-causes", "read", "Run a root-cause analysis", intelligence.rootCause],
        ["GET", "/intelligence/runs", "read", "List analysis runs", intelligence.listRuns],
        ["GET", "/intelligence/runs/:runId", "read", "Get an analysis run", intelligence.getRun],
        ["POST", "/intelligence/runs/:runId/reproduce", "read", "Recompute a run from its snapshot", intelligence.reproduce],
        ["POST", "/intelligence/runs/:runId/workflow", "write", "Turn a recommendation into an approval-gated workflow draft", intelligence.recommendationWorkflow],
        ["GET", "/scenarios", "read", "List saved scenarios", intelligence.listScenarios],
        ["POST", "/scenarios", "read", "Save a scenario", intelligence.saveScenario],
        ["DELETE", "/scenarios/:scenarioId", "write", "Delete a scenario", intelligence.deleteScenario],
        ["POST", "/scenarios/:scenarioId/run", "read", "Re-run a saved scenario", intelligence.runScenario],

        ["GET", "/tasks", "read", "List agent tasks", workforce.listTasks],
        ["GET", "/tasks/:taskId", "read", "Inspect a task plan and its steps", workforce.getTask],
        ["GET", "/usage", "manage", "Model usage for cost governance", workforce.usage],
        ["GET", "/policy", "read", "Action-risk policy settings", workforce.getPolicySettings],
        ["PUT", "/policy", "manage", "Update action-risk policy settings", workforce.updatePolicySettings],
        ["GET", "/workflows", "read", "List workflow definitions", workforce.listWorkflows],
        ["POST", "/workflows", "write", "Create a workflow definition (draft)", workforce.createWorkflow],
        ["POST", "/workflows/from-template", "write", "Create a workflow from a template", workforce.createWorkflowFromTemplate],
        ["GET", "/workflows/:workflowId", "read", "Get a workflow definition", workforce.getWorkflow],
        ["PUT", "/workflows/:workflowId", "write", "Edit a workflow (drafts in place, published as a new version)", workforce.updateWorkflow],
        ["POST", "/workflows/:workflowId/activate", "write", "Activate a workflow version", workforce.activateWorkflow],
        ["POST", "/workflows/:workflowId/archive", "write", "Archive a workflow version", workforce.archiveWorkflow],
        ["POST", "/workflows/:workflowId/runs", "write", "Start a workflow run", workforce.startRun],
        ["GET", "/workflow-runs", "read", "List workflow runs", workforce.listRuns],
        ["GET", "/workflow-runs/:runId", "read", "Workflow run status, steps and evidence", workforce.getRun],
        ["POST", "/workflow-runs/:runId/cancel", "write", "Cancel a workflow run", workforce.cancelRun],
        ["POST", "/workflow-runs/:runId/retry", "write", "Retry a failed workflow run", workforce.retryRun],
        ["GET", "/approvals", "read", "List approvals with previews", workforce.listApprovals],
        ["POST", "/approvals/:approvalId/decide", "write", "Approve or reject an action bound to its payload", workforce.decideApproval],

        ["GET", "/assistant/conversations", "read", "List your Business Brain conversations", workforce.listConversations],
        ["POST", "/assistant/messages", "read", "Ask the Business Brain assistant", workforce.ask],
        ["GET", "/assistant/conversations/:conversationId/messages", "read", "Messages of one of your conversations", workforce.conversationMessages],
        ["DELETE", "/assistant/conversations/:conversationId", "read", "Delete one of your conversations", workforce.deleteConversation],
        ["GET", "/audit", "manage", "Business Brain audit trail (access is itself audited)", workforce.audit],
    ];
    const guards = new Map<WorkspaceAccess, preHandlerAsyncHookHandler>();
    for (const [method, path, access, summary, handler] of routes) {
        if (!guards.has(access)) guards.set(access, brainGuard(app, access));
        app.route({ method, url: `${base}${path}`, preHandler: guards.get(access)!, schema: { tags: [API_TAG_NAMES.brain], summary }, handler });
    }
};
