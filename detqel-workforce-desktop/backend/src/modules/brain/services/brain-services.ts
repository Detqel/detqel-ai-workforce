import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { IAgentModelProvisioner } from "../../../shared/agents/agent-model.provisioner.js";
import type { LiteLlmClient } from "../../../shared/agents/litellm.client.js";
import type { PromptLoader } from "../../../shared/agents/prompts/loader.js";
import type { IWorkspaceWebSearch } from "../../../shared/agents/tools/workspace-web-search.js";
import type { VirtualKeyRegistry } from "../../../shared/agents/virtual-key.registry.js";
import type { IUnitOfWork } from "../../../shared/contracts/unit-of-work.js";
import { BrainAssistantService } from "./assistant/brain-assistant.service.js";
import { BrainAuditService } from "./brain-audit.service.js";
import { BrainOverviewService } from "./brain-overview.service.js";
import { BrainScheduler } from "./brain-scheduler.js";
import { BrainDataProtector } from "./data/data-protection.js";
import { DataSourceService } from "./data/data-source.service.js";
import { SourceCatalog } from "./data/source-catalog.js";
import { DatasetService } from "./data/dataset.service.js";
import { MedallionPipeline } from "./data/medallion-pipeline.service.js";
import { SourceExtractor, type ConnectionReaderPort } from "./data/source-extractor.js";
import { IntelligenceService } from "./intelligence/intelligence.service.js";
import { AccessPolicyService } from "./semantic/access-policy.service.js";
import { ContextService } from "./semantic/context.service.js";
import { EntityResolutionService } from "./semantic/entity-resolution.service.js";
import { MetricService } from "./semantic/metric.service.js";
import { OntologyBuilder } from "./semantic/ontology-builder.js";
import { OntologyService } from "./semantic/ontology.service.js";
import { SemanticQueryService } from "./semantic/semantic-query.service.js";
import { createWorkflowActions } from "./workflow/workflow-actions.js";
import { WorkflowEngine, type RoleResolver } from "./workflow/workflow-engine.js";
import { WorkflowService } from "./workflow/workflow.service.js";
import { BrainOrchestrator } from "./workforce/brain-orchestrator.js";
import { BrainModel, type IBrainModel } from "./workforce/brain-model.js";
import { BrainPolicyService } from "./workforce/policy-engine.js";
import { BrainTaskService } from "./workforce/task.service.js";
import { ToolGateway } from "./workforce/tool-gateway.js";
import { createBrainTools } from "./workforce/tool-registry.js";

export interface BrainDependencies {
    readonly connections: ConnectionReaderPort;
    readonly gateway: LiteLlmClient;
    readonly keys: VirtualKeyRegistry;
    readonly models: IAgentModelProvisioner;
    readonly prompts: PromptLoader;
    readonly webSearch: IWorkspaceWebSearch;
    readonly roleOf: RoleResolver;
    /** The installation master key (base64, 32 bytes). Seals raw records and keys pseudonyms; never stored with the data. */
    readonly encryptionKey: string;
    /** Replaces the gateway-backed model, for tests. */
    readonly model?: IBrainModel;
}

/** Builds the Business Brain: data platform, semantic layer, intelligence, AI workforce, workflow engine and assistant. */
export function createBrainServices(unit: IUnitOfWork, deps: BrainDependencies) {
    // Leases name their worker so a crashed process's work is recognisable and recoverable.
    const workerId = `${hostname().slice(0, 30)}:${process.pid}:${randomUUID().slice(0, 8)}`;
    const audit = new BrainAuditService(unit);
    const model = deps.model ?? new BrainModel(deps.gateway, deps.keys, deps.models, deps.prompts);
    const entities = new EntityResolutionService(unit);
    const metrics = new MetricService(unit, audit);
    const protector = new BrainDataProtector(deps.encryptionKey);
    const extractor = new SourceExtractor(deps.connections, protector);
    // The ontology is derived from the data on every sync; nobody models it by hand.
    const ontologyBuilder = new OntologyBuilder(unit, audit, new SourceCatalog(deps.connections));
    const pipeline = new MedallionPipeline(unit, extractor, metrics, entities, ontologyBuilder, audit, protector, workerId);
    const datasets = new DatasetService(unit, audit, extractor, pipeline, ontologyBuilder);
    const ontology = new OntologyService(unit, datasets);
    const semantic = new SemanticQueryService(unit);
    const intelligence = new IntelligenceService(unit, semantic, audit);
    const context = new ContextService(unit, semantic, datasets);
    const policies = new BrainPolicyService(unit, audit);
    const overview = new BrainOverviewService(unit, datasets, ontology, intelligence);
    const accessPolicies = new AccessPolicyService(unit, audit, workspaceId => overview.invalidate(workspaceId));
    // The scheduler is built last; sources wake it through this late-bound reference.
    let scheduler: BrainScheduler | null = null;
    const sourcesChanged = (workspaceId: string) => { overview.invalidate(workspaceId); ontologyBuilder.schedule(workspaceId); };
    const sources = new DataSourceService(unit, audit, deps.connections, datasets, sourcesChanged, () => scheduler?.wake());
    let workflows: WorkflowService | null = null;
    const tools = createBrainTools({ unit, semantic, intelligence, datasets, ontology, entities, overview: () => overview, workflows: () => workflows!, webSearch: deps.webSearch, policies, audit });
    const toolGateway = new ToolGateway(unit, audit, tools, policies);
    const engine = new WorkflowEngine(unit, audit, createWorkflowActions({ unit, pipeline, intelligence, connections: deps.connections, audit }), policies, deps.roleOf, workerId);
    workflows = new WorkflowService(unit, audit, engine, toolGateway, deps.roleOf);
    const orchestrator = new BrainOrchestrator(unit, toolGateway, model, semantic, datasets, audit);
    scheduler = new BrainScheduler(unit, pipeline, workflows, engine, ontologyBuilder, entities);
    return {
        audit, sources, datasets, pipeline, ontology, ontologyBuilder, entities, metrics, semantic, intelligence, context, policies, overview, accessPolicies,
        tools: toolGateway, tasks: new BrainTaskService(unit, toolGateway), engine, workflows,
        assistant: new BrainAssistantService(unit, orchestrator, audit),
        scheduler,
    };
}
export type BrainServices = ReturnType<typeof createBrainServices>;
