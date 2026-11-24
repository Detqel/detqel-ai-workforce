import type { ConnectionDefinition, NewConnectionDefinition } from "../../../shared/types/entities.js";

export interface IConnectionDefinitionRepository {
    findInWorkspace(id: string, workspaceId: string): Promise<ConnectionDefinition | null>;
    createDiscovered(input: NewConnectionDefinition): Promise<ConnectionDefinition>;
}
