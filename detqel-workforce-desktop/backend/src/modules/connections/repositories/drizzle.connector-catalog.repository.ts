import { and, asc, eq } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import { connectorCatalog, type ConnectorCatalog } from "../../../infrastructure/database/schema/connector-catalog.js";
import type { IConnectorCatalogRepository } from "./connector-catalog.repository.js";

export class ConnectorCatalogRepository implements IConnectorCatalogRepository {
    constructor(private readonly database: DatabaseSession) {}

    async listEnabled(connectorType?: string, category?: string): Promise<ConnectorCatalog[]> {
        const filters = [eq(connectorCatalog.isEnabled, true)];
        if (connectorType !== undefined) filters.push(eq(connectorCatalog.connectorType, connectorType));
        if (category !== undefined) filters.push(eq(connectorCatalog.category, category));
        return this.database.select().from(connectorCatalog).where(and(...filters))
            .orderBy(asc(connectorCatalog.category), asc(connectorCatalog.name));
    }

    async findById(id: string): Promise<ConnectorCatalog | null> {
        const [entry] = await this.database.select().from(connectorCatalog)
            .where(eq(connectorCatalog.id, id)).limit(1);
        return entry ?? null;
    }
}
