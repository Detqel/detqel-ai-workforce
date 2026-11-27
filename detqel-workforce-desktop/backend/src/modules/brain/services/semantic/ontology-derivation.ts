import { BRAIN_CLASSIFICATIONS, BRAIN_FIELD_TYPES, BRAIN_LIMITS } from "../../../../constants/brainConstants.js";
import type { BrainEntityAttribute, BrainSchemaField } from "../../../../shared/types/entities.js";
import { isPersonalField } from "../data/data-protection.js";

/**
 * Derives the workspace ontology from the synced data itself, with no manual modelling:
 * - every dataset is an instance of an entity type named after its table (or dataset), singularised, so the same
 *   kind of record from several sources (two "customers" tables, say) becomes one shared type;
 * - every field is an attribute of that type, mapped automatically; the dataset key is the identifier;
 * - relationships come from foreign keys declared in source databases and, across sources, from reference-style
 *   field names ("customer_id", "billingAccountId") that name another type with an identifier;
 * - attributes holding personal data are classified as restricted, so only administrators see them.
 * The result is deterministic: the same data always derives the same ontology.
 */

export interface DerivationDataset {
    readonly id: string;
    readonly name: string;
    readonly domain: string;
    readonly connectionId: string | null;
    readonly connectionName: string | null;
    readonly table: { readonly schema: string; readonly name: string } | null;
    readonly primaryKeyField: string | null;
    readonly schema: ReadonlyArray<BrainSchemaField>;
    readonly protectedFields: ReadonlyArray<string>;
    readonly classification: string;
}
/** A single-column foreign key declared in a source database. */
export interface SourceForeignKey {
    readonly schema: string;
    readonly table: string;
    readonly column: string;
    readonly refSchema: string;
    readonly refTable: string;
    readonly refColumn: string;
}
export interface DerivedType {
    readonly key: string;
    readonly name: string;
    readonly description: string;
    readonly domains: string[];
    readonly datasetIds: string[];
    readonly attributes: BrainEntityAttribute[];
}
export interface DerivedMapping { readonly datasetId: string; readonly sourceField: string; readonly typeKey: string; readonly attributeKey: string }
export interface DerivedRelationship {
    readonly key: string;
    readonly name: string;
    readonly description: string;
    readonly fromKey: string;
    readonly toKey: string;
    readonly fromAttribute: string;
    readonly method: "foreign_key" | "naming";
    readonly confidence: number;
    readonly evidence: Record<string, unknown>;
}
export interface DerivedOntology {
    readonly types: DerivedType[];
    readonly mappings: DerivedMapping[];
    readonly relationships: DerivedRelationship[];
}

/** Synthetic key column for composite primary keys (see the Data Layer load). */
const COMPOSITE_KEY_FIELD = "__brain_key";
const REFERENCE_SUFFIXES = new Set(["id", "key", "code", "ref", "uuid", "guid", "no", "number", "num"]);
const NUMERIC = new Set<string>([BRAIN_FIELD_TYPES.integer, BRAIN_FIELD_TYPES.number]);
const IRREGULAR: Readonly<Record<string, string>> = { people: "person", children: "child", men: "man", women: "woman", data: "data", media: "media", criteria: "criterion", analyses: "analysis", statuses: "status", addresses: "address", indices: "index", matrices: "matrix" };
const UNCHANGED = /(?:ss|us|is|news|series|species|info|metadata|data)$/;

/** "purchase_orderLines" → ["purchase", "order", "lines"]. */
export function wordsOf(name: string): string[] {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}
export function singular(word: string): string {
    if (IRREGULAR[word]) return IRREGULAR[word];
    if (word.length <= 3 || UNCHANGED.test(word)) return word;
    if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
    if (/(?:ches|shes|xes|zes|sses)$/.test(word)) return word.slice(0, -2);
    if (/s$/.test(word)) return word.slice(0, -1);
    return word;
}
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const ACRONYMS = new Set(["id", "sku", "vat", "url", "ip", "uuid", "api", "crm", "erp", "po", "sla", "kpi"]);
const titleWord = (word: string) => (ACRONYMS.has(word) ? word.toUpperCase() : capital(word));

/** "purchase_order_lines" → "PurchaseOrderLine": the last word is singularised. */
export function typeKeyOf(name: string): string {
    const words = wordsOf(name);
    if (!words.length) return "Record";
    words[words.length - 1] = singular(words[words.length - 1]);
    const key = words.map(capital).join("");
    return (/^[0-9]/.test(key) ? `T${key}` : key).slice(0, 80);
}
export const typeNameOf = (key: string) => wordsOf(key).map(titleWord).join(" ").slice(0, 255);
/** "customer_id" → "customerId". */
export function attributeKeyOf(field: string): string {
    if (field === COMPOSITE_KEY_FIELD) return "recordKey";
    const words = wordsOf(field);
    if (!words.length) return "field";
    const key = words[0] + words.slice(1).map(capital).join("");
    return (/^[0-9]/.test(key) ? `f${key}` : key).slice(0, 120);
}
export const attributeNameOf = (field: string) => (field === COMPOSITE_KEY_FIELD ? "Record key" : wordsOf(field).map(titleWord).join(" ").slice(0, 255) || field);

const typeFamily = (type: string) => (NUMERIC.has(type) ? "number" : type);
/** A reference and its target identifier can hold the same values: same family, or text on either side. */
const compatible = (left: string, right: string) => typeFamily(left) === typeFamily(right) || left === BRAIN_FIELD_TYPES.string || right === BRAIN_FIELD_TYPES.string;

const TEMPORAL = new Set<string>([BRAIN_FIELD_TYPES.date, BRAIN_FIELD_TYPES.datetime]);
/** The attribute type when sources disagree: the wider of two numbers or dates, otherwise text. */
function widen(left: string, right: string): string {
    if (left === right) return left;
    if (NUMERIC.has(left) && NUMERIC.has(right)) return BRAIN_FIELD_TYPES.number;
    if (TEMPORAL.has(left) && TEMPORAL.has(right)) return BRAIN_FIELD_TYPES.datetime;
    return BRAIN_FIELD_TYPES.string;
}

/** The type a reference-style field names: "billing_customer_id" tries BillingCustomer, then Customer. */
export function referencedTypeKey(field: string, known: ReadonlySet<string>, self: string): string | null {
    const words = wordsOf(field);
    if (words.length < 2 || !REFERENCE_SUFFIXES.has(words[words.length - 1])) return null;
    const stem = words.slice(0, -1);
    for (let start = 0; start < stem.length; start++) {
        const key = typeKeyOf(stem.slice(start).join("_"));
        if (key !== self && known.has(key)) return key;
    }
    return null;
}

const relationshipKey = (fromKey: string, attribute: string) => `${wordsOf(fromKey).join("_")}__${wordsOf(attribute).join("_")}`.slice(0, 80);

export function deriveOntology(datasets: ReadonlyArray<DerivationDataset>, foreignKeys: ReadonlyMap<string, ReadonlyArray<SourceForeignKey>>): DerivedOntology {
    const usable = datasets.filter(dataset => dataset.schema.length > 0);
    const typeOf = new Map(usable.map(dataset => [dataset.id, typeKeyOf(dataset.table?.name ?? dataset.name)]));
    const grouped = new Map<string, DerivationDataset[]>();
    for (const dataset of usable) grouped.set(typeOf.get(dataset.id)!, [...(grouped.get(typeOf.get(dataset.id)!) ?? []), dataset]);
    // The type limit keeps the largest groups first, so a few odd tables never crowd out the core business types.
    const keys = [...grouped.keys()].sort((a, b) => grouped.get(b)!.length - grouped.get(a)!.length || a.localeCompare(b)).slice(0, BRAIN_LIMITS.maxEntityTypes);

    const types: DerivedType[] = [];
    const mappings: DerivedMapping[] = [];
    const attributesByType = new Map<string, Map<string, BrainEntityAttribute>>();
    for (const key of keys) {
        const members = grouped.get(key)!;
        const attributes = new Map<string, BrainEntityAttribute>();
        for (const dataset of members) {
            const personal = new Set(dataset.protectedFields);
            for (const field of dataset.schema) {
                const attributeKey = attributeKeyOf(field.name);
                const existing = attributes.get(attributeKey);
                if (!existing && attributes.size >= BRAIN_LIMITS.maxAttributesPerEntity) continue;
                const restricted = personal.has(field.name) || isPersonalField(field.name);
                const identifier = field.name === dataset.primaryKeyField;
                attributes.set(attributeKey, {
                    key: attributeKey, name: attributeNameOf(field.name),
                    type: existing ? widen(existing.type, field.type) : field.type,
                    required: (existing?.required ?? true) && !field.nullable,
                    identifier: Boolean(existing?.identifier) || identifier,
                    classification: restricted || existing?.classification === BRAIN_CLASSIFICATIONS.restricted ? BRAIN_CLASSIFICATIONS.restricted : BRAIN_CLASSIFICATIONS.internal,
                });
                mappings.push({ datasetId: dataset.id, sourceField: field.name, typeKey: key, attributeKey });
            }
        }
        attributesByType.set(key, attributes);
        const sources = [...new Set(members.map(member => member.connectionName ?? "a source"))];
        const tables = members.map(member => (member.table ? `${member.table.schema}.${member.table.name}` : member.name));
        const identifiers = [...attributes.values()].filter(attribute => attribute.identifier).map(attribute => attribute.name);
        const name = typeNameOf(key);
        types.push({
            key, name,
            description: `${name} records from ${sources.join(", ")} (${tables.slice(0, 4).join(", ")}${tables.length > 4 ? `, and ${tables.length - 4} more` : ""}). `
                + (identifiers.length ? `Each one is identified by ${identifiers.join(" or ")}.` : "The source has no key, so records are not resolved into individual entities."),
            domains: [...new Set(members.map(member => member.domain))].sort(),
            datasetIds: members.map(member => member.id),
            attributes: [...attributes.values()],
        });
    }

    const known = new Set(keys);
    const relationships = new Map<string, DerivedRelationship>();
    const identifierOf = (key: string) => [...(attributesByType.get(key)?.values() ?? [])].find(attribute => attribute.identifier) ?? null;
    for (const dataset of usable) {
        const fromKey = typeOf.get(dataset.id)!;
        if (!known.has(fromKey)) continue;
        const declared = new Map((foreignKeys.get(dataset.connectionId ?? "") ?? [])
            .filter(item => dataset.table && item.schema === dataset.table.schema && item.table === dataset.table.name)
            .map(item => [item.column, item]));
        for (const field of dataset.schema) {
            if (field.name === dataset.primaryKeyField) continue;
            const attribute = attributeKeyOf(field.name);
            const key = relationshipKey(fromKey, attribute);
            if (relationships.get(key)?.method === "foreign_key") continue;
            const foreign = declared.get(field.name);
            const foreignTarget = foreign ? typeKeyOf(foreign.refTable) : null;
            if (foreignTarget && known.has(foreignTarget)) {
                relationships.set(key, {
                    key, fromKey, toKey: foreignTarget, fromAttribute: attribute, method: "foreign_key", confidence: 1,
                    name: `${typeNameOf(fromKey)} → ${typeNameOf(foreignTarget)}`,
                    description: `Each ${typeNameOf(fromKey)} refers to a ${typeNameOf(foreignTarget)} through ${field.name}, as declared by a foreign key in ${dataset.connectionName ?? "the source"}.`,
                    evidence: { foreignKey: `${foreign!.schema}.${foreign!.table}.${foreign!.column} → ${foreign!.refSchema}.${foreign!.refTable}.${foreign!.refColumn}` },
                });
                continue;
            }
            if (relationships.has(key)) continue;
            const target = referencedTypeKey(field.name, known, fromKey);
            const targetIdentifier = target ? identifierOf(target) : null;
            if (!target || !targetIdentifier || !compatible(field.type, targetIdentifier.type)) continue;
            relationships.set(key, {
                key, fromKey, toKey: target, fromAttribute: attribute, method: "naming", confidence: 0.8,
                name: `${typeNameOf(fromKey)} → ${typeNameOf(target)}`,
                description: `Each ${typeNameOf(fromKey)} refers to a ${typeNameOf(target)} through ${field.name}; the field name names the ${typeNameOf(target)} type.`,
                evidence: { field: field.name, dataset: dataset.name, targetIdentifier: targetIdentifier.key },
            });
        }
    }
    return { types, mappings: mappings.filter(mapping => known.has(mapping.typeKey)), relationships: [...relationships.values()] };
}
