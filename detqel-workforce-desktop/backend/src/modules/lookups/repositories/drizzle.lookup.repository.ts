import { LOOKUP_RESOURCES } from "../../../constants/lookupConstants.js";
import { asc } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { BaseRepository } from "../../../infrastructure/database/repositories/base.repository.js";
import { connectorTypes } from "../../../infrastructure/database/schema/connector-types.js";
import type { LookupValue, NewLookupValue } from "../../../shared/types/lookups.js";
import type { ILookupRepository } from "./lookup.repository.js";

type LookupTable = PgTable & { id: PgColumn; name: PgColumn; sortOrder: PgColumn };

class LookupTableRepository extends BaseRepository<LookupTable, LookupValue, NewLookupValue> {
    async findMany(): Promise<LookupValue[]> {
        return await this.database.select().from(this.table as PgTable)
            .orderBy(asc(this.table.sortOrder), asc(this.table.name)) as LookupValue[];
    }
}

export class LookupRepository implements ILookupRepository {
    private readonly resources: Record<string, LookupTableRepository>;

    constructor(database: DatabaseSession) {
        // Register lookup tables here; all use the same validated CRUD routes.
        this.resources = {
            [LOOKUP_RESOURCES.connectorTypes]: new LookupTableRepository(connectorTypes, database),
        };
    }

    get(resource: string): LookupTableRepository | null {
        return Object.hasOwn(this.resources, resource) ? this.resources[resource] : null;
    }
}
