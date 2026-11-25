import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrainServices } from "../services/brain-services.js";
import {
    datasetBody, datasetParams, quarantineQuery, quarantineResolveBody, qualityRuleBody, recordParams, ruleParams, runParams, runsQuery,
} from "../validation/brain.schemas.js";
import { actorOf } from "./brain-actor.js";

/** Business Data Platform endpoints: datasets, pipeline runs, quality rules, quarantine and lineage. */
export class BrainDataController {
    constructor(private readonly brain: BrainServices) {}

    listDatasets = async (request: FastifyRequest) => this.brain.datasets.list(actorOf(request));
    getDataset = async (request: FastifyRequest) => this.brain.datasets.get(actorOf(request), datasetParams.parse(request.params).datasetId);
    createDataset = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.datasets.create(actorOf(request), datasetBody.parse(request.body)));
    updateDataset = async (request: FastifyRequest) => this.brain.datasets.update(actorOf(request), datasetParams.parse(request.params).datasetId, datasetBody.parse(request.body));
    purgeDataset = async (request: FastifyRequest) => this.brain.datasets.purge(actorOf(request), datasetParams.parse(request.params).datasetId);
    syncDataset = async (request: FastifyRequest, reply: FastifyReply) => reply.status(202).send(await this.brain.datasets.sync(actorOf(request), datasetParams.parse(request.params).datasetId, false));
    retryDataset = async (request: FastifyRequest, reply: FastifyReply) => reply.status(202).send(await this.brain.datasets.sync(actorOf(request), datasetParams.parse(request.params).datasetId, true));
    pauseDataset = async (request: FastifyRequest) => this.brain.datasets.setPaused(actorOf(request), datasetParams.parse(request.params).datasetId, true);
    resumeDataset = async (request: FastifyRequest) => this.brain.datasets.setPaused(actorOf(request), datasetParams.parse(request.params).datasetId, false);
    revokeDataset = async (request: FastifyRequest) => this.brain.datasets.revoke(actorOf(request), datasetParams.parse(request.params).datasetId);
    acceptSchema = async (request: FastifyRequest) => this.brain.datasets.acceptSchema(actorOf(request), datasetParams.parse(request.params).datasetId);
    lineage = async (request: FastifyRequest) => this.brain.datasets.lineage(actorOf(request), datasetParams.parse(request.params).datasetId);
    listRules = async (request: FastifyRequest) => this.brain.datasets.listRules(actorOf(request), datasetParams.parse(request.params).datasetId);
    createRule = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.datasets.createRule(actorOf(request), datasetParams.parse(request.params).datasetId, qualityRuleBody.parse(request.body)));
    updateRule = async (request: FastifyRequest) => {
        const { datasetId, ruleId } = ruleParams.parse(request.params);
        return this.brain.datasets.updateRule(actorOf(request), datasetId, ruleId, qualityRuleBody.parse(request.body));
    };
    deleteRule = async (request: FastifyRequest) => {
        const { datasetId, ruleId } = ruleParams.parse(request.params);
        return this.brain.datasets.deleteRule(actorOf(request), datasetId, ruleId);
    };
    listRuns = async (request: FastifyRequest) => this.brain.datasets.runs(actorOf(request), runsQuery.parse(request.query));
    getRun = async (request: FastifyRequest) => this.brain.datasets.run(actorOf(request), runParams.parse(request.params).runId);
    listQuarantine = async (request: FastifyRequest) => this.brain.datasets.quarantine(actorOf(request), quarantineQuery.parse(request.query));
    resolveQuarantine = async (request: FastifyRequest) => this.brain.datasets.resolveQuarantine(actorOf(request), recordParams.parse(request.params).recordId, quarantineResolveBody.parse(request.body).status);
}
