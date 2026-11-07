import { and, eq } from "drizzle-orm";
import type { DatabaseSession } from "../../infrastructure/database/connection.js";
import {
    litellmVirtualKeys,
    type LitellmVirtualKey,
    type NewLitellmVirtualKey,
} from "../../infrastructure/database/schema/agent-runtime.js";
import type { IVirtualKeyRepository } from "./virtual-key.repository.js";

export class VirtualKeyRepository implements IVirtualKeyRepository {
    constructor(private readonly database: DatabaseSession) {}

    async listByWorkspace(workspaceId: string): Promise<LitellmVirtualKey[]> {
        return this.database.select().from(litellmVirtualKeys).where(eq(litellmVirtualKeys.workspaceId, workspaceId));
    }

    async findByProcess(workspaceId: string, processId: string): Promise<LitellmVirtualKey | null> {
        const results = await this.database
            .select()
            .from(litellmVirtualKeys)
            .where(and(eq(litellmVirtualKeys.workspaceId, workspaceId), eq(litellmVirtualKeys.processId, processId)))
            .limit(1);
        return results[0] || null;
    }

    async upsert(record: NewLitellmVirtualKey): Promise<LitellmVirtualKey> {
        const [saved] = await this.database
            .insert(litellmVirtualKeys)
            .values(record)
            .onConflictDoUpdate({
                target: [litellmVirtualKeys.workspaceId, litellmVirtualKeys.processId],
                set: {
                    gatewayKeyId: record.gatewayKeyId,
                    modelAlias: record.modelAlias,
                    encryptedKey: record.encryptedKey,
                    configFingerprint: record.configFingerprint,
                    updatedAt: new Date(),
                },
            })
            .returning();
        return saved;
    }

    async deleteByProcess(workspaceId: string, processId: string): Promise<boolean> {
        const deleted = await this.database
            .delete(litellmVirtualKeys)
            .where(and(eq(litellmVirtualKeys.workspaceId, workspaceId), eq(litellmVirtualKeys.processId, processId)))
            .returning({ id: litellmVirtualKeys.id });
        return deleted.length > 0;
    }
}
