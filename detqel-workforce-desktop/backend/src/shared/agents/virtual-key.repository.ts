import type { LitellmVirtualKey, NewLitellmVirtualKey } from "../../infrastructure/database/schema/agent-runtime.js";
export type { LitellmVirtualKey, NewLitellmVirtualKey };

export interface IVirtualKeyRepository {
    /** Returns every virtual key for a workspace. Keys from other workspaces are never returned. */
    listByWorkspace(workspaceId: string): Promise<LitellmVirtualKey[]>;
    findByProcess(workspaceId: string, processId: string): Promise<LitellmVirtualKey | null>;
    upsert(record: NewLitellmVirtualKey): Promise<LitellmVirtualKey>;
    deleteByProcess(workspaceId: string, processId: string): Promise<boolean>;
}
