import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { BrainDataProtector, isPersonalField, isPseudonym } from "../../src/modules/brain/services/data/data-protection.js";
import { chooseKey, chooseTimeField, isSystemTable } from "../../src/modules/brain/services/data/data-source.service.js";

const key = randomBytes(32).toString("base64");
const protector = new BrainDataProtector(key);
const workspace = "5f1a9a42-7d3e-4c1b-8a60-93b7c2d4e611";
const otherWorkspace = "b7bc2723-5cdd-4c33-b8b7-260825d65030";

describe("raw record sealing", () => {
    test("a sealed record opens only with the same key and context", () => {
        const record = { id: 7, email: "ana@example.com", amount: 120.5 };
        const sealed = protector.seal(record, "bronze:d1:7");
        assert.equal(JSON.stringify(sealed).includes("ana@example.com"), false, "nothing readable is stored");
        assert.deepEqual(protector.open(sealed, "bronze:d1:7"), record);
        assert.throws(() => protector.open(sealed, "bronze:d1:8"), "a payload copied to another record fails");
        assert.throws(() => new BrainDataProtector(randomBytes(32).toString("base64")).open(sealed, "bronze:d1:7"), "another installation's key fails");
    });
    test("values stored before sealing pass through unchanged", () => {
        assert.deepEqual(protector.open({ id: 1 }, "x"), { id: 1 });
    });
});

describe("personal data pseudonymisation", () => {
    test("personal columns are recognised by name, and ordinary business columns are not", () => {
        for (const name of ["email", "customerEmail", "phone_number", "first_name", "date_of_birth", "billing_address", "postal_code", "passport_number", "ip_address"]) assert.ok(isPersonalField(name), name);
        for (const name of ["name", "amount", "city", "country", "region", "order_date", "created_at", "status", "product_name", "zipline_id"]) assert.equal(isPersonalField(name), false, name);
    });
    test("pseudonyms are stable, case-insensitive, irreversible and scoped to one workspace", () => {
        const first = protector.pseudonymise(workspace, "Ana@Example.com ");
        assert.ok(isPseudonym(first));
        assert.equal(protector.pseudonymise(workspace, "ana@example.com"), first, "equal values still match, so counts and joins work");
        assert.notEqual(protector.pseudonymise(otherWorkspace, "ana@example.com"), first, "pseudonyms cannot be correlated across workspaces");
        assert.equal(protector.pseudonymise(workspace, first), first, "a pseudonym is never pseudonymised twice");
        assert.equal(protector.pseudonymise(workspace, null), null);
    });
    test("protect replaces personal fields, detects e-mail values under other names, and keeps time fields readable", () => {
        const records = [
            { id: 1, contact: "a@x.io", first_name: "Ana", created_at: "2026-01-02", amount: 10, city: "Pune" },
            { id: 2, contact: "b@y.io", first_name: "Ben", created_at: "2026-01-03", amount: 20, city: "Oslo" },
        ];
        const batch = protector.protect(workspace, records, [], ["created_at"]);
        assert.deepEqual(batch.protectedFields, ["contact", "first_name"]);
        for (const record of batch.records) {
            assert.ok(isPseudonym(record.contact) && isPseudonym(record.first_name));
            assert.equal(typeof record.amount, "number");
        }
        assert.equal(batch.records[0].city, "Pune");
        assert.equal(batch.records[0].created_at, "2026-01-02");
        assert.equal(records[0].first_name, "Ana", "the input is not modified");
        assert.deepEqual(protector.protect(workspace, [{ id: 3, note: "x" }], ["note"], []).records[0].note === "x", false, "a field once protected stays protected");
    });
    test("fingerprints are keyed, so record contents cannot be confirmed by hashing guesses", () => {
        const fingerprint = protector.fingerprint(workspace, { id: 1 });
        assert.equal(fingerprint, protector.fingerprint(workspace, { id: 1 }));
        assert.notEqual(fingerprint, new BrainDataProtector(randomBytes(32).toString("base64")).fingerprint(workspace, { id: 1 }));
    });
});

describe("database discovery", () => {
    const column = (name: string, type: string, keyPosition = 0) => ({ name, type, keyPosition });
    test("the primary key becomes the record key; composite keys get a synthetic key", () => {
        assert.deepEqual(chooseKey([column("id", "uuid", 1), column("total", "numeric")]), { field: "id", keyType: "uuid", composite: [] });
        assert.deepEqual(chooseKey([column("order_id", "integer", 1), column("line_no", "integer", 2)]), { field: "__brain_key", keyType: "text", composite: ["order_id", "line_no"] });
        assert.deepEqual(chooseKey([column("total", "numeric")]), { field: null, keyType: null, composite: [] });
    });
    test("the time field prefers business event dates and never a birth date", () => {
        assert.equal(chooseTimeField([column("date_of_birth", "date"), column("updated_at", "timestamp with time zone"), column("order_date", "date")]), "order_date");
        assert.equal(chooseTimeField([column("date_of_birth", "date")]), null);
        assert.equal(chooseTimeField([column("name", "text")]), null);
    });
    test("migration and platform tables are not business data", () => {
        assert.ok(isSystemTable({ schema: "drizzle", name: "__drizzle_migrations" }));
        assert.ok(isSystemTable({ schema: "public", name: "_prisma_migrations" }));
        assert.equal(isSystemTable({ schema: "procurement", name: "purchase_order_lines" }), false);
    });
});
