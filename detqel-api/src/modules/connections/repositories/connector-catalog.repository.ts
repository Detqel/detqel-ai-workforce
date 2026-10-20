import type { ConnectorCatalog } from "../../../shared/types/entities.js";

export interface IConnectorCatalogRepository {
    listEnabled(connectorType?: string, category?: string): Promise<ConnectorCatalog[]>;
    findById(id: string): Promise<ConnectorCatalog | null>;
}
