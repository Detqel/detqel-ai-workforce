import type { IRepository } from "../../../shared/contracts/repository.js";
import type { Connection, NewConnection } from "../../../shared/types/entities.js";
export interface IConnectionRepository extends IRepository<Connection, NewConnection> {
    listByWorkspace(workspaceId: string): Promise<Connection[]>;
    updateStatus(id: string, status: string, synced?: boolean): Promise<Connection | null>;
}
