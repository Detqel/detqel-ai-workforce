import { BRAIN_ENTITY_STATUSES, BRAIN_ERRORS, BRAIN_LIMITS, BRAIN_MAPPING_STATUSES, BRAIN_POLICY_RESOURCES } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainDataset, BrainEntity, BrainEntityType, BrainSemanticMapping } from "../../../../shared/types/entities.js";
import type { EntityUpsert, LinkInsert } from "../../repositories/brain-semantic.repository.js";
import { entryFor, type BrainAuditService } from "../brain-audit.service.js";
import type { BrainActor } from "../brain-types.js";
import { evaluateAccess, maskRecord } from "./access-policy.js";
import { applyTransform } from "./mapping-suggester.js";

const PAGE = 500;

interface TypePlan {
    readonly type: BrainEntityType;
    readonly identifier: BrainSemanticMapping;
    readonly mappings: BrainSemanticMapping[];
    readonly nameAttribute: string | null;
}

const canonicalKeyOf = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    const key = String(value).trim();
    return key ? key.slice(0, BRAIN_LIMITS.maxSourceKeyCharacters) : null;
};

/**
 * Builds canonical entities and their relationships from approved mappings (FR-BRAIN-004, FR-BRAIN-008). Each
 * entity keeps a stable id and the source records it came from; identical identifiers across sources resolve to
 * one entity. Name-based duplicates are only suggested, and merging them is a reviewed, reversible action.
 */
export class EntityResolutionService {
    constructor(private readonly unit: IUnitOfWork, private readonly audit: BrainAuditService) {}

    async materialize(dataset: BrainDataset): Promise<{ entities: number; links: number }> {
        const workspaceId = dataset.workspaceId;
        const mappings = await this.unit.brainSemantic.listMappings(workspaceId, { datasetId: dataset.id, status: BRAIN_MAPPING_STATUSES.approved, limit: 1_000 });
        if (!mappings.length) return { entities: 0, links: 0 };
        const types = await this.unit.brainSemantic.listEntityTypes(workspaceId);
        const plans: TypePlan[] = [];
        for (const type of types) {
            const own = mappings.filter(mapping => mapping.entityTypeId === type.id);
            const identifierKeys = new Set(type.attributes.filter(attribute => attribute.identifier).map(attribute => attribute.key));
            const identifier = own.find(mapping => identifierKeys.has(mapping.attributeKey));
            if (!identifier) continue;
            const nameAttribute = type.attributes.find(attribute => /^(name|title|display_?name)$/i.test(attribute.key))?.key ?? null;
            plans.push({ type, identifier, mappings: own, nameAttribute });
        }
        if (!plans.length) return { entities: 0, links: 0 };
        // The record itself is the entity whose identifier is the dataset's own key; other types are references.
        const primary = plans.find(plan => plan.identifier.sourceField === dataset.primaryKeyField) ?? plans[0];
        const relationships = (await this.unit.brainSemantic.listRelationshipTypes(workspaceId)).filter(relationship => relationship.status === "active" && plans.some(plan => plan.type.id === relationship.fromTypeId));
        let entities = 0;
        let links = 0;
        let after: string | null = null;
        for (;;) {
            const page = await this.unit.brainData.listSilverPage(dataset.id, after, PAGE);
            if (!page.length) break;
            after = page[page.length - 1].sourceKey;
            const rowsByType = new Map<string, EntityUpsert[]>();
            const recordKeys = new Map<string, Map<string, { key: string; attributes: Record<string, unknown> }>>();
            for (const record of page) {
                for (const plan of plans) {
                    const key = canonicalKeyOf(applyTransform(record.data[plan.identifier.sourceField], plan.identifier.transform));
                    if (!key) continue;
                    const attributes: Record<string, unknown> = {};
                    for (const mapping of plan.mappings) attributes[mapping.attributeKey] = applyTransform(record.data[mapping.sourceField], mapping.transform);
                    const displayName = String((plan.nameAttribute && attributes[plan.nameAttribute]) || key).slice(0, 255);
                    const list = rowsByType.get(plan.type.id) ?? [];
                    list.push({ canonicalKey: key, displayName, attributes, sourceRef: { datasetId: dataset.id, sourceKey: record.sourceKey } });
                    rowsByType.set(plan.type.id, list);
                    const perRecord = recordKeys.get(record.sourceKey) ?? new Map();
                    perRecord.set(plan.type.id, { key, attributes });
                    recordKeys.set(record.sourceKey, perRecord);
                }
            }
            const idsByType = new Map<string, Map<string, string>>();
            for (const [typeId, rows] of rowsByType) {
                const ids = await this.unit.brainSemantic.upsertEntities(workspaceId, typeId, rows);
                idsByType.set(typeId, ids);
                entities += ids.size;
            }
            const assignments = page.flatMap(record => {
                const own = recordKeys.get(record.sourceKey)?.get(primary.type.id);
                const id = own && idsByType.get(primary.type.id)?.get(own.key);
                return id ? [{ sourceKey: record.sourceKey, entityId: id }] : [];
            });
            if (assignments.length) await this.unit.brainData.setSilverEntities(dataset.id, assignments);
            for (const relationship of relationships) {
                const pairs: Array<{ from: string; toKey: string }> = [];
                for (const perRecord of recordKeys.values()) {
                    const source = perRecord.get(relationship.fromTypeId);
                    if (!source) continue;
                    const fromId = idsByType.get(relationship.fromTypeId)?.get(source.key);
                    // The from-attribute states the link; failing that, a record that is the from-entity and also carries
                    // the to-type's identifier (an opportunity row whose account_id maps to Account.accountId) states it too.
                    const toKey = canonicalKeyOf(source.attributes[relationship.fromAttribute])
                        ?? (relationship.fromTypeId === primary.type.id ? perRecord.get(relationship.toTypeId)?.key ?? null : null);
                    if (fromId && toKey) pairs.push({ from: fromId, toKey });
                }
                if (!pairs.length) continue;
                const targets = await this.unit.brainSemantic.findEntityIdsByKeys(workspaceId, relationship.toTypeId, [...new Set(pairs.map(pair => pair.toKey))]);
                const rows: LinkInsert[] = pairs.flatMap(pair => {
                    const to = targets.get(pair.toKey);
                    return to && to !== pair.from ? [{ relationshipTypeId: relationship.id, fromEntityId: pair.from, toEntityId: to, sourceDatasetId: dataset.id }] : [];
                });
                links += await this.unit.brainSemantic.insertLinks(workspaceId, rows);
            }
            if (page.length < PAGE) break;
        }
        return { entities, links };
    }

    async search(actor: BrainActor, options: { entityTypeKey?: string; query?: string; limit?: number }) {
        const [types, policies] = await Promise.all([this.unit.brainSemantic.listEntityTypes(actor.workspaceId), this.unit.brainSemantic.listPolicies(actor.workspaceId)]);
        const visible = new Map(types.filter(type => evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.entityType, type.id).allowed).map(type => [type.id, type]));
        const filterType = options.entityTypeKey ? types.find(type => type.key === options.entityTypeKey) : undefined;
        if (options.entityTypeKey && (!filterType || !visible.has(filterType.id))) return [];
        const entities = await this.unit.brainSemantic.searchEntities(actor.workspaceId, { entityTypeId: filterType?.id, query: options.query?.slice(0, 120), limit: Math.min(options.limit ?? 25, BRAIN_LIMITS.listLimit) });
        return entities.filter(entity => visible.has(entity.entityTypeId)).map(entity => this.view(entity, visible.get(entity.entityTypeId)!, policies, actor.role));
    }

    async get(actor: BrainActor, id: string) {
        const entity = await this.unit.brainSemantic.findEntity(id, actor.workspaceId);
        if (!entity) throw new AppError(404, BRAIN_ERRORS.entityNotFound);
        const [type, policies] = await Promise.all([this.unit.brainSemantic.findEntityType(entity.entityTypeId, actor.workspaceId), this.unit.brainSemantic.listPolicies(actor.workspaceId)]);
        if (!type || !evaluateAccess(policies, actor.role, BRAIN_POLICY_RESOURCES.entityType, type.id).allowed) throw new AppError(404, BRAIN_ERRORS.entityNotFound);
        return this.view(entity, type, policies, actor.role);
    }

    mergeCandidates(actor: BrainActor) {
        return this.unit.brainSemantic.listMergeCandidates(actor.workspaceId, 50);
    }

    /** Manual merge (FR-BRAIN-008): the source entity points at the target and its source references move there. */
    async merge(actor: BrainActor, sourceId: string, targetId: string) {
        if (sourceId === targetId) throw new AppError(400, "An entity cannot be merged into itself.");
        const [source, target] = await Promise.all([this.unit.brainSemantic.findEntity(sourceId, actor.workspaceId), this.unit.brainSemantic.findEntity(targetId, actor.workspaceId)]);
        if (!source || !target) throw new AppError(404, BRAIN_ERRORS.entityNotFound);
        if (source.entityTypeId !== target.entityTypeId) throw new AppError(400, "Only entities of the same type can be merged.");
        if (source.status !== BRAIN_ENTITY_STATUSES.active || target.status !== BRAIN_ENTITY_STATUSES.active) throw new AppError(409, "Both entities must be active to merge.");
        return this.unit.transaction(async repositories => {
            const refs = [...target.sourceRefs, ...source.sourceRefs.filter(ref => !target.sourceRefs.some(item => item.datasetId === ref.datasetId && item.sourceKey === ref.sourceKey))];
            await repositories.brainSemantic.updateEntity(target.id, actor.workspaceId, { sourceRefs: refs.slice(0, 200) });
            const merged = await repositories.brainSemantic.updateEntity(source.id, actor.workspaceId, { status: BRAIN_ENTITY_STATUSES.merged, mergedInto: target.id });
            await this.audit.record(entryFor(actor, "entity.merged", "entity", source.id, { metadata: { into: target.id, sourceRefs: source.sourceRefs.length } }), repositories);
            return merged;
        });
    }

    /** Reverses a merge: the entity becomes active again and the references it brought are removed from the target. */
    async unmerge(actor: BrainActor, id: string) {
        const entity = await this.unit.brainSemantic.findEntity(id, actor.workspaceId);
        if (!entity) throw new AppError(404, BRAIN_ERRORS.entityNotFound);
        if (entity.status !== BRAIN_ENTITY_STATUSES.merged || !entity.mergedInto) throw new AppError(409, "This entity is not merged.");
        const target = await this.unit.brainSemantic.findEntity(entity.mergedInto, actor.workspaceId);
        return this.unit.transaction(async repositories => {
            if (target) {
                const remaining = target.sourceRefs.filter(ref => !entity.sourceRefs.some(item => item.datasetId === ref.datasetId && item.sourceKey === ref.sourceKey));
                await repositories.brainSemantic.updateEntity(target.id, actor.workspaceId, { sourceRefs: remaining });
            }
            const restored = await repositories.brainSemantic.updateEntity(entity.id, actor.workspaceId, { status: BRAIN_ENTITY_STATUSES.active, mergedInto: null });
            await this.audit.record(entryFor(actor, "entity.unmerged", "entity", entity.id, { metadata: { from: entity.mergedInto } }), repositories);
            return restored;
        });
    }

    private view(entity: BrainEntity, type: BrainEntityType, policies: Parameters<typeof evaluateAccess>[0], role: string) {
        const access = evaluateAccess(policies, role, BRAIN_POLICY_RESOURCES.entityType, type.id);
        // Restricted attributes are hidden from everyone below administrator unless a policy says otherwise.
        const restricted = role === "owner" || role === "admin" || role === "system" ? [] : type.attributes.filter(attribute => attribute.classification === "restricted").map(attribute => attribute.key);
        return {
            id: entity.id, entityType: type.key, canonicalKey: entity.canonicalKey, displayName: entity.displayName,
            attributes: maskRecord(entity.attributes, [...access.maskedFields, ...restricted]),
            sources: entity.sourceRefs.length, confidence: entity.confidence, status: entity.status, mergedInto: entity.mergedInto, updatedAt: entity.updatedAt,
        };
    }
}
