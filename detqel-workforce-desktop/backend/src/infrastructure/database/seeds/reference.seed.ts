import type { DatabaseSession } from "../connection.js";
import { industryDomains } from "../schema/domains.js";
export const INITIAL_DOMAINS = ["Retail & E-Commerce", "Technology & SaaS", "Finance & Banking", "Healthcare & Pharma", "Logistics & Supply Chain", "Manufacturing", "Agency & Professional Services"];
export async function seedReferenceData(database: DatabaseSession): Promise<void> {
    await database.transaction(async (tx) => {
        await tx.insert(industryDomains).values(INITIAL_DOMAINS.map(name => ({ name, isCustom: false }))).onConflictDoNothing({ target: industryDomains.name });
    });
}
