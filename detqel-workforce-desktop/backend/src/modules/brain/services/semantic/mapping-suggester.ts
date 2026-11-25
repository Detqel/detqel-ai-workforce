import { BRAIN_FIELD_SYNONYMS, BRAIN_LIMITS, BRAIN_MAPPING_TRANSFORMS, type BrainMappingTransform } from "../../../../constants/brainConstants.js";
import type { BrainEntityType, BrainSchemaField } from "../../../../shared/types/entities.js";
import { round } from "../brain-types.js";

export interface MappingSuggestion {
    readonly sourceField: string;
    readonly entityTypeId: string;
    readonly entityTypeKey: string;
    readonly attributeKey: string;
    readonly confidence: number;
    readonly transform: BrainMappingTransform;
    /** True when a different target scored within the ambiguity margin; such a mapping always needs review. */
    readonly ambiguous: boolean;
    readonly evidence: { readonly nameScore: number; readonly typeScore: number; readonly alternatives: Array<{ target: string; confidence: number }> };
}

const MINIMUM_CONFIDENCE = 0.5;

function words(name: string): string[] {
    return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** Canonical vocabulary: each word maps to its synonym group, so "client_ref" and "customerId" compare equal. */
const CANONICAL = new Map<string, string>(Object.entries(BRAIN_FIELD_SYNONYMS).flatMap(([root, synonyms]) => [[root, root], ...synonyms.map(word => [word, root] as [string, string])]));
const canonical = (word: string) => CANONICAL.get(word) ?? word;

function levenshteinRatio(a: string, b: string): number {
    if (!a.length && !b.length) return 1;
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = previous[j];
            previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
            diagonal = above;
        }
    }
    return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/** Name similarity from canonical word overlap and edit distance; the entity name in the field is a small bonus. */
/** Synonym-only matches are evidence, not proof, so they score below literal matches and go to review. */
const SYNONYM_WEIGHT = 0.75;

const jaccard = (a: ReadonlySet<string>, b: ReadonlySet<string>) => {
    const union = new Set([...a, ...b]).size;
    return union ? [...a].filter(word => b.has(word)).length / union : 0;
};

export function nameScore(sourceField: string, attributeKey: string, attributeName: string, entityKey: string): number {
    const entityWords = new Set(words(entityKey));
    // "account_id" mapped to Account.accountId: the entity's own name is context on both sides, not the attribute.
    const strip = (list: string[]) => { const kept = list.filter(word => !entityWords.has(word)); return kept.length ? kept : list; };
    const field = strip(words(sourceField));
    const target = strip([...words(attributeKey), ...words(attributeName)]);
    const literal = jaccard(new Set(field), new Set(target));
    const synonym = jaccard(new Set(field.map(canonical)), new Set(target.map(canonical))) * SYNONYM_WEIGHT;
    const edit = levenshteinRatio(field.join(""), strip(words(attributeKey)).join("")) * 0.9;
    const entityBonus = words(sourceField).some(word => entityWords.has(word)) ? 0.1 : 0;
    return Math.min(1, Math.max(literal, synonym, edit) + entityBonus);
}

/** How well a source type can hold the attribute's type. */
export function typeScore(sourceType: string, targetType: string): number {
    if (sourceType === targetType) return 1;
    const numeric = new Set(["integer", "number"]);
    const temporal = new Set(["date", "datetime"]);
    if (numeric.has(sourceType) && numeric.has(targetType)) return 0.9;
    if (temporal.has(sourceType) && temporal.has(targetType)) return 0.9;
    if (targetType === "string") return 0.7;
    return 0.2;
}

function transformFor(sourceType: string, targetType: string, attributeKey: string): BrainMappingTransform {
    if (/email/i.test(attributeKey)) return BRAIN_MAPPING_TRANSFORMS.lowercase;
    if ((targetType === "number" || targetType === "integer") && sourceType === "string") return BRAIN_MAPPING_TRANSFORMS.number;
    if ((targetType === "date" || targetType === "datetime") && sourceType === "string") return BRAIN_MAPPING_TRANSFORMS.date;
    return sourceType === "string" ? BRAIN_MAPPING_TRANSFORMS.trim : BRAIN_MAPPING_TRANSFORMS.identity;
}

/**
 * Deterministic source-to-canonical mapping proposals (FR-BRAIN-002). Each source field gets its best target if
 * the score clears the floor. Confidence blends name (70%) and type (30%) similarity. Proposals never approve
 * themselves here; the ontology service decides which can be approved automatically and which need review.
 */
export function suggestMappings(fields: ReadonlyArray<BrainSchemaField>, entityTypes: ReadonlyArray<BrainEntityType>): MappingSuggestion[] {
    const suggestions: MappingSuggestion[] = [];
    for (const field of fields) {
        const candidates = entityTypes.flatMap(entityType => entityType.attributes.map(attribute => {
            const name = nameScore(field.name, attribute.key, attribute.name, entityType.key);
            const type = typeScore(field.type, attribute.type);
            return {
                entityType, attribute,
                name: round(name, 3), type: round(type, 3),
                confidence: round(0.7 * name + 0.3 * type, 2),
            };
        })).sort((a, b) => b.confidence - a.confidence);
        const [best, ...rest] = candidates;
        if (!best || best.confidence < MINIMUM_CONFIDENCE) continue;
        const runnerUp = rest[0];
        suggestions.push({
            sourceField: field.name,
            entityTypeId: best.entityType.id,
            entityTypeKey: best.entityType.key,
            attributeKey: best.attribute.key,
            confidence: best.confidence,
            transform: transformFor(field.type, best.attribute.type, best.attribute.key),
            ambiguous: Boolean(runnerUp && best.confidence - runnerUp.confidence < BRAIN_LIMITS.mappingAmbiguityMargin),
            evidence: {
                nameScore: best.name, typeScore: best.type,
                alternatives: rest.slice(0, 3).map(item => ({ target: `${item.entityType.key}.${item.attribute.key}`, confidence: item.confidence })),
            },
        });
    }
    return suggestions;
}

/** Applies a mapping transform to a Silver value before it becomes a canonical attribute. */
export function applyTransform(value: unknown, transform: string): unknown {
    if (value === null || value === undefined) return null;
    switch (transform) {
        case BRAIN_MAPPING_TRANSFORMS.trim: return String(value).trim();
        case BRAIN_MAPPING_TRANSFORMS.lowercase: return String(value).trim().toLowerCase();
        case BRAIN_MAPPING_TRANSFORMS.uppercase: return String(value).trim().toUpperCase();
        case BRAIN_MAPPING_TRANSFORMS.number: { const number = Number(value); return Number.isFinite(number) ? number : null; }
        case BRAIN_MAPPING_TRANSFORMS.date: { const time = Date.parse(String(value)); return Number.isNaN(time) ? null : new Date(time).toISOString(); }
        default: return value;
    }
}
