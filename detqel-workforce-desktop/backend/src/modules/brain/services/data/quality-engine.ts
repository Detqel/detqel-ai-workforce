import {
    BRAIN_FIELD_TYPES, BRAIN_FRESHNESS_STATES, BRAIN_LIMITS, BRAIN_QUALITY_RULE_TYPES, BRAIN_QUALITY_SEVERITIES, BRAIN_REASON_CODES,
    type BrainFreshnessState,
} from "../../../../constants/brainConstants.js";
import type { BrainDataset, BrainQualityRule, BrainReason, BrainSchemaField } from "../../../../shared/types/entities.js";
import { hashOf } from "../brain-types.js";

export interface NormalizedRecord {
    readonly data: Record<string, unknown>;
    /** Fields whose value could not be converted to the schema type. */
    readonly typeErrors: BrainReason[];
}
export interface QualityOutcome {
    readonly errors: BrainReason[];
    readonly warnings: BrainReason[];
}

const MAX_CHECKED_TEXT = 2_000;

/** Rejects patterns with nested quantifiers, the usual cause of catastrophic regex backtracking. */
export function isSafePattern(pattern: string): boolean {
    if (pattern.length > 200) return false;
    if (/\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)\s*[+*{]/.test(pattern)) return false;
    if (/(\\[dws]|\.|\[[^\]]*\])[+*]\s*\1[+*]/.test(pattern)) return false;
    try { new RegExp(pattern); return true; } catch { return false; }
}

function toIsoDate(value: unknown): string | null {
    const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
}
function toIsoDateTime(value: unknown): string | null {
    const time = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Converts one value to the schema type. Returns undefined when conversion is impossible. */
function convert(value: unknown, type: string): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    switch (type) {
        case BRAIN_FIELD_TYPES.integer: {
            const number = typeof value === "number" ? value : Number(String(value).trim());
            return Number.isFinite(number) && Number.isInteger(number) ? number : undefined;
        }
        case BRAIN_FIELD_TYPES.number: {
            const number = typeof value === "number" ? value : Number(String(value).trim());
            return Number.isFinite(number) ? number : undefined;
        }
        case BRAIN_FIELD_TYPES.boolean:
            if (typeof value === "boolean") return value;
            if (/^(true|1|yes)$/i.test(String(value).trim())) return true;
            if (/^(false|0|no)$/i.test(String(value).trim())) return false;
            return undefined;
        case BRAIN_FIELD_TYPES.date: return toIsoDate(value) ?? undefined;
        case BRAIN_FIELD_TYPES.datetime: return toIsoDateTime(value) ?? undefined;
        case BRAIN_FIELD_TYPES.json: return typeof value === "object" ? value : undefined;
        default: return typeof value === "object" ? JSON.stringify(value) : String(value).trim();
    }
}

/** Silver normalization: trims text, converts values to their schema types, and records what could not convert. */
export function normalizeRecord(record: Record<string, unknown>, schema: ReadonlyArray<BrainSchemaField>): NormalizedRecord {
    const types = new Map(schema.map(field => [field.name, field.type]));
    const data: Record<string, unknown> = {};
    const typeErrors: BrainReason[] = [];
    for (const [name, value] of Object.entries(record)) {
        const type = types.get(name);
        if (!type) continue;
        const converted = convert(value, type);
        if (converted === undefined) {
            typeErrors.push({ code: BRAIN_REASON_CODES.typeMismatch, field: name, message: `"${name}" is not a valid ${type}.` });
            data[name] = null;
        } else data[name] = converted;
    }
    return { data, typeErrors };
}

const isMissing = (value: unknown) => value === null || value === undefined || value === "";
const comparable = (value: unknown) => (typeof value === "number" ? value : String(value));

/** Applies one configured rule to a normalized record. Batch rules (unique, referential) run in the pipeline. */
function checkRule(rule: BrainQualityRule, data: Record<string, unknown>): BrainReason | null {
    const value = data[rule.field];
    const config = rule.config as Record<string, unknown>;
    const reason = (code: string, message: string): BrainReason => ({ code, field: rule.field, ruleId: rule.id, message });
    switch (rule.ruleType) {
        case BRAIN_QUALITY_RULE_TYPES.required:
            return isMissing(value) ? reason(BRAIN_REASON_CODES.requiredMissing, `"${rule.field}" is required.`) : null;
        case BRAIN_QUALITY_RULE_TYPES.type: {
            if (isMissing(value)) return null;
            const expected = String(config.type ?? "");
            return convert(value, expected) === undefined ? reason(BRAIN_REASON_CODES.typeMismatch, `"${rule.field}" must be a ${expected}.`) : null;
        }
        case BRAIN_QUALITY_RULE_TYPES.range: {
            if (isMissing(value)) return null;
            const actual = comparable(value);
            const min = config.min === undefined ? undefined : comparable(config.min);
            const max = config.max === undefined ? undefined : comparable(config.max);
            if ((min !== undefined && typeof min === typeof actual && actual < min) || (max !== undefined && typeof max === typeof actual && actual > max)) {
                return reason(BRAIN_REASON_CODES.outOfRange, `"${rule.field}" is outside the allowed range.`);
            }
            if ((min !== undefined && typeof min !== typeof actual) || (max !== undefined && typeof max !== typeof actual)) {
                return reason(BRAIN_REASON_CODES.typeMismatch, `"${rule.field}" cannot be compared with the configured range.`);
            }
            return null;
        }
        case BRAIN_QUALITY_RULE_TYPES.pattern: {
            if (isMissing(value)) return null;
            const pattern = String(config.pattern ?? "");
            if (!isSafePattern(pattern)) return null;
            return new RegExp(pattern).test(String(value).slice(0, MAX_CHECKED_TEXT)) ? null : reason(BRAIN_REASON_CODES.patternMismatch, `"${rule.field}" does not match the required format.`);
        }
        case BRAIN_QUALITY_RULE_TYPES.allowedValues: {
            if (isMissing(value)) return null;
            const allowed = Array.isArray(config.values) ? config.values.map(String) : [];
            return allowed.includes(String(value)) ? null : reason(BRAIN_REASON_CODES.valueNotAllowed, `"${rule.field}" has a value that is not allowed.`);
        }
        case BRAIN_QUALITY_RULE_TYPES.maxLength: {
            if (isMissing(value)) return null;
            return String(value).length > Number(config.max ?? Infinity) ? reason(BRAIN_REASON_CODES.tooLong, `"${rule.field}" is longer than allowed.`) : null;
        }
        default:
            return null;
    }
}

/** Runs the record-level rules. Error-severity failures quarantine the record; warnings only flag it. */
export function evaluateRecord(data: Record<string, unknown>, typeErrors: ReadonlyArray<BrainReason>, rules: ReadonlyArray<BrainQualityRule>, dataset: Pick<BrainDataset, "timeField">): QualityOutcome {
    const errors: BrainReason[] = [...typeErrors];
    const warnings: BrainReason[] = [];
    for (const rule of rules) {
        if (!rule.enabled) continue;
        const found = checkRule(rule, data);
        if (!found) continue;
        (rule.severity === BRAIN_QUALITY_SEVERITIES.warning ? warnings : errors).push(found);
    }
    if (dataset.timeField && !isMissing(data[dataset.timeField]) && Number.isNaN(Date.parse(String(data[dataset.timeField])))) {
        errors.push({ code: BRAIN_REASON_CODES.invalidTimestamp, field: dataset.timeField, message: `"${dataset.timeField}" is not a valid timestamp.` });
    }
    return { errors, warnings };
}

/**
 * The record's stable key: its primary key when the dataset has one, otherwise a hash of its content, so a
 * re-extracted identical record is recognised and never duplicated.
 */
export function sourceKeyOf(record: Record<string, unknown>, primaryKeyField: string | null): string | null {
    if (!primaryKeyField) return hashOf(record);
    const value = record[primaryKeyField];
    if (isMissing(value)) return null;
    const key = (value instanceof Date ? value.toISOString() : String(value)).trim();
    return key && key.length <= BRAIN_LIMITS.maxSourceKeyCharacters ? key : null;
}

export function recordTooLarge(record: Record<string, unknown>): boolean {
    return Buffer.byteLength(JSON.stringify(record), "utf8") > BRAIN_LIMITS.maxRecordBytes;
}

/**
 * The state of a dataset's data as users see it (FR-DATA-014): never loaded, behind schedule, past its freshness
 * SLA, last loaded only partially, or validated and current.
 */
export function freshnessState(dataset: Pick<BrainDataset, "lastSuccessAt" | "lastRunStatus" | "freshnessSlaMinutes" | "nextSyncAt" | "syncIntervalMinutes" | "status">, now = new Date()): BrainFreshnessState {
    if (!dataset.lastSuccessAt) return dataset.lastRunStatus === "partial" ? BRAIN_FRESHNESS_STATES.partial : BRAIN_FRESHNESS_STATES.missing;
    const ageMinutes = (now.getTime() - dataset.lastSuccessAt.getTime()) / 60_000;
    if (ageMinutes > dataset.freshnessSlaMinutes) return BRAIN_FRESHNESS_STATES.stale;
    if (dataset.lastRunStatus === "partial") return BRAIN_FRESHNESS_STATES.partial;
    const interval = dataset.syncIntervalMinutes;
    if (dataset.status === "active" && interval && dataset.nextSyncAt && now.getTime() - dataset.nextSyncAt.getTime() > interval * 60_000) return BRAIN_FRESHNESS_STATES.delayed;
    return BRAIN_FRESHNESS_STATES.validated;
}
