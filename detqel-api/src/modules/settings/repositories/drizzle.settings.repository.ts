import { asc, desc, eq, sql } from "drizzle-orm";
import type { DatabaseSession } from "../../../infrastructure/database/connection.js";
import {
  aiProviders,
  vyraSettings,
  type AIProvider,
  type NewAIProvider,
  type VyraSettings,
  type NewVyraSettings,
} from "../../../infrastructure/database/schema/settings.js";
import type { ISettingsRepository } from "./settings.repository.js";

export class DrizzleSettingsRepository implements ISettingsRepository {
  constructor(private readonly database: DatabaseSession) {}

  async listProviders(): Promise<AIProvider[]> {
    return this.database
      .select()
      .from(aiProviders)
      .orderBy(asc(aiProviders.sortOrder), asc(aiProviders.name));
  }

  async getProviderById(id: string): Promise<AIProvider | null> {
    const results = await this.database
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, id))
      .limit(1);
    return results[0] || null;
  }

  async upsertProvider(provider: NewAIProvider): Promise<AIProvider> {
    const [saved] = await this.database
      .insert(aiProviders)
      .values(provider)
      .onConflictDoUpdate({
        target: aiProviders.id,
        set: {
          name: provider.name,
          iconKey: provider.iconKey,
          description: provider.description,
          badge: provider.badge,
          models: provider.models,
          apiKey: provider.apiKey,
          status: provider.status,
          isConnected: provider.isConnected,
          sortOrder: provider.sortOrder,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  async updateProvider(id: string, updates: Partial<AIProvider>): Promise<AIProvider | null> {
    const [updated] = await this.database
      .update(aiProviders)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(aiProviders.id, id))
      .returning();
    return updated || null;
  }

  async getVyraSettings(workspaceId?: string): Promise<VyraSettings | null> {
    if (workspaceId) {
      const results = await this.database
        .select()
        .from(vyraSettings)
        .where(eq(vyraSettings.workspaceId, workspaceId))
        .limit(1);
      if (results[0]) return results[0];
    }
    // Fall back to default global record
    const all = await this.database
      .select()
      .from(vyraSettings)
      .orderBy(desc(vyraSettings.createdAt))
      .limit(1);
    return all[0] || null;
  }

  async upsertVyraSettings(settings: Partial<NewVyraSettings> & { workspaceId?: string }): Promise<VyraSettings> {
    const existing = await this.getVyraSettings(settings.workspaceId);
    if (existing) {
      const [updated] = await this.database
        .update(vyraSettings)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(vyraSettings.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.database
      .insert(vyraSettings)
      .values({
        ...settings,
      } as NewVyraSettings)
      .returning();
    return created;
  }
}
