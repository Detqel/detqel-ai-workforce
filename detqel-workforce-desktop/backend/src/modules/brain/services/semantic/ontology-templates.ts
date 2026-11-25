import type { BrainEntityAttribute } from "../../../../shared/types/entities.js";

interface TemplateEntity { readonly key: string; readonly name: string; readonly description: string; readonly attributes: BrainEntityAttribute[] }
interface TemplateRelationship { readonly key: string; readonly name: string; readonly from: string; readonly to: string; readonly fromAttribute: string }
export interface OntologyTemplate { readonly key: string; readonly name: string; readonly description: string; readonly entities: TemplateEntity[]; readonly relationships: TemplateRelationship[] }

const attribute = (key: string, name: string, type: string, options: { identifier?: boolean; required?: boolean; classification?: string } = {}): BrainEntityAttribute => ({
    key, name, type, identifier: options.identifier ?? false, required: options.required ?? options.identifier ?? false, classification: options.classification ?? "internal",
});

/**
 * Starter ontologies for the first business domains, so a workspace gains value from one connected domain before
 * modelling everything (PRD principle "incremental adoption"). Applying a template only adds missing types.
 */
export const ONTOLOGY_TEMPLATES: ReadonlyArray<OntologyTemplate> = [
    {
        key: "sales", name: "Sales", description: "Accounts, contacts and opportunities for pipeline and revenue analysis.",
        entities: [
            { key: "Account", name: "Account", description: "A customer organisation.", attributes: [attribute("accountId", "Account ID", "string", { identifier: true }), attribute("name", "Name", "string", { required: true }), attribute("segment", "Segment", "string"), attribute("region", "Region", "string"), attribute("industry", "Industry", "string")] },
            { key: "Contact", name: "Contact", description: "A person at an account.", attributes: [attribute("contactId", "Contact ID", "string", { identifier: true }), attribute("name", "Name", "string", { classification: "confidential" }), attribute("email", "Email", "string", { classification: "confidential" }), attribute("accountId", "Account ID", "string")] },
            { key: "Opportunity", name: "Opportunity", description: "A potential deal.", attributes: [attribute("opportunityId", "Opportunity ID", "string", { identifier: true }), attribute("name", "Name", "string"), attribute("accountId", "Account ID", "string"), attribute("amount", "Amount", "number"), attribute("stage", "Stage", "string"), attribute("closeDate", "Close date", "date"), attribute("owner", "Owner", "string")] },
        ],
        relationships: [
            { key: "account_has_opportunity", name: "Account owns Opportunity", from: "Opportunity", to: "Account", fromAttribute: "accountId" },
            { key: "account_has_contact", name: "Account employs Contact", from: "Contact", to: "Account", fromAttribute: "accountId" },
        ],
    },
    {
        key: "finance", name: "Finance", description: "Invoices and payments for revenue and cash analysis.",
        entities: [
            { key: "Customer", name: "Customer", description: "A billed customer.", attributes: [attribute("customerId", "Customer ID", "string", { identifier: true }), attribute("name", "Name", "string", { required: true }), attribute("country", "Country", "string")] },
            { key: "Invoice", name: "Invoice", description: "A bill issued to a customer.", attributes: [attribute("invoiceId", "Invoice ID", "string", { identifier: true }), attribute("customerId", "Customer ID", "string"), attribute("amount", "Amount", "number"), attribute("currency", "Currency", "string"), attribute("issuedAt", "Issued at", "date"), attribute("status", "Status", "string")] },
            { key: "Payment", name: "Payment", description: "Money received against an invoice.", attributes: [attribute("paymentId", "Payment ID", "string", { identifier: true }), attribute("invoiceId", "Invoice ID", "string"), attribute("amount", "Amount", "number"), attribute("paidAt", "Paid at", "date")] },
        ],
        relationships: [
            { key: "customer_has_invoice", name: "Customer receives Invoice", from: "Invoice", to: "Customer", fromAttribute: "customerId" },
            { key: "invoice_has_payment", name: "Invoice settled by Payment", from: "Payment", to: "Invoice", fromAttribute: "invoiceId" },
        ],
    },
    {
        key: "support", name: "Customer support", description: "Tickets and SLA policies for service analysis.",
        entities: [
            { key: "Ticket", name: "Ticket", description: "A support request.", attributes: [attribute("ticketId", "Ticket ID", "string", { identifier: true }), attribute("subject", "Subject", "string"), attribute("priority", "Priority", "string"), attribute("status", "Status", "string"), attribute("customerId", "Customer ID", "string"), attribute("createdAt", "Created at", "datetime"), attribute("resolvedAt", "Resolved at", "datetime")] },
            { key: "SlaPolicy", name: "SLA Policy", description: "A response or resolution commitment.", attributes: [attribute("policyId", "Policy ID", "string", { identifier: true }), attribute("name", "Name", "string"), attribute("targetHours", "Target hours", "number")] },
        ],
        relationships: [],
    },
];
