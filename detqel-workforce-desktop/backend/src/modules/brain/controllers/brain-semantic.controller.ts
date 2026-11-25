import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrainServices } from "../services/brain-services.js";
import {
    contextQuery, datasetParams, entitiesQuery, entityParams, entityTypeBody, entityTypeParams, entityTypeUpdateBody, mappingBody, mappingParams,
    mappingsQuery, mergeBody, metricBody, metricParams, policyBody, policyParams, relationshipBody, relationshipParams, relationshipUpdateBody, reviewBody,
    semanticQueryBody, suggestBody, templateParams,
} from "../validation/brain.schemas.js";
import { actorOf } from "./brain-actor.js";

/** Business Brain semantic endpoints: ontology, mappings, canonical entities, governed metrics, semantic queries, policies and context. */
export class BrainSemanticController {
    constructor(private readonly brain: BrainServices) {}

    ontologySummary = async (request: FastifyRequest) => this.brain.ontology.summary(actorOf(request));
    templates = async () => this.brain.ontology.templates();
    applyTemplate = async (request: FastifyRequest) => this.brain.ontology.applyTemplate(actorOf(request), templateParams.parse(request.params).templateKey);
    listEntityTypes = async (request: FastifyRequest) => this.brain.ontology.listEntityTypes(actorOf(request));
    createEntityType = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.ontology.createEntityType(actorOf(request), entityTypeBody.parse(request.body)));
    updateEntityType = async (request: FastifyRequest) => this.brain.ontology.updateEntityType(actorOf(request), entityTypeParams.parse(request.params).entityTypeId, entityTypeUpdateBody.parse(request.body));
    retireEntityType = async (request: FastifyRequest) => this.brain.ontology.setEntityTypeStatus(actorOf(request), entityTypeParams.parse(request.params).entityTypeId, "retired");
    listRelationships = async (request: FastifyRequest) => this.brain.ontology.listRelationshipTypes(actorOf(request));
    createRelationship = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.ontology.createRelationshipType(actorOf(request), relationshipBody.parse(request.body)));
    updateRelationship = async (request: FastifyRequest) => this.brain.ontology.updateRelationshipType(actorOf(request), relationshipParams.parse(request.params).relationshipTypeId, relationshipUpdateBody.parse(request.body));
    deleteRelationship = async (request: FastifyRequest) => this.brain.ontology.deleteRelationshipType(actorOf(request), relationshipParams.parse(request.params).relationshipTypeId);
    listMappings = async (request: FastifyRequest) => this.brain.ontology.listMappings(actorOf(request), mappingsQuery.parse(request.query));
    createMapping = async (request: FastifyRequest, reply: FastifyReply) => reply.status(201).send(await this.brain.ontology.createMapping(actorOf(request), mappingBody.parse(request.body)));
    suggestMappings = async (request: FastifyRequest) => this.brain.ontology.suggestMappings(actorOf(request), datasetParams.parse(request.params).datasetId, { useAgent: suggestBody.parse(request.body ?? {}).useAgent });
    reviewMapping = async (request: FastifyRequest) => {
        const body = reviewBody.parse(request.body);
        return this.brain.ontology.reviewMapping(actorOf(request), mappingParams.parse(request.params).mappingId, body.decision, body.note ?? null);
    };
    searchEntities = async (request: FastifyRequest) => {
        const query = entitiesQuery.parse(request.query);
        return this.brain.entities.search(actorOf(request), { entityTypeKey: query.entityType, query: query.q, limit: query.limit });
    };
    mergeCandidates = async (request: FastifyRequest) => this.brain.entities.mergeCandidates(actorOf(request));
    getEntity = async (request: FastifyRequest) => this.brain.entities.get(actorOf(request), entityParams.parse(request.params).entityId);
    mergeEntity = async (request: FastifyRequest) => this.brain.entities.merge(actorOf(request), entityParams.parse(request.params).entityId, mergeBody.parse(request.body).targetId);
    unmergeEntity = async (request: FastifyRequest) => this.brain.entities.unmerge(actorOf(request), entityParams.parse(request.params).entityId);
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
