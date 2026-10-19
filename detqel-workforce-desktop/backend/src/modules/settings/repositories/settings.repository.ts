import type { AIProvider, NewAIProvider, VyraSettings, NewVyraSettings, AIProviderModel } from "../../../infrastructure/database/schema/settings.js";

export type { AIProvider, NewAIProvider, VyraSettings, NewVyraSettings, AIProviderModel };

export interface ISettingsRepository {
  listProviders(): Promise<AIProvider[]>;
  getProviderById(id: string): Promise<AIProvider | null>;
  upsertProvider(provider: NewAIProvider): Promise<AIProvider>;
  updateProvider(id: string, updates: Partial<AIProvider>): Promise<AIProvider | null>;
  getVyraSettings(workspaceId?: string): Promise<VyraSettings | null>;
  upsertVyraSettings(settings: Partial<NewVyraSettings> & { workspaceId?: string }): Promise<VyraSettings>;
}
