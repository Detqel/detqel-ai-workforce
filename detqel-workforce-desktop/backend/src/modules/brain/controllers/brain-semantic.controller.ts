import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrainServices } from "../services/brain-services.js";
import {
    contextQuery, entitiesQuery, entityParams, mappingsQuery, metricBody, metricParams, policyBody, policyParams, semanticQueryBody,
} from "../validation/brain.schemas.js";
import { actorOf } from "./brain-actor.js";

/** Business Brain semantic endpoints: ontology, mappings, canonical entities, governed metrics, semantic queries, policies and context. */
export class BrainSemanticController {
    constructor(private readonly brain: BrainServices) {}

    // The ontology is derived automatically from synced data, so these endpoints only read it.
    ontologySummary = async (request: FastifyRequest) => this.brain.ontology.summary(actorOf(request));
    ontologyGraph = async (request: FastifyRequest, reply: FastifyReply) => reply.header("Cache-Control", "private, no-store").send(await this.brain.ontology.graph(actorOf(request)));
    listEntityTypes = async (request: FastifyRequest) => this.brain.ontology.listEntityTypes(actorOf(request));
    listRelationships = async (request: FastifyRequest) => this.brain.ontology.listRelationshipTypes(actorOf(request));
    listMappings = async (request: FastifyRequest) => this.brain.ontology.listMappings(actorOf(request), mappingsQuery.parse(request.query));
    searchEntities = async (request: FastifyRequest) => {
        const query = entitiesQuery.parse(request.query);
        return this.brain.entities.search(actorOf(request), { entityTypeKey: query.entityType, query: query.q, limit: query.limit });
    };
    getEntity = async (request: FastifyRequest) => this.brain.entities.get(actorOf(request), entityParams.parse(request.params).entityId);
    listMetrics = async (request: FastifyRequest) => this.brain.metrics.list(actorOf(request));
    getMetric = async (request: FastifyRequest) => this.brain.metrics.get(actorOf(request), metricParams.parse(request.params).metricId);
    createMetric = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.metrics.create(actorOf(request), metricBody.parse(request.body)));
    updateMetric = async (request: FastifyRequest) => this.brain.metrics.update(actorOf(request), metricParams.parse(request.params).metricId, metricBody.parse(request.body));
    approveMetric = async (request: FastifyRequest) => this.brain.metrics.approve(actorOf(request), metricParams.parse(request.params).metricId);
    retireMetric = async (request: FastifyRequest) => this.brain.metrics.retire(actorOf(request), metricParams.parse(request.params).metricId);
    query = async (request: FastifyRequest) => this.brain.semantic.query(actorOf(request), semanticQueryBody.parse(request.body));
    context = async (request: FastifyRequest) => this.brain.context.build(actorOf(request), contextQuery.parse(request.query).question);

    listPolicies = async (request: FastifyRequest) => this.brain.accessPolicies.list(actorOf(request));
    createPolicy = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.accessPolicies.create(actorOf(request), policyBody.parse(request.body)));
    deletePolicy = async (request: FastifyRequest) => this.brain.accessPolicies.remove(actorOf(request), policyParams.parse(request.params).policyId);
}
