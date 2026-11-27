import { BRAIN_DATASET_STATUSES, BRAIN_EVENT_TYPES, BRAIN_MAPPING_METHODS, BRAIN_MAPPING_STATUSES, BRAIN_SOURCE_KINDS, BRAIN_TRANSFORMATION_VERSION } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { createScopedLogger } from "../../../../shared/logging/logger.js";
import type { BrainEntityAttribute } from "../../../../shared/types/entities.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import { stableStringify, systemActor } from "../brain-types.js";
import type { SourceCatalog } from "../data/source-catalog.js";
import { deriveOntology, type DerivationDataset, type SourceForeignKey } from "./ontology-derivation.js";

const logger = createScopedLogger("brain-ontology");
export const ONTOLOGY_BUILDER = "ontology-builder@1.0.0";
const RETIRED = "retired";
const ACTIVE = "active";

export interface OntologyChanges {
    readonly typesCreated: number;
    readonly typesUpdated: number;
    readonly typesRetired: number;
    readonly relationshipsCreated: number;
    readonly relationshipsUpdated: number;
    readonly relationshipsRetired: number;
    readonly mappingsCreated: number;
    readonly mappingsSuperseded: number;
}

const sameAttributes = (left: ReadonlyArray<BrainEntityAttribute>, right: ReadonlyArray<BrainEntityAttribute>) => stableStringify(left) === stableStringify(right);

/**
 * Keeps the workspace ontology in step with its data. Called after every sync that produced a schema, and after
 * a source is linked, unlinked, revoked or purged. One workspace ontology spans every linked source, so the
 * whole ontology is derived again each time; only the differences are written, and each change is audited.
 * Builds for a workspace are coalesced: a request during a build triggers exactly one more build afterwards.
 */
export class OntologyBuilder {
    private readonly builds = new Map<string, { dirty: boolean; done: Promise<OntologyChanges | null> }>();

    constructor(private readonly unit: IUnitOfWork, private readonly audit: BrainAuditService, private readonly catalog: SourceCatalog) {}

    /** Brings the ontology up to date; resolves when it includes everything synced before the call. */
    rebuild(workspaceId: string): Promise<OntologyChanges | null> {
        const running = this.builds.get(workspaceId);
        if (running) { running.dirty = true; return running.done; }
        const state: { dirty: boolean; done: Promise<OntologyChanges | null> } = { dirty: false, done: Promise.resolve(null) };
        state.done = (async () => {
            let changes: OntologyChanges | null = null;
            do {
                state.dirty = false;
                changes = await this.build(workspaceId).catch(error => { logger.error({ workspaceId, error: String(error) }, "The ontology could not be rebuilt"); return null; });
            } while (state.dirty);
            return changes;
        })().finally(() => this.builds.delete(workspaceId));
        this.builds.set(workspaceId, state);
        return state.done;
    }

    /** Fire-and-forget form for callers that need not wait. */
    schedule(workspaceId: string): void {
        void this.rebuild(workspaceId);
    }

    private async build(workspaceId: string): Promise<OntologyChanges> {
        const [datasets, links, connections] = await Promise.all([
            this.unit.brainData.listDatasets(workspaceId),
            this.unit.brainData.listSourceLinks(workspaceId),
            this.unit.connections.listByWorkspace(workspaceId),
        ]);
        const linked = new Set(links.map(link => link.connectionId));
        const connectionName = new Map(connections.map(connection => [connection.id, connection.name]));
        // Only data that is still flowing from a linked business source shapes the ontology.
        const current = datasets.filter(dataset => dataset.status !== BRAIN_DATASET_STATUSES.revoked && dataset.connectionId && linked.has(dataset.connectionId) && dataset.currentSchema.length);
        const input: DerivationDataset[] = current.map(dataset => ({
            id: dataset.id, name: dataset.name, domain: dataset.domain, connectionId: dataset.connectionId, connectionName: connectionName.get(dataset.connectionId!) ?? null,
            table: (dataset.sourceConfig as { table?: { schema: string; name: string } }).table ?? null, primaryKeyField: dataset.primaryKeyField,
            schema: dataset.currentSchema, protectedFields: dataset.protectedFields, classification: dataset.classification,
        }));
        const foreignKeys = new Map<string, SourceForeignKey[]>();
        for (const connectionId of new Set(current.filter(dataset => dataset.sourceKind === BRAIN_SOURCE_KINDS.database).map(dataset => dataset.connectionId!))) {
            foreignKeys.set(connectionId, await this.catalog.foreignKeys(workspaceId, connectionId));
        }
        const derived = deriveOntology(input, foreignKeys);
        const changes = await this.unit.transaction(repositories => this.persist(repositories, workspaceId, derived));
        const changed = Object.values(changes).some(count => count > 0);
        if (changed) {
            const actor = systemActor(workspaceId);
            await this.audit.recordQuietly(entryFor(actor, "ontology.derived", "ontology", null, { metadata: { ...changes, builder: ONTOLOGY_BUILDER, types: derived.types.length, relationships: derived.relationships.length } }));
            await this.audit.publishQuietly(workspaceId, BRAIN_EVENT_TYPES.ontologyUpdated, { ...changes }, { actorId: "system" });
        }
        return changes;
    }

    private async persist(repositories: IUnitOfWork, workspaceId: string, derived: ReturnType<typeof deriveOntology>): Promise<OntologyChanges> {
        const counts = { typesCreated: 0, typesUpdated: 0, typesRetired: 0, relationshipsCreated: 0, relationshipsUpdated: 0, relationshipsRetired: 0, mappingsCreated: 0, mappingsSuperseded: 0 };
        const semantic = repositories.brainSemantic;
        const existingTypes = new Map((await semantic.listEntityTypes(workspaceId)).map(type => [type.key, type]));
        const typeIds = new Map<string, string>();
        for (const type of derived.types) {
            const existing = existingTypes.get(type.key);
            if (!existing) {
                const created = await semantic.createEntityType({ workspaceId, key: type.key, name: type.name, description: type.description, attributes: type.attributes, ownerUserId: null });
                typeIds.set(type.key, created.id);
                counts.typesCreated++;
                continue;
            }
            typeIds.set(type.key, existing.id);
            const definitionChanged = !sameAttributes(existing.attributes, type.attributes) || existing.description !== type.description || existing.name !== type.name;
            if (definitionChanged || existing.status !== ACTIVE) {
                // A changed definition is a new version with a new effective date; reactivation alone is not.
                await semantic.updateEntityType(existing.id, workspaceId, {
                    name: type.name, description: type.description, attributes: type.attributes, status: ACTIVE,
                    ...(definitionChanged ? { version: existing.version + 1, effectiveFrom: new Date() } : {}),
                });
                counts.typesUpdated++;
            }
        }
        const derivedKeys = new Set(derived.types.map(type => type.key));
        for (const [key, type] of existingTypes) {
            if (derivedKeys.has(key) || type.status === RETIRED) continue;
            await semantic.updateEntityType(type.id, workspaceId, { status: RETIRED });
            counts.typesRetired++;
        }

        const existingRelationships = new Map((await semantic.listRelationshipTypes(workspaceId)).map(relationship => [relationship.key, relationship]));
        for (const relationship of derived.relationships) {
            const fromTypeId = typeIds.get(relationship.fromKey)!;
            const toTypeId = typeIds.get(relationship.toKey)!;
            const values = {
                name: relationship.name, description: relationship.description, fromTypeId, toTypeId, fromAttribute: relationship.fromAttribute,
                cardinality: "many_to_one", method: relationship.method, confidence: relationship.confidence, evidence: relationship.evidence,
            };
            const existing = existingRelationships.get(relationship.key);
            if (!existing) {
                await semantic.createRelationshipType({ workspaceId, key: relationship.key, ...values });
                counts.relationshipsCreated++;
                continue;
            }
            const changed = existing.toTypeId !== toTypeId || existing.fromTypeId !== fromTypeId || existing.fromAttribute !== relationship.fromAttribute || existing.method !== relationship.method;
            if (changed || existing.status !== ACTIVE || existing.description !== relationship.description) {
                await semantic.updateRelationshipType(existing.id, workspaceId, { ...values, status: ACTIVE, ...(changed ? { version: existing.version + 1 } : {}) });
                counts.relationshipsUpdated++;
            }
        }
        const relationshipKeys = new Set(derived.relationships.map(relationship => relationship.key));
        for (const [key, relationship] of existingRelationships) {
            if (relationshipKeys.has(key) || relationship.status === RETIRED) continue;
            await semantic.updateRelationshipType(relationship.id, workspaceId, { status: RETIRED });
            counts.relationshipsRetired++;
        }

        // Every field is mapped automatically and approved by the builder; the evidence says how it was derived.
        const mappingKey = (datasetId: string, field: string, typeId: string, attribute: string) => `${datasetId}|${field}|${typeId}|${attribute}`;
        const wanted = new Map(derived.mappings.map(mapping => [mappingKey(mapping.datasetId, mapping.sourceField, typeIds.get(mapping.typeKey)!, mapping.attributeKey), mapping]));
        const existingMappings = await semantic.listMappings(workspaceId, { limit: 100_000 });
        const present = new Set<string>();
        for (const mapping of existingMappings) {
            const key = mappingKey(mapping.datasetId, mapping.sourceField, mapping.entityTypeId, mapping.attributeKey);
            if (wanted.has(key)) {
                present.add(key);
                if (mapping.status !== BRAIN_MAPPING_STATUSES.approved) {
                    await semantic.updateMapping(mapping.id, workspaceId, { status: BRAIN_MAPPING_STATUSES.approved, reviewNote: "Derived automatically from the source schema.", proposedBy: ONTOLOGY_BUILDER });
                }
            } else if (mapping.status !== BRAIN_MAPPING_STATUSES.rejected) {
                await semantic.updateMapping(mapping.id, workspaceId, { status: BRAIN_MAPPING_STATUSES.rejected, reviewNote: "Superseded by the automatically derived ontology." });
                counts.mappingsSuperseded++;
            }
        }
        for (const [key, mapping] of wanted) {
            if (present.has(key)) continue;
            await semantic.upsertMapping({
                workspaceId, datasetId: mapping.datasetId, sourceField: mapping.sourceField, entityTypeId: typeIds.get(mapping.typeKey)!, attributeKey: mapping.attributeKey,
                transform: "identity", confidence: 1, method: BRAIN_MAPPING_METHODS.rule, status: BRAIN_MAPPING_STATUSES.approved, proposedBy: ONTOLOGY_BUILDER,
                evidence: { derivedFrom: "schema", transformation: BRAIN_TRANSFORMATION_VERSION }, reviewNote: "Derived automatically from the source schema.",
            });
            counts.mappingsCreated++;
        }
        return counts;
    }
}
