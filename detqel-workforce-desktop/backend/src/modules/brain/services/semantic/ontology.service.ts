import {
    BRAIN_ERRORS, BRAIN_EVENT_TYPES, BRAIN_LIMITS, BRAIN_MAPPING_METHODS, BRAIN_MAPPING_STATUSES, BRAIN_POLICY_RESOURCES,
} from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainEntityAttribute, BrainEntityType, BrainSchemaField, BrainSemanticMapping } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { actorId, type BrainActor } from "../brain-types.js";
import type { EntityResolutionService } from "./entity-resolution.service.js";
import { evaluateAccess } from "./access-policy.js";
import { suggestMappings } from "./mapping-suggester.js";
import { ONTOLOGY_TEMPLATES } from "./ontology-templates.js";

const logger = createScopedLogger("brain-ontology");

export interface EntityTypeInput { readonly key: string; readonly name: string; readonly description?: string | null; readonly attributes: BrainEntityAttribute[] }
export interface RelationshipInput { readonly key: string; readonly name: string; readonly description?: string | null; readonly fromTypeId: string; readonly toTypeId: string; readonly fromAttribute: string; readonly cardinality: string }
export interface MappingInput { readonly datasetId: string; readonly sourceField: string; readonly entityTypeId: string; readonly attributeKey: string; readonly transform: string }

/** A mapping proposal from the Ontology Steward agent. Agent proposals always go to human review. */
export interface AgentMappingProposal { readonly sourceField: string; readonly entityTypeKey: string; readonly attributeKey: string; readonly confidence: number; readonly rationale: string }
export interface IMappingAdvisor {
    propose(workspaceId: string, fields: ReadonlyArray<BrainSchemaField>, entityTypes: ReadonlyArray<BrainEntityType>, signal?: AbortSignal): Promise<AgentMappingProposal[]>;
}

/** The governed ontology (FR-BRAIN-001..006): entity types, relationships, and reviewed source-to-canonical mappings. */
export class OntologyService {
    constructor(
        private readonly unit: IUnitOfWork,
        private readonly audit: BrainAuditService,
        private readonly entities: EntityResolutionService,
        private readonly advisor: IMappingAdvisor | null,
    ) {}

    async listEntityTypes(actor: BrainActor) {
        const [types, counts, policies] = await Promise.all([
            this.unit.brainSemantic.listEntityTypes(actor.workspaceId),
            this.unit.brainSemantic.entityCounts(actor.workspaceId),
            this.unit.brainSemantic.listPolicies(actor.workspaceId),
        ]);
        const byType = new Map(counts.map(row => [row.entityTypeId, row.count]));
        return types.filter(type => evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.entityType, type.id).allowed)
            .map(type => ({ ...type, entityCount: byType.get(type.id) ?? 0 }));
    }

    async createEntityType(actor: BrainActor, input: EntityTypeInput) {
        validateAttributes(input.attributes);
        if (await this.unit.brainSemantic.countEntityTypes(actor.workspaceId) >= BRAIN_LIMITS.maxEntityTypes) throw new AppError(422, "This workspace has reached its entity type limit.");
        if (await this.unit.brainSemantic.findEntityTypeByKey(actor.workspaceId, input.key)) throw new AppError(409, "An entity type with this key already exists.");
        return this.unit.transaction(async repositories => {
            const created = await repositories.brainSemantic.createEntityType({ workspaceId: actor.workspaceId, key: input.key, name: input.name, description: input.description ?? null, attributes: input.attributes, ownerUserId: actor.userId });
            await this.audit.record(entryFor(actor, "ontology.entity_type.created", "entity_type", created.id, { metadata: { key: created.key, attributes: created.attributes.length } }), repositories);
            return created;
        });
    }

    /** Each change is a new version with a new effective date; the previous definition is kept in the audit trail. */
    async updateEntityType(actor: BrainActor, id: string, input: Omit<EntityTypeInput, "key">) {
        validateAttributes(input.attributes);
        const existing = await this.unit.brainSemantic.findEntityType(id, actor.workspaceId);
        if (!existing) throw new AppError(404, BRAIN_ERRORS.entityTypeNotFound);
        return this.unit.transaction(async repositories => {
            const updated = await repositories.brainSemantic.updateEntityType(id, actor.workspaceId, {
                name: input.name, description: input.description ?? null, attributes: input.attributes, version: existing.version + 1, effectiveFrom: new Date(),
            });
            await this.audit.record(entryFor(actor, "ontology.entity_type.updated", "entity_type", id, { metadata: { previous: { version: existing.version, name: existing.name, attributes: existing.attributes } } }), repositories);
            return updated;
        });
    }

    async setEntityTypeStatus(actor: BrainActor, id: string, status: "active" | "retired") {
        const updated = await this.unit.brainSemantic.updateEntityType(id, actor.workspaceId, { status });
        if (!updated) throw new AppError(404, BRAIN_ERRORS.entityTypeNotFound);
        await this.audit.record(entryFor(actor, `ontology.entity_type.${status}`, "entity_type", id));
        return updated;
    }

    listRelationshipTypes(actor: BrainActor) {
        return this.unit.brainSemantic.listRelationshipTypes(actor.workspaceId);
    }

    async createRelationshipType(actor: BrainActor, input: RelationshipInput) {
        await this.assertRelationship(actor.workspaceId, input);
        return this.unit.transaction(async repositories => {
            const created = await repositories.brainSemantic.createRelationshipType({ workspaceId: actor.workspaceId, key: input.key, name: input.name, description: input.description ?? null, fromTypeId: input.fromTypeId, toTypeId: input.toTypeId, fromAttribute: input.fromAttribute, cardinality: input.cardinality });
            await this.audit.record(entryFor(actor, "ontology.relationship.created", "relationship_type", created.id, { metadata: { key: created.key } }), repositories);
            return created;
        });
    }

    async updateRelationshipType(actor: BrainActor, id: string, input: Omit<RelationshipInput, "key">) {
        const existing = await this.unit.brainSemantic.findRelationshipType(id, actor.workspaceId);
        if (!existing) throw new AppError(404, BRAIN_ERRORS.relationshipNotFound);
        await this.assertRelationship(actor.workspaceId, { ...input, key: existing.key });
        return this.unit.transaction(async repositories => {
            const updated = await repositories.brainSemantic.updateRelationshipType(id, actor.workspaceId, { ...input, description: input.description ?? null, version: existing.version + 1 });
            await this.audit.record(entryFor(actor, "ontology.relationship.updated", "relationship_type", id, { metadata: { previous: existing } }), repositories);
            return updated;
        });
    }

    async deleteRelationshipType(actor: BrainActor, id: string) {
        if (!await this.unit.brainSemantic.deleteRelationshipType(id, actor.workspaceId)) throw new AppError(404, BRAIN_ERRORS.relationshipNotFound);
        await this.audit.record(entryFor(actor, "ontology.relationship.deleted", "relationship_type", id));
        return { success: true };
    }

    /** Adds a starter template's missing entity and relationship types. Existing types are never overwritten. */
    async applyTemplate(actor: BrainActor, templateKey: string) {
        const template = ONTOLOGY_TEMPLATES.find(item => item.key === templateKey);
        if (!template) throw new AppError(404, "Ontology template not found");
        return this.unit.transaction(async repositories => {
            const ids = new Map<string, string>();
            let created = 0;
            for (const entity of template.entities) {
                const existing = await repositories.brainSemantic.findEntityTypeByKey(actor.workspaceId, entity.key);
                if (existing) { ids.set(entity.key, existing.id); continue; }
                const row = await repositories.brainSemantic.createEntityType({ workspaceId: actor.workspaceId, key: entity.key, name: entity.name, description: entity.description, attributes: entity.attributes, ownerUserId: actor.userId });
                ids.set(entity.key, row.id);
                created++;
            }
            const existingRelationships = new Set((await repositories.brainSemantic.listRelationshipTypes(actor.workspaceId)).map(item => item.key));
            for (const relationship of template.relationships) {
                if (existingRelationships.has(relationship.key)) continue;
                await repositories.brainSemantic.createRelationshipType({ workspaceId: actor.workspaceId, key: relationship.key, name: relationship.name, fromTypeId: ids.get(relationship.from)!, toTypeId: ids.get(relationship.to)!, fromAttribute: relationship.fromAttribute, cardinality: "one_to_many" });
                created++;
            }
            await this.audit.record(entryFor(actor, "ontology.template.applied", "ontology", null, { metadata: { template: template.key, created } }), repositories);
            return { template: template.key, created };
        });
    }

    templates() {
        return ONTOLOGY_TEMPLATES.map(template => ({ key: template.key, name: template.name, description: template.description, entities: template.entities.map(entity => entity.key) }));
    }

    listMappings(actor: BrainActor, options: { datasetId?: string; status?: string; limit?: number }) {
        return this.unit.brainSemantic.listMappings(actor.workspaceId, { ...options, limit: Math.min(options.limit ?? 100, 500) });
    }

    /**
     * Proposes mappings for a dataset's fields. A rule-based proposal is approved automatically only when its
     * confidence clears the threshold with no close alternative; everything else, and every agent proposal, waits
     * for an authorised reviewer (FR-BRAIN-003).
     */
    async suggestMappings(actor: BrainActor, datasetId: string, options: { useAgent: boolean; signal?: AbortSignal }) {
        const dataset = await this.unit.brainData.findDataset(datasetId, actor.workspaceId);
        if (!dataset) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        if (!dataset.currentSchema.length) throw new AppError(409, "Sync the dataset once so its schema is known before suggesting mappings.");
        const types = (await this.unit.brainSemantic.listEntityTypes(actor.workspaceId)).filter(type => type.status === "active");
        if (!types.length) throw new AppError(409, "Define entity types (or apply a starter template) before suggesting mappings.");
        const suggestions = suggestMappings(dataset.currentSchema, types);
        const saved: BrainSemanticMapping[] = [];
        for (const suggestion of suggestions) {
            const autoApprove = suggestion.confidence >= BRAIN_LIMITS.mappingConfidenceThreshold && !suggestion.ambiguous;
            saved.push(await this.unit.brainSemantic.upsertMapping({
                workspaceId: actor.workspaceId, datasetId, sourceField: suggestion.sourceField, entityTypeId: suggestion.entityTypeId,
                attributeKey: suggestion.attributeKey, transform: suggestion.transform, confidence: suggestion.confidence, method: BRAIN_MAPPING_METHODS.rule,
                evidence: { ...suggestion.evidence, ambiguous: suggestion.ambiguous }, proposedBy: "mapping-rules@1.0.0",
                status: autoApprove ? BRAIN_MAPPING_STATUSES.approved : BRAIN_MAPPING_STATUSES.proposed,
                ...(autoApprove ? { reviewNote: "Approved automatically: high confidence and unambiguous." } : {}),
            }));
        }
        const covered = new Set(suggestions.filter(item => !item.ambiguous).map(item => item.sourceField));
        const open = dataset.currentSchema.filter(field => !covered.has(field.name));
        if (options.useAgent && this.advisor && open.length) {
            try {
                const proposals = await this.advisor.propose(actor.workspaceId, open, types, options.signal);
                for (const proposal of proposals) {
                    const type = types.find(item => item.key === proposal.entityTypeKey);
                    if (!type || !type.attributes.some(attribute => attribute.key === proposal.attributeKey) || !open.some(field => field.name === proposal.sourceField)) continue;
                    saved.push(await this.unit.brainSemantic.upsertMapping({
                        workspaceId: actor.workspaceId, datasetId, sourceField: proposal.sourceField, entityTypeId: type.id, attributeKey: proposal.attributeKey,
                        transform: "identity", confidence: Math.min(Math.max(proposal.confidence, 0), BRAIN_LIMITS.agentMappingConfidenceCap),
                        method: BRAIN_MAPPING_METHODS.agent, evidence: { rationale: proposal.rationale.slice(0, 500) }, proposedBy: "ontology-steward@1.0.0", status: BRAIN_MAPPING_STATUSES.proposed,
                    }));
                }
            } catch (error) {
                logger.warn({ workspaceId: actor.workspaceId, datasetId, error: String(error) }, "The Ontology Steward could not propose mappings; rule-based proposals were kept");
            }
        }
        const pending = saved.filter(mapping => mapping.status === BRAIN_MAPPING_STATUSES.proposed).length;
        await this.audit.record(entryFor(actor, "ontology.mappings.suggested", "dataset", datasetId, { metadata: { proposals: saved.length, pending } }));
        await this.audit.publishQuietly(actor.workspaceId, BRAIN_EVENT_TYPES.mappingProposed, { datasetId, proposals: saved.length, pending }, { actorId: actorId(actor) });
        if (saved.some(mapping => mapping.status === BRAIN_MAPPING_STATUSES.approved)) await this.rematerialize(actor.workspaceId, datasetId);
        return saved;
    }

    async createMapping(actor: BrainActor, input: MappingInput) {
        const [dataset, type] = await Promise.all([this.unit.brainData.findDataset(input.datasetId, actor.workspaceId), this.unit.brainSemantic.findEntityType(input.entityTypeId, actor.workspaceId)]);
        if (!dataset) throw new AppError(404, BRAIN_ERRORS.datasetNotFound);
        if (!type) throw new AppError(404, BRAIN_ERRORS.entityTypeNotFound);
        if (!type.attributes.some(attribute => attribute.key === input.attributeKey)) throw new AppError(400, "The entity type has no such attribute.");
        if (dataset.currentSchema.length && !dataset.currentSchema.some(field => field.name === input.sourceField)) throw new AppError(400, "The dataset has no such field.");
        const mapping = await this.unit.transaction(async repositories => {
            const created = await repositories.brainSemantic.upsertMapping({
                workspaceId: actor.workspaceId, ...input, confidence: 1, method: BRAIN_MAPPING_METHODS.manual, evidence: { createdBy: actorId(actor) },
                proposedBy: `user:${actorId(actor)}`, status: BRAIN_MAPPING_STATUSES.approved, reviewedBy: actor.userId, reviewedAt: new Date(),
            });
            await this.audit.record(entryFor(actor, "ontology.mapping.created", "mapping", created.id, { metadata: { sourceField: input.sourceField, target: `${type.key}.${input.attributeKey}` } }), repositories);
            return created;
        });
        await this.rematerialize(actor.workspaceId, input.datasetId);
        return mapping;
    }

    async reviewMapping(actor: BrainActor, id: string, decision: "approved" | "rejected", note: string | null) {
        const existing = await this.unit.brainSemantic.findMapping(id, actor.workspaceId);
        if (!existing) throw new AppError(404, BRAIN_ERRORS.mappingNotFound);
        const reviewed = await this.unit.transaction(async repositories => {
            const updated = await repositories.brainSemantic.updateMapping(id, actor.workspaceId, {
                status: decision, reviewedBy: actor.userId, reviewedAt: new Date(), reviewNote: note, version: existing.version + 1, effectiveFrom: new Date(),
            }, BRAIN_MAPPING_STATUSES.proposed);
            if (!updated) throw new AppError(409, BRAIN_ERRORS.mappingReviewed);
            await this.audit.record(entryFor(actor, `ontology.mapping.${decision}`, "mapping", id, { metadata: { confidence: existing.confidence, method: existing.method, note } }), repositories);
            return updated;
        });
        await this.audit.publishQuietly(actor.workspaceId, BRAIN_EVENT_TYPES.mappingReviewed, { mappingId: id, decision, datasetId: existing.datasetId }, { actorId: actorId(actor) });
        await this.audit.activity(actor.workspaceId, actor.userId, "decisions", `Mapping ${decision}`, "brain-mapping", id, { event: "mapping-reviewed", decision });
        if (decision === BRAIN_MAPPING_STATUSES.approved) await this.rematerialize(actor.workspaceId, existing.datasetId);
        return reviewed;
    }

    /** Counts for the overview and the agents' ontology description. */
    async summary(actor: BrainActor) {
        const [types, relationships, links, pending, rules, counts] = await Promise.all([
            this.listEntityTypes(actor),
            this.unit.brainSemantic.listRelationshipTypes(actor.workspaceId),
            this.unit.brainSemantic.countLinks(actor.workspaceId),
            this.unit.brainSemantic.countMappings(actor.workspaceId, BRAIN_MAPPING_STATUSES.proposed),
            this.unit.business.listRules(actor.workspaceId),
            this.unit.brainSemantic.entityCounts(actor.workspaceId),
        ]);
        return {
            entityTypes: types.length,
            entities: counts.reduce((total, row) => total + row.count, 0),
            relationshipTypes: relationships.length,
            relationships: links,
            rules: rules.filter(rule => rule.status === "active").length,
            pendingMappings: pending,
            types: types.map(type => ({ key: type.key, name: type.name, version: type.version, entities: type.entityCount, attributes: type.attributes.length })),
        };
    }

    private async rematerialize(workspaceId: string, datasetId: string): Promise<void> {
        const dataset = await this.unit.brainData.findDataset(datasetId, workspaceId);
        if (!dataset || dataset.publishedVersion === 0) return;
        await this.entities.materialize(dataset).catch(error => logger.warn({ datasetId, error: String(error) }, "Entities could not be rebuilt after a mapping change"));
    }

    private async assertRelationship(workspaceId: string, input: RelationshipInput): Promise<void> {
        const [from, to] = await Promise.all([this.unit.brainSemantic.findEntityType(input.fromTypeId, workspaceId), this.unit.brainSemantic.findEntityType(input.toTypeId, workspaceId)]);
        if (!from || !to) throw new AppError(404, BRAIN_ERRORS.entityTypeNotFound);
        if (!from.attributes.some(attribute => attribute.key === input.fromAttribute)) throw new AppError(400, `"${from.key}" has no attribute "${input.fromAttribute}".`);
        if (!to.attributes.some(attribute => attribute.identifier)) throw new AppError(400, `"${to.key}" needs an identifier attribute to be the target of a relationship.`);
    }
}

function validateAttributes(attributes: ReadonlyArray<BrainEntityAttribute>): void {
    const keys = attributes.map(attribute => attribute.key);
    if (new Set(keys).size !== keys.length) throw new AppError(400, "Attribute keys must be unique.");
    if (attributes.length > BRAIN_LIMITS.maxAttributesPerEntity) throw new AppError(400, "Too many attributes.");
    if (attributes.filter(attribute => attribute.identifier).length > 1) throw new AppError(400, "An entity type has at most one identifier attribute.");
}
