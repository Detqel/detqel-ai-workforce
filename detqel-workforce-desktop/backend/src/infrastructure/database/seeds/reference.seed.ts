import type { DatabaseSession } from "../connection.js";
import { industryDomains } from "../schema/domains.js";
import { connectorTypes } from "../schema/connector-types.js";
import { connectorCatalog } from "../schema/connector-catalog.js";
import { INITIAL_CONNECTOR_CATALOG } from "./connector-catalog.seed.js";
export const INITIAL_CONNECTOR_TYPES = [
    { code: "data", name: "Data", description: "Databases, APIs, files, and data sources", sortOrder: 0 },
    { code: "mcp", name: "MCP", description: "Model Context Protocol servers and tools", sortOrder: 1 },
    { code: "environment", name: "Environment", description: "Runtime environments and infrastructure", sortOrder: 2 },
    { code: "enterprise", name: "Enterprise", description: "Business applications and enterprise services", sortOrder: 3 },
];
export const INITIAL_DOMAINS = ["Retail & E-Commerce", "Technology & SaaS", "Finance & Banking", "Healthcare & Pharma", "Logistics & Supply Chain", "Manufacturing", "Agency & Professional Services"];
export async function seedReferenceData(database: DatabaseSession): Promise<void> {
    await database.transaction(async (tx) => {
        await tx.insert(connectorTypes).values(INITIAL_CONNECTOR_TYPES).onConflictDoNothing({ target: connectorTypes.code });
        await tx.insert(connectorCatalog).values(INITIAL_CONNECTOR_CATALOG).onConflictDoNothing({ target: connectorCatalog.code });
        await tx.insert(industryDomains).values(INITIAL_DOMAINS.map(name => ({ name, isCustom: false }))).onConflictDoNothing({ target: industryDomains.name });
    });
}
