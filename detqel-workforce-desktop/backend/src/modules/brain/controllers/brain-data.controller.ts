import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrainServices } from "../services/brain-services.js";
import {
    columnsQuery, databaseLoadBody, datasetBody, datasetParams, quarantineQuery, quarantineResolveBody, qualityRuleBody, recordParams, ruleParams, runParams, runsQuery,
    sourceParams,
} from "../validation/brain.schemas.js";
import { actorOf } from "./brain-actor.js";

/** Business Data Platform endpoints: the Data Layer, datasets, pipeline runs, quality rules, quarantine and lineage. */
export class BrainDataController {
    constructor(private readonly brain: BrainServices) {}

    listSources = async (request: FastifyRequest) => this.brain.sources.list(actorOf(request));
    linkSource = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.sources.link(actorOf(request), sourceParams.parse(request.params).connectionId));
    unlinkSource = async (request: FastifyRequest) => this.brain.sources.unlink(actorOf(request), sourceParams.parse(request.params).connectionId);
    sourceTables = async (request: FastifyRequest) => this.brain.sources.tables(actorOf(request), sourceParams.parse(request.params).connectionId);
    sourceColumns = async (request: FastifyRequest) => {
        const { schema, table } = columnsQuery.parse(request.query);
        return this.brain.sources.columns(actorOf(request), sourceParams.parse(request.params).connectionId, schema, table);
    };

    syncSource = async (request: FastifyRequest, reply: FastifyReply) => reply.status(202).send(await this.brain.sources.syncAll(actorOf(request), sourceParams.parse(request.params).connectionId));
    loadDatabase = async (request: FastifyRequest, reply: FastifyReply) =>
        reply.status(201).send(await this.brain.sources.loadDatabase(actorOf(request), sourceParams.parse(request.params).connectionId, databaseLoadBody.parse(request.body)));
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
