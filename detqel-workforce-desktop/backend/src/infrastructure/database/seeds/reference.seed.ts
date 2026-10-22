import { INITIAL_CONNECTOR_TYPES, INITIAL_DOMAINS } from "../../../constants/databaseSeedConstants.js";
export { INITIAL_CONNECTOR_TYPES, INITIAL_DOMAINS } from "../../../constants/databaseSeedConstants.js";
import type { DatabaseSession } from "../connection.js";
import { industryDomains } from "../schema/domains.js";
import { connectorTypes } from "../schema/connector-types.js";
import { connectorCatalog } from "../schema/connector-catalog.js";
import { INITIAL_CONNECTOR_CATALOG } from "./connector-catalog.seed.js";
export async function seedReferenceData(database: DatabaseSession): Promise<void> {
    await database.transaction(async (tx) => {
        await tx.insert(connectorTypes).values(INITIAL_CONNECTOR_TYPES).onConflictDoNothing({ target: connectorTypes.code });
        await tx.insert(connectorCatalog).values(INITIAL_CONNECTOR_CATALOG).onConflictDoNothing({ target: connectorCatalog.code });
        await tx.insert(industryDomains).values(INITIAL_DOMAINS.map(name => ({ name, isCustom: false }))).onConflictDoNothing({ target: industryDomains.name });
    });
}
