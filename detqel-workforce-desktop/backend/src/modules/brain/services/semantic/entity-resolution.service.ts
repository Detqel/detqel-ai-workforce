import { BRAIN_CLASSIFICATIONS, BRAIN_ERRORS, BRAIN_LIMITS, BRAIN_MAPPING_STATUSES, BRAIN_POLICY_RESOURCES } from "../../../../constants/brainConstants.js";
import type { IUnitOfWork } from "../../../../shared/contracts/unit-of-work.js";
import { AppError } from "../../../../shared/errors/app-error.js";
import type { BrainDataset, BrainEntity, BrainEntityType, BrainSemanticMapping } from "../../../../shared/types/entities.js";
import type { EntityUpsert } from "../../repositories/brain-semantic.repository.js";
import type { BrainActor } from "../brain-types.js";
import { evaluateAccess, maskRecord } from "./access-policy.js";
import { applyTransform } from "./mapping-transforms.js";

const PAGE = 500;
/** Attributes copied onto each entity; the full record stays in Silver, so entities stay small. */
const MAX_ENTITY_ATTRIBUTES = 24;
/** Attribute keys that read as a record's display name, best first. */
const DISPLAY_KEYS = ["name", "displayName", "title", "label", "companyName", "company", "accountName", "productName", "customerName", "fullName", "subject", "code", "number", "reference"];

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

/** The attribute that names a record: a known display key, else any non-restricted "...Name" attribute. */
export function displayAttributeOf(type: Pick<BrainEntityType, "attributes">): string | null {
    const usable = type.attributes.filter(attribute => attribute.classification !== BRAIN_CLASSIFICATIONS.restricted && !attribute.identifier);
    for (const key of DISPLAY_KEYS) if (usable.some(attribute => attribute.key === key)) return key;
    return usable.find(attribute => /Name$/.test(attribute.key))?.key ?? null;
}

/**
 * Builds canonical entities and their links from the automatically derived ontology (FR-BRAIN-004, FR-BRAIN-008).
 * Each entity keeps a stable id and the source records it came from; identical identifiers across sources
 * resolve to one entity. Links are resolved in the database in both directions, so the order in which datasets
 * sync does not matter: whichever side arrives second completes the link.
 */
export class EntityResolutionService {
    constructor(private readonly unit: IUnitOfWork) {}

    async materialize(dataset: BrainDataset): Promise<{ entities: number; links: number }> {
        const workspaceId = dataset.workspaceId;
        const mappings = await this.unit.brainSemantic.listMappings(workspaceId, { datasetId: dataset.id, status: BRAIN_MAPPING_STATUSES.approved, limit: 1_000 });
        if (!mappings.length) return { entities: 0, links: 0 };
        const [types, relationships] = await Promise.all([
            this.unit.brainSemantic.listEntityTypes(workspaceId),
            this.unit.brainSemantic.listRelationshipTypes(workspaceId),
        ]);
        const active = relationships.filter(relationship => relationship.status === "active");
        const plans: TypePlan[] = [];
        for (const type of types.filter(item => item.status === "active")) {
            const own = mappings.filter(mapping => mapping.entityTypeId === type.id);
            const identifierKeys = new Set(type.attributes.filter(attribute => attribute.identifier).map(attribute => attribute.key));
            // The dataset's own key is its identifier; another identifier of a shared type belongs to another source.
            const identifier = own.find(mapping => identifierKeys.has(mapping.attributeKey) && mapping.sourceField === dataset.primaryKeyField) ?? own.find(mapping => identifierKeys.has(mapping.attributeKey));
            if (!identifier) continue;
            const nameAttribute = displayAttributeOf(type);
            const references = new Set(active.filter(relationship => relationship.fromTypeId === type.id).map(relationship => relationship.fromAttribute));
            const ranked = [
                identifier,
                ...own.filter(mapping => mapping !== identifier && (mapping.attributeKey === nameAttribute || references.has(mapping.attributeKey))),
                ...own.filter(mapping => mapping !== identifier && mapping.attributeKey !== nameAttribute && !references.has(mapping.attributeKey)),
            ];
            plans.push({ type, identifier, mappings: ranked.slice(0, Math.max(MAX_ENTITY_ATTRIBUTES, 1 + references.size + 1)), nameAttribute });
        }
        if (!plans.length) return { entities: 0, links: 0 };
        let entities = 0;
        let after: string | null = null;
        for (;;) {
            const page = await this.unit.brainData.listSilverPage(dataset.id, after, PAGE);
            if (!page.length) break;
            after = page[page.length - 1].sourceKey;
            for (const plan of plans) {
                const rows: EntityUpsert[] = [];
                const recordOf = new Map<string, string>();
                for (const record of page) {
                    const key = canonicalKeyOf(applyTransform(record.data[plan.identifier.sourceField], plan.identifier.transform));
                    if (!key) continue;
                    const attributes: Record<string, unknown> = {};
                    for (const mapping of plan.mappings) attributes[mapping.attributeKey] = applyTransform(record.data[mapping.sourceField], mapping.transform);
                    const displayName = String((plan.nameAttribute && attributes[plan.nameAttribute]) || key).slice(0, 255);
                    rows.push({ canonicalKey: key, displayName, attributes, sourceRef: { datasetId: dataset.id, sourceKey: record.sourceKey } });
                    recordOf.set(record.sourceKey, key);
                }
                if (!rows.length) continue;
                const ids = await this.unit.brainSemantic.upsertEntities(workspaceId, plan.type.id, rows);
                entities += ids.size;
                const assignments = [...recordOf].flatMap(([sourceKey, key]) => (ids.get(key) ? [{ sourceKey, entityId: ids.get(key)! }] : []));
                if (assignments.length) await this.unit.brainData.setSilverEntities(dataset.id, assignments);
            }
            if (page.length < PAGE) break;
        }
        const typeIds = new Set(plans.map(plan => plan.type.id));
        let links = 0;
        for (const relationship of active.filter(item => typeIds.has(item.fromTypeId) || typeIds.has(item.toTypeId))) {
            links += await this.unit.brainSemantic.linkByAttribute(workspaceId, relationship);
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

    private view(entity: BrainEntity, type: BrainEntityType, policies: Parameters<typeof evaluateAccess>[0], role: string) {
        const access = evaluateAccess(policies, role, BRAIN_POLICY_RESOURCES.entityType, type.id);
        // Restricted attributes are hidden from everyone below administrator unless a policy says otherwise.
        const restricted = role === "owner" || role === "admin" || role === "system" ? [] : type.attributes.filter(attribute => attribute.classification === BRAIN_CLASSIFICATIONS.restricted).map(attribute => attribute.key);
        return {
            id: entity.id, entityType: type.key, canonicalKey: entity.canonicalKey, displayName: entity.displayName,
            attributes: maskRecord(entity.attributes, [...access.maskedFields, ...restricted]),
            sources: entity.sourceRefs.length, confidence: entity.confidence, status: entity.status, updatedAt: entity.updatedAt,
        };
    }
}
