import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { attributeKeyOf, deriveOntology, referencedTypeKey, singular, typeKeyOf, type DerivationDataset } from "../../src/modules/brain/services/semantic/ontology-derivation.js";
import { displayAttributeOf } from "../../src/modules/brain/services/semantic/entity-resolution.service.js";

const field = (name: string, type = "string", nullable = false) => ({ name, type, nullable });
const dataset = (overrides: Partial<DerivationDataset> & Pick<DerivationDataset, "id" | "name" | "schema">): DerivationDataset => ({
    domain: "Sales", connectionId: "c1", connectionName: "ERP", table: null, primaryKeyField: "id", protectedFields: [], classification: "confidential", ...overrides,
});

describe("ontology naming", () => {
    test("tables become singular entity types and fields become camel-case attributes", () => {
        assert.equal(typeKeyOf("purchase_order_lines"), "PurchaseOrderLine");
        assert.equal(typeKeyOf("Categories"), "Category");
        assert.equal(typeKeyOf("addresses"), "Address");
        assert.equal(typeKeyOf("people"), "Person");
        assert.equal(typeKeyOf("status"), "Status");
        assert.equal(singular("boxes"), "box");
        assert.equal(attributeKeyOf("customer_id"), "customerId");
        assert.equal(attributeKeyOf("__brain_key"), "recordKey");
    });
    test("reference-style fields name the type they point at, trying the longest prefix first", () => {
        const known = new Set(["Customer", "BillingAccount", "Order"]);
        assert.equal(referencedTypeKey("customer_id", known, "Order"), "Customer");
        assert.equal(referencedTypeKey("billing_customer_id", known, "Order"), "Customer");
        assert.equal(referencedTypeKey("billingAccountId", known, "Order"), "BillingAccount");
        assert.equal(referencedTypeKey("order_id", known, "Order"), null, "a type never references itself by name");
        assert.equal(referencedTypeKey("customer", known, "Order"), null, "a field without a reference suffix is not a reference");
        assert.equal(referencedTypeKey("region_code", known, "Order"), null);
    });
});

describe("deriving the ontology from data", () => {
    const customers = dataset({ id: "d1", name: "Customers", table: { schema: "sales", name: "customers" }, schema: [field("id", "integer"), field("company"), field("email"), field("region")], protectedFields: ["email"] });
    const orders = dataset({ id: "d2", name: "Orders", table: { schema: "sales", name: "orders" }, schema: [field("id", "integer"), field("customer_id", "integer"), field("amount", "number"), field("order_date", "date")] });
    const crmCustomers = dataset({ id: "d3", name: "Customers", domain: "Marketing", connectionId: "c2", connectionName: "CRM", schema: [field("id", "integer"), field("company"), field("segment", "string", true)] });
    const tickets = dataset({ id: "d4", name: "Tickets", connectionId: "c2", connectionName: "CRM", schema: [field("ticket_no"), field("customer_id")], primaryKeyField: "ticket_no" });

    test("each table is a type, every field is mapped, and the key is the identifier", () => {
        const ontology = deriveOntology([customers, orders], new Map());
        assert.deepEqual(ontology.types.map(type => type.key).sort(), ["Customer", "Order"]);
        const customer = ontology.types.find(type => type.key === "Customer")!;
        assert.deepEqual(customer.attributes.filter(attribute => attribute.identifier).map(attribute => attribute.key), ["id"]);
        assert.equal(ontology.mappings.length, 8);
        assert.ok(customer.description.includes("ERP") && customer.description.includes("sales.customers"));
    });

    test("personal data is classified as restricted", () => {
        const customer = deriveOntology([customers], new Map()).types[0];
        assert.equal(customer.attributes.find(attribute => attribute.key === "email")!.classification, "restricted");
        assert.equal(customer.attributes.find(attribute => attribute.key === "company")!.classification, "internal");
    });

    test("the same kind of record from two sources becomes one shared type", () => {
        const ontology = deriveOntology([customers, crmCustomers, orders], new Map());
        const customer = ontology.types.find(type => type.key === "Customer")!;
        assert.deepEqual(customer.datasetIds.sort(), ["d1", "d3"]);
        assert.deepEqual(customer.domains, ["Marketing", "Sales"]);
        assert.ok(customer.attributes.some(attribute => attribute.key === "segment"), "attributes are the union of both sources");
        assert.equal(customer.attributes.find(attribute => attribute.key === "segment")!.required, false);
    });

    test("relationships come from declared foreign keys first, and from field names across sources", () => {
        const foreignKeys = new Map([["c1", [{ schema: "sales", table: "orders", column: "customer_id", refSchema: "sales", refTable: "customers", refColumn: "id" }]]]);
        const ontology = deriveOntology([customers, orders, tickets], foreignKeys);
        const byFrom = Object.fromEntries(ontology.relationships.map(relationship => [relationship.fromKey, relationship]));
        assert.equal(byFrom.Order.toKey, "Customer");
        assert.equal(byFrom.Order.method, "foreign_key");
        assert.equal(byFrom.Order.confidence, 1);
        assert.equal(byFrom.Ticket.toKey, "Customer", "a CRM ticket links to the ERP customer through its customer_id");
        assert.equal(byFrom.Ticket.method, "naming");
        assert.equal(ontology.relationships.length, 2);
    });

    test("a name match needs an identifier on the target and compatible value types", () => {
        const keyless = dataset({ id: "d5", name: "Customers", schema: [field("company")], primaryKeyField: null });
        assert.equal(deriveOntology([keyless, orders], new Map()).relationships.length, 0);
        const flags = dataset({ id: "d6", name: "Orders", schema: [field("id", "integer"), field("customer_id", "boolean")] });
        assert.equal(deriveOntology([customers, flags], new Map()).relationships.length, 0);
    });

    test("datasets without a known schema do not shape the ontology, and the result is deterministic", () => {
        const empty = dataset({ id: "d7", name: "Pending", schema: [] });
        const first = deriveOntology([orders, customers, empty], new Map());
        const second = deriveOntology([customers, empty, orders], new Map());
        assert.equal(first.types.some(type => type.key === "Pending"), false);
        assert.deepEqual(first.types.map(type => type.key).sort(), second.types.map(type => type.key).sort());
        assert.deepEqual(first.relationships, second.relationships);
    });

    test("entities are named by a business name field, never by restricted personal data", () => {
        const [customer] = deriveOntology([customers], new Map()).types;
        assert.equal(displayAttributeOf(customer), "company");
        const people = deriveOntology([dataset({ id: "d8", name: "contacts", schema: [field("id"), field("full_name"), field("title")], protectedFields: ["full_name"] })], new Map()).types[0];
        assert.equal(displayAttributeOf(people), "title");
    });
});
