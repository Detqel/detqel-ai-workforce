import { BRAIN_MAPPING_STATUSES, BRAIN_POLICY_RESOURCES } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import type { BrainActor } from "../brain-types.js";
import type { DatasetService } from "../data/dataset.service.js";
import { evaluateAccess } from "./access-policy.js";
import { displayAttributeOf } from "./entity-resolution.service.js";

const ACTIVE = "active";

/**
 * The governed ontology, read-only (FR-BRAIN-001..006). It is derived automatically from the synced data by the
 * OntologyBuilder; nobody edits it by hand. Every view is filtered by the caller's access policies.
 */
export class OntologyService {
    constructor(private readonly unit: IUnitOfWork, private readonly datasets: DatasetService) {}

    async listEntityTypes(actor: BrainActor) {
        const [types, counts, policies] = await Promise.all([
            this.unit.brainSemantic.listEntityTypes(actor.workspaceId),
            this.unit.brainSemantic.entityCounts(actor.workspaceId),
            this.unit.brainSemantic.listPolicies(actor.workspaceId),
        ]);
        const byType = new Map(counts.map(row => [row.entityTypeId, row.count]));
        return types.filter(type => type.status === ACTIVE && evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.entityType, type.id).allowed)
            .map(type => ({ ...type, entityCount: byType.get(type.id) ?? 0 }));
    }

    async listRelationshipTypes(actor: BrainActor) {
        const visible = new Set((await this.listEntityTypes(actor)).map(type => type.id));
        return (await this.unit.brainSemantic.listRelationshipTypes(actor.workspaceId))
            .filter(relationship => relationship.status === ACTIVE && visible.has(relationship.fromTypeId) && visible.has(relationship.toTypeId));
    }

    listMappings(actor: BrainActor, options: { datasetId?: string; status?: string; limit?: number }) {
        return this.unit.brainSemantic.listMappings(actor.workspaceId, { ...options, limit: Math.min(options.limit ?? 100, 500) });
    }

    /** Counts for the overview and the agents' ontology description. */
    async summary(actor: BrainActor) {
        const [types, relationships, links, rules] = await Promise.all([
            this.listEntityTypes(actor),
            this.listRelationshipTypes(actor),
            this.unit.brainSemantic.countLinks(actor.workspaceId),
            this.unit.business.listRules(actor.workspaceId),
        ]);
        return {
            entityTypes: types.length,
            entities: types.reduce((total, type) => total + type.entityCount, 0),
            relationshipTypes: relationships.length,
            relationships: links,
            rules: rules.filter(rule => rule.status === "active").length,
            types: types.map(type => ({ key: type.key, name: type.name, version: type.version, entities: type.entityCount, attributes: type.attributes.length })),
        };
    }

    /**
     * The ontology as a graph: entity types are nodes, relationships are edges. Each node says what it is, which
     * datasets and sources it comes from, its properties (with their data classification) and how many entities
     * it holds; each edge says how it was derived and how many entity pairs it links.
     */
    async graph(actor: BrainActor) {
        const [types, relationships, datasets, mappings, linkCounts] = await Promise.all([
            this.listEntityTypes(actor),
            this.listRelationshipTypes(actor),
            this.datasets.list(actor),
            this.unit.brainSemantic.listMappings(actor.workspaceId, { status: BRAIN_MAPPING_STATUSES.approved, limit: 100_000 }),
            this.unit.brainSemantic.linkCounts(actor.workspaceId),
        ]);
        const connections = await this.unit.connections.listByWorkspace(actor.workspaceId);
        const connectionName = new Map(connections.map(connection => [connection.id, connection.name]));
        const datasetById = new Map(datasets.map(dataset => [dataset.id, dataset]));
        const datasetsOfType = new Map<string, Set<string>>();
        for (const mapping of mappings) {
            if (!datasetById.has(mapping.datasetId)) continue;
            datasetsOfType.set(mapping.entityTypeId, (datasetsOfType.get(mapping.entityTypeId) ?? new Set()).add(mapping.datasetId));
        }
        const links = new Map(linkCounts.map(row => [row.relationshipTypeId, row.count]));
        const nodes = types.map(type => {
            const sources = [...(datasetsOfType.get(type.id) ?? [])].map(id => datasetById.get(id)!).map(dataset => ({
                datasetId: dataset.id, name: dataset.name, domain: dataset.domain, source: dataset.connectionId ? connectionName.get(dataset.connectionId) ?? null : null,
                table: (dataset.source as { table?: { schema: string; name: string } }).table ?? null, zone: dataset.zone, lastSuccessAt: dataset.lastSuccessAt,
                records: dataset.counts?.silver ?? 0,
            }));
            return {
                id: type.id, key: type.key, name: type.name, description: type.description, version: type.version, effectiveFrom: type.effectiveFrom,
                domains: [...new Set(sources.map(source => source.domain))].sort(),
                entityCount: type.entityCount, displayAttribute: displayAttributeOf(type),
                attributes: type.attributes.map(attribute => ({ key: attribute.key, name: attribute.name, type: attribute.type, identifier: attribute.identifier, required: attribute.required, classification: attribute.classification })),
                sources,
            };
        }).filter(node => node.sources.length > 0);
        const visible = new Set(nodes.map(node => node.id));
        const edges = relationships.filter(relationship => visible.has(relationship.fromTypeId) && visible.has(relationship.toTypeId)).map(relationship => ({
            id: relationship.id, key: relationship.key, name: relationship.name, description: relationship.description,
            from: relationship.fromTypeId, to: relationship.toTypeId, fromAttribute: relationship.fromAttribute, cardinality: relationship.cardinality,
            method: relationship.method, confidence: relationship.confidence, links: links.get(relationship.id) ?? 0,
        }));
        return {
            generatedAt: new Date().toISOString(),
            summary: {
                entityTypes: nodes.length, relationships: edges.length, entities: nodes.reduce((total, node) => total + node.entityCount, 0),
                links: edges.reduce((total, edge) => total + edge.links, 0), domains: [...new Set(nodes.flatMap(node => node.domains))].sort(),
                sources: [...new Set(nodes.flatMap(node => node.sources.map(source => source.source).filter((name): name is string => Boolean(name))))].sort(),
            },
            nodes, edges,
        };
    }
}
