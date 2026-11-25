import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrainServices } from "../services/brain-services.js";
import {
    approvalParams, approvalsQuery, askBody, auditQuery, conversationParams, decisionBody, listQuery, overviewQuery, policySettingsBody, runParams, taskParams,
    workflowBody, workflowParams, workflowRunBody, workflowRunsQuery, workflowTemplateBody, workflowUpdateBody,
} from "../validation/brain.schemas.js";
import { actorOf } from "./brain-actor.js";

/** Overview, AI Workforce, Workflow Engine, approvals, assistant and audit endpoints. */
export class BrainWorkforceController {
    constructor(private readonly brain: BrainServices) {}

    overview = async (request: FastifyRequest, reply: FastifyReply) => reply.header("Cache-Control", "private, no-store").send(await this.brain.overview.overview(actorOf(request), overviewQuery.parse(request.query).timeframe));
    catalog = async () => ({
        ...this.brain.tasks.catalog(),
        methods: this.brain.intelligence.methods(),
        workflowActions: this.brain.workflows.actions(),
        workflowTemplates: this.brain.workflows.templates(),
        ontologyTemplates: this.brain.ontology.templates(),
    });
    listTasks = async (request: FastifyRequest) => this.brain.tasks.list(actorOf(request), listQuery.parse(request.query).limit);
    getTask = async (request: FastifyRequest) => this.brain.tasks.get(actorOf(request), taskParams.parse(request.params).taskId);
    usage = async (request: FastifyRequest) => this.brain.tasks.usage(actorOf(request));
    getPolicySettings = async (request: FastifyRequest) => this.brain.policies.get(actorOf(request).workspaceId);
    updatePolicySettings = async (request: FastifyRequest) => this.brain.policies.update(actorOf(request), policySettingsBody.parse(request.body));

    listWorkflows = async (request: FastifyRequest) => this.brain.workflows.listDefinitions(actorOf(request));
    getWorkflow = async (request: FastifyRequest) => this.brain.workflows.getDefinition(actorOf(request), workflowParams.parse(request.params).workflowId);
    createWorkflow = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.workflows.createDefinition(actorOf(request), workflowBody.parse(request.body)));
    createWorkflowFromTemplate = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.workflows.createFromTemplate(actorOf(request), workflowTemplateBody.parse(request.body)));
    updateWorkflow = async (request: FastifyRequest) => this.brain.workflows.updateDefinition(actorOf(request), workflowParams.parse(request.params).workflowId, workflowUpdateBody.parse(request.body));
    activateWorkflow = async (request: FastifyRequest) => this.brain.workflows.activate(actorOf(request), workflowParams.parse(request.params).workflowId);
    archiveWorkflow = async (request: FastifyRequest) => this.brain.workflows.archive(actorOf(request), workflowParams.parse(request.params).workflowId);
    startRun = async (request: FastifyRequest, reply: FastifyReply) => {
        const body = workflowRunBody.parse(request.body ?? {});
        const result = await this.brain.workflows.startRun(actorOf(request), workflowParams.parse(request.params).workflowId, body.inputs, body.idempotencyKey);
        return reply.status(result.created ? 202 : 200).send(result.run);
    };
    listRuns = async (request: FastifyRequest) => this.brain.workflows.listRuns(actorOf(request), workflowRunsQuery.parse(request.query));
    getRun = async (request: FastifyRequest) => this.brain.workflows.getRun(actorOf(request), runParams.parse(request.params).runId);
    cancelRun = async (request: FastifyRequest) => this.brain.workflows.cancelRun(actorOf(request), runParams.parse(request.params).runId);
    retryRun = async (request: FastifyRequest) => this.brain.workflows.retryRun(actorOf(request), runParams.parse(request.params).runId);
    listApprovals = async (request: FastifyRequest) => this.brain.workflows.listApprovals(actorOf(request), approvalsQuery.parse(request.query).status);
    decideApproval = async (request: FastifyRequest) => {
        const actor = actorOf(request);
        const result = await this.brain.workflows.decideApproval(actor, approvalParams.parse(request.params).approvalId, decisionBody.parse(request.body));
        this.brain.overview.invalidate(actor.workspaceId);
        return result;
    };

    ask = async (request: FastifyRequest, reply: FastifyReply) => {
        // A client that disconnects stops the agents' remaining work instead of paying for an unread answer.
        const controller = new AbortController();
        reply.raw.once("close", () => { if (!reply.raw.writableFinished) controller.abort(); });
        const actor = actorOf(request);
        const result = await this.brain.assistant.ask(actor, askBody.parse(request.body), controller.signal);
        this.brain.overview.invalidate(actor.workspaceId);
        return reply.send(result);
    };
    listConversations = async (request: FastifyRequest) => this.brain.assistant.listConversations(actorOf(request));
    conversationMessages = async (request: FastifyRequest) => this.brain.assistant.messages(actorOf(request), conversationParams.parse(request.params).conversationId);
    deleteConversation = async (request: FastifyRequest) => this.brain.assistant.deleteConversation(actorOf(request), conversationParams.parse(request.params).conversationId);

    audit = async (request: FastifyRequest) => {
        const query = auditQuery.parse(request.query);
        return this.brain.audit.list(actorOf(request), { ...query, before: query.before ? new Date(query.before) : undefined });
    };
}
