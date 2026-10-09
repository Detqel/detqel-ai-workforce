import type { Connection, NewConnection } from "../../../shared/types/entities.js";
import type { IConnectionRepository } from "../../connections/repositories/connection.repository.js";
export class ConnectionService {
    constructor(private readonly repository: IConnectionRepository) { }
    listByWorkspace(workspaceId: string): Promise<Connection[]> { return this.repository.listByWorkspace(workspaceId); }
    updateStatus(id: string, status: string, synced?: boolean): Promise<Connection | null> { return this.repository.updateStatus(id, status, synced); }
    findById(id: string): Promise<Connection | null> { return this.repository.findById(id); }
    create(data: NewConnection): Promise<Connection> { return this.repository.create(data); }
    delete(id: string): Promise<boolean> { return this.repository.delete(id); }
}
