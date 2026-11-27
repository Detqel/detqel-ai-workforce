import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateRecord, freshnessState, isSafePattern, normalizeRecord, sourceKeyOf } from "../../src/modules/brain/services/data/quality-engine.js";
import { diffSchema, isBreaking, profileSchema } from "../../src/modules/brain/services/data/schema-profiler.js";
import { parseCsv, sourceKindOf } from "../../src/modules/brain/services/data/source-extractor.js";
import { isTransient } from "../../src/modules/brain/services/data/medallion-pipeline.service.js";
import { evaluateAccess, combineAccess, maskRecord } from "../../src/modules/brain/services/semantic/access-policy.js";
import { applyTransform } from "../../src/modules/brain/services/semantic/mapping-transforms.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import type { BrainAccessPolicy, BrainQualityRule } from "../../src/shared/types/entities.js";

const rule = (overrides: Partial<BrainQualityRule>): BrainQualityRule => ({
    id: "r1", workspaceId: "w", datasetId: "d", ruleType: "required", field: "amount", config: {}, severity: "error", enabled: true, createdAt: new Date(), updatedAt: new Date(), ...overrides,
});

describe("schema profiling and drift", () => {
    test("infers the narrowest consistent types and keeps zero-padded identifiers as text", () => {
        const schema = profileSchema([
            { id: "001", amount: "12.50", count: 3, closed: "2026-01-04", at: "2026-01-04T10:00:00Z", active: "true", note: null },
            { id: "002", amount: 7, count: 4, closed: "2026-02-04", at: "2026-02-04T10:00:00Z", active: "false", note: "x" },
        ]);
        const types = Object.fromEntries(schema.map(field => [field.name, field.type]));
        assert.deepEqual(types, { active: "boolean", amount: "number", at: "datetime", closed: "date", count: "integer", id: "string", note: "string" });
        assert.equal(schema.find(field => field.name === "note")!.nullable, true);
    });

    test("a few malformed values do not change a column's type, so they can be quarantined", () => {
        const records = [...Array.from({ length: 40 }, (_, index) => ({ amount: String(index * 10) })), { amount: "abc" }];
        assert.equal(profileSchema(records)[0].type, "integer");
        const mixed = [...Array.from({ length: 10 }, () => ({ code: "12" })), ...Array.from({ length: 10 }, () => ({ code: "AB" }))];
        assert.equal(profileSchema(mixed)[0].type, "string", "no type holds a clear majority, so the column is text");
    });

    test("reports added, removed and narrowing changes, and only removals or narrowing are breaking", () => {
        const current = [{ name: "a", type: "integer", nullable: false }, { name: "b", type: "string", nullable: false }];
        const records = Array.from({ length: 25 }, (_, index) => ({ a: index + 0.5, c: "new" }));
        const { changes } = diffSchema(current, profileSchema(records), records.length);
        assert.deepEqual(changes.added, ["c"]);
        assert.deepEqual(changes.removed, ["b"]);
        assert.deepEqual(changes.changed, [{ name: "a", from: "integer", to: "number" }]);
        assert.equal(isBreaking(changes), true, "the removed field breaks consumers");
        assert.equal(isBreaking({ added: ["c"], removed: [], changed: [{ name: "a", from: "integer", to: "number" }] }), false, "widening within a family is safe");
        assert.equal(isBreaking({ added: [], removed: [], changed: [{ name: "a", from: "number", to: "string" }] }), true);
        const small = diffSchema(current, profileSchema([{ a: 1 }]), 1);
        assert.deepEqual(small.changes.removed, [], "a small batch cannot prove a field was removed");
        assert.ok(small.merged.some(field => field.name === "b" && field.nullable));
    });
});

describe("Silver normalisation and quality rules", () => {
    const schema = [{ name: "amount", type: "number", nullable: false }, { name: "closed", type: "date", nullable: false }, { name: "region", type: "string", nullable: true }];

    test("converts values to schema types and reports those that cannot convert", () => {
        const { data, typeErrors } = normalizeRecord({ amount: " 42.5 ", closed: "2026-03-01T12:00:00Z", region: "  EMEA ", extra: "dropped" }, schema);
        assert.deepEqual(data, { amount: 42.5, closed: "2026-03-01", region: "EMEA" });
        assert.equal(typeErrors.length, 0);
        const bad = normalizeRecord({ amount: "abc", closed: "nope" }, schema);
        assert.deepEqual(bad.typeErrors.map(reason => reason.code), ["type_mismatch", "type_mismatch"]);
    });

    test("error rules quarantine, warning rules only flag", () => {
        const rules = [
            rule({ ruleType: "required", field: "region" }),
            rule({ id: "r2", ruleType: "range", field: "amount", config: { min: 0, max: 100 }, severity: "warning" }),
            rule({ id: "r3", ruleType: "allowed_values", field: "region", config: { values: ["EMEA", "APAC"] } }),
        ];
        const outcome = evaluateRecord({ amount: 500, region: "LATAM" }, [], rules, { timeField: null });
        assert.deepEqual(outcome.errors.map(reason => reason.code), ["value_not_allowed"]);
        assert.deepEqual(outcome.warnings.map(reason => reason.code), ["out_of_range"]);
        assert.deepEqual(evaluateRecord({ amount: 1 }, [], rules, { timeField: null }).errors.map(reason => reason.code), ["required_missing"]);
    });

    test("unsafe regular expressions are refused", () => {
        assert.equal(isSafePattern("^[A-Z]{3}-\\d+$"), true);
        assert.equal(isSafePattern("(a+)+$"), false);
        assert.equal(isSafePattern("(\\w*)*x"), false);
        assert.equal(isSafePattern("[unclosed"), false);
    });

    test("source keys come from the primary key, or from content when there is none", () => {
        assert.equal(sourceKeyOf({ id: 7 }, "id"), "7");
        assert.equal(sourceKeyOf({ id: "  " }, "id"), null);
        assert.equal(sourceKeyOf({ b: 1, a: 2 }, null), sourceKeyOf({ a: 2, b: 1 }, null), "content keys ignore property order");
    });

    test("users can tell missing, stale, partial, delayed and validated data apart", () => {
        const base = { lastSuccessAt: null, lastRunStatus: null, freshnessSlaMinutes: 60, nextSyncAt: null, syncIntervalMinutes: 30, status: "active" };
        const now = new Date("2026-06-01T12:00:00Z");
        assert.equal(freshnessState(base, now), "missing");
        assert.equal(freshnessState({ ...base, lastRunStatus: "partial" }, now), "partial");
        assert.equal(freshnessState({ ...base, lastSuccessAt: new Date("2026-06-01T09:00:00Z") }, now), "stale");
        assert.equal(freshnessState({ ...base, lastSuccessAt: new Date("2026-06-01T11:50:00Z"), nextSyncAt: new Date("2026-06-01T11:00:00Z") }, now), "delayed");
        assert.equal(freshnessState({ ...base, lastSuccessAt: new Date("2026-06-01T11:50:00Z"), nextSyncAt: new Date("2026-06-01T12:20:00Z") }, now), "validated");
    });
});

describe("source extraction helpers", () => {
    test("CSV parsing handles quotes, escaped quotes, CRLF and caps rows", () => {
        const { rows, truncated } = parseCsv("id,name,note\r\n1,\"Acme, Inc\",\"said \"\"hi\"\"\"\r\n2,Beta,\n3,Gamma,x\n", 2);
        assert.deepEqual(rows, [{ id: "1", name: "Acme, Inc", note: "said \"hi\"" }, { id: "2", name: "Beta", note: "" }]);
        assert.equal(truncated, true);
    });

    test("only database, HTTP and file connectors can supply datasets", () => {
        assert.equal(sourceKindOf("postgres"), "database");
        assert.equal(sourceKindOf("http"), "api");
        assert.equal(sourceKindOf("filesystem.file"), "files");
        assert.equal(sourceKindOf("repository.github"), null);
        assert.equal(sourceKindOf("environment.docker"), null);
    });

    test("unreachable sources are transient, validation errors are not", () => {
        assert.equal(isTransient(new AppError(503, "down")), true);
        assert.equal(isTransient(Object.assign(new Error("connect"), { code: "ECONNREFUSED" })), true);
        assert.equal(isTransient(new AppError(400, "bad query")), false);
        assert.equal(isTransient(new AppError(403, "denied")), false);
    });
});

describe("row and column policies", () => {
    const policy = (overrides: Partial<BrainAccessPolicy>): BrainAccessPolicy => ({
        id: "p", workspaceId: "w", name: "p", role: "analyst", resourceType: "dataset", resourceId: "d1", effect: "mask", maskedFields: [], rowFilter: null, createdBy: null, createdAt: new Date(), updatedAt: new Date(), ...overrides,
    });

    test("deny wins, masks accumulate, row filters combine, and owners are unrestricted", () => {
        const policies = [
            policy({ effect: "mask", maskedFields: ["email"] }),
            policy({ effect: "row_filter", rowFilter: { field: "region", op: "eq", value: "EMEA" } }),
            policy({ role: "*", effect: "mask", maskedFields: ["phone"] }),
            policy({ resourceId: "d2", effect: "deny" }),
        ];
        const analyst = evaluateAccess(policies, "analyst", "dataset", "d1");
        assert.equal(analyst.allowed, true);
        assert.deepEqual([...analyst.maskedFields].sort(), ["email", "phone"]);
        assert.equal(analyst.rowFilters.length, 1);
        assert.equal(evaluateAccess(policies, "analyst", "dataset", "d2").allowed, false);
        assert.deepEqual(evaluateAccess(policies, "owner", "dataset", "d1"), { allowed: true, maskedFields: [], rowFilters: [] });
        assert.equal(combineAccess(analyst, evaluateAccess(policies, "analyst", "dataset", "d2")).allowed, false);
        assert.deepEqual(maskRecord({ email: "a@b.c", phone: null, name: "x" }, analyst.maskedFields), { email: "[masked]", phone: null, name: "x" });
    });
});

describe("mapping transforms", () => {
    test("transforms normalise values before they become attributes", () => {
        assert.equal(applyTransform("  A@B.COM ", "lowercase"), "a@b.com");
        assert.equal(applyTransform("12.5", "number"), 12.5);
        assert.equal(applyTransform("bad", "date"), null);
    });
});