import { BRAIN_FIELD_TYPES, BRAIN_LIMITS, type BrainFieldType } from "../../../../constants/brainConstants.js";
import type { BrainSchemaChanges, BrainSchemaField } from "../../../../shared/types/entities.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;
// Leading zeros mark identifiers such as postal codes, which must stay text.
const INTEGER = /^-?(0|[1-9]\d{0,14})$/;
const DECIMAL = /^-?(0|[1-9]\d*)\.\d+([eE][-+]?\d+)?$/;
/** A batch smaller than this cannot prove a field was removed: sparse fields are often absent from small syncs. */
const REMOVAL_EVIDENCE_RECORDS = 20;

function typeOfValue(value: unknown): BrainFieldType {
    if (typeof value === "boolean") return BRAIN_FIELD_TYPES.boolean;
    if (typeof value === "number") return Number.isInteger(value) ? BRAIN_FIELD_TYPES.integer : BRAIN_FIELD_TYPES.number;
    if (value instanceof Date) return BRAIN_FIELD_TYPES.datetime;
    if (typeof value === "object") return BRAIN_FIELD_TYPES.json;
    const text = String(value).trim();
    if (/^(true|false)$/i.test(text)) return BRAIN_FIELD_TYPES.boolean;
    if (INTEGER.test(text)) return BRAIN_FIELD_TYPES.integer;
    if (DECIMAL.test(text)) return BRAIN_FIELD_TYPES.number;
    if (ISO_DATE.test(text)) return BRAIN_FIELD_TYPES.date;
    if (ISO_DATETIME.test(text) && !Number.isNaN(Date.parse(text))) return BRAIN_FIELD_TYPES.datetime;
    return BRAIN_FIELD_TYPES.string;
}

/** The narrowest type that holds both; unrelated types widen to string. */
function widen(a: BrainFieldType, b: BrainFieldType): BrainFieldType {
    if (a === b) return a;
    const pair = new Set([a, b]);
    if (pair.has("integer") && pair.has("number")) return BRAIN_FIELD_TYPES.number;
    if (pair.has("date") && pair.has("datetime")) return BRAIN_FIELD_TYPES.datetime;
    return BRAIN_FIELD_TYPES.string;
}

const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && value.trim() === "");

/** Share of non-empty values a type must hold to be the field's type; the rest are type errors in Silver. */
const TYPE_MAJORITY = 0.95;
/** Candidate types from narrowest to widest, with the observed types each one accepts. */
const CANDIDATES: ReadonlyArray<readonly [BrainFieldType, ReadonlyArray<BrainFieldType>]> = [
    [BRAIN_FIELD_TYPES.boolean, [BRAIN_FIELD_TYPES.boolean]],
    [BRAIN_FIELD_TYPES.integer, [BRAIN_FIELD_TYPES.integer]],
    [BRAIN_FIELD_TYPES.number, [BRAIN_FIELD_TYPES.integer, BRAIN_FIELD_TYPES.number]],
    [BRAIN_FIELD_TYPES.date, [BRAIN_FIELD_TYPES.date]],
    [BRAIN_FIELD_TYPES.datetime, [BRAIN_FIELD_TYPES.date, BRAIN_FIELD_TYPES.datetime]],
    [BRAIN_FIELD_TYPES.json, [BRAIN_FIELD_TYPES.json]],
];

/**
 * Infers a schema from extracted records: field names, nullability, and the narrowest type that at least 95% of
 * the non-empty values hold. A few malformed values (an "abc" among amounts) therefore do not turn a numeric
 * column into text; they fail type validation in Silver and are quarantined with a reason code.
 */
export function profileSchema(records: ReadonlyArray<Record<string, unknown>>): BrainSchemaField[] {
    const fields = new Map<string, { counts: Map<BrainFieldType, number>; filled: number; nullable: boolean; seen: number }>();
    for (const record of records) {
        for (const [name, value] of Object.entries(record)) {
            if (!fields.has(name)) {
                if (fields.size >= BRAIN_LIMITS.maxFields) continue;
                fields.set(name, { counts: new Map(), filled: 0, nullable: false, seen: 0 });
            }
            const field = fields.get(name)!;
            field.seen++;
            if (isEmpty(value)) { field.nullable = true; continue; }
            const type = typeOfValue(value);
            field.counts.set(type, (field.counts.get(type) ?? 0) + 1);
            field.filled++;
        }
    }
    return [...fields.entries()].map(([name, field]) => {
        const chosen = field.filled ? CANDIDATES.find(([, accepted]) => accepted.reduce((total, type) => total + (field.counts.get(type) ?? 0), 0) / field.filled >= TYPE_MAJORITY)?.[0] : undefined;
        return { name, type: chosen ?? BRAIN_FIELD_TYPES.string, nullable: field.nullable || field.seen < records.length };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compares a newly observed schema with the current one. Fields missing from a small batch are carried over
 * instead of reported as removed, because incremental syncs often omit sparse fields.
 */
export function diffSchema(current: ReadonlyArray<BrainSchemaField>, observed: ReadonlyArray<BrainSchemaField>, batchSize: number): { changes: BrainSchemaChanges; merged: BrainSchemaField[] } {
    const before = new Map(current.map(field => [field.name, field]));
    const after = new Map(observed.map(field => [field.name, field]));
    const changes: BrainSchemaChanges = { added: [], removed: [], changed: [] };
    const merged = new Map<string, BrainSchemaField>();
    for (const field of observed) {
        const previous = before.get(field.name);
        if (!previous) changes.added.push(field.name);
        else if (previous.type !== field.type && widen(previous.type as BrainFieldType, field.type as BrainFieldType) !== previous.type) {
            changes.changed.push({ name: field.name, from: previous.type, to: field.type });
        }
        merged.set(field.name, previous ? { ...field, type: widen(previous.type as BrainFieldType, field.type as BrainFieldType), nullable: previous.nullable || field.nullable } : field);
    }
    for (const field of current) {
        if (after.has(field.name)) continue;
        if (batchSize >= REMOVAL_EVIDENCE_RECORDS) changes.removed.push(field.name);
        else merged.set(field.name, { ...field, nullable: true });
    }
    return { changes, merged: [...merged.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

export const hasChanges = (changes: BrainSchemaChanges) => changes.added.length + changes.removed.length + changes.changed.length > 0;
const FAMILIES: ReadonlyArray<ReadonlySet<string>> = [new Set(["integer", "number"]), new Set(["date", "datetime"])];
const sameFamily = (a: string, b: string) => FAMILIES.some(family => family.has(a) && family.has(b));

/**
 * Removed fields and type changes across families (a number becoming text) can break mappings and metrics.
 * Added fields and widening within a family (integer to number, date to datetime) cannot.
 */
export const isBreaking = (changes: BrainSchemaChanges) => changes.removed.length > 0 || changes.changed.some(change => !sameFamily(change.from, change.to));
