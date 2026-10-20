import type { IRepository } from "../../../shared/contracts/repository.js";
import type { Connection, NewConnection } from "../../../shared/types/entities.js";
export interface IConnectionRepository extends IRepository<Connection, NewConnection> {
    listByWorkspace(workspaceId: string): Promise<Connection[]>;
    findInWorkspace(id: string, workspaceId: string): Promise<Connection | null>;
    updateInWorkspace(id: string, workspaceId: string, data: Partial<NewConnection>): Promise<Connection | null>;
    deleteInWorkspace(id: string, workspaceId: string): Promise<boolean>;
    updateStatus(id: string, status: string, synced?: boolean): Promise<Connection | null>;
}
