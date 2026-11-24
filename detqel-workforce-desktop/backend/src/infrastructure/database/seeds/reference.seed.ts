import { INITIAL_AI_PROVIDERS, INITIAL_DOMAINS } from "../../../constants/databaseSeedConstants.js";
export { INITIAL_DOMAINS } from "../../../constants/databaseSeedConstants.js";
import type { DatabaseSession } from "../connection.js";
import { industryDomains } from "../schema/domains.js";
import { aiProviders } from "../schema/settings.js";
export async function seedReferenceData(database: DatabaseSession): Promise<void> {
    await database.transaction(async (tx) => {
        await tx.insert(aiProviders).values(INITIAL_AI_PROVIDERS).onConflictDoNothing({ target: aiProviders.id });
        await tx.insert(industryDomains).values(INITIAL_DOMAINS.map(name => ({ name, isCustom: false }))).onConflictDoNothing({ target: industryDomains.name });
    });
}
