import type { AIProvider, NewAIProvider, VyraSettings, NewVyraSettings, AIProviderModel } from "../../../infrastructure/database/schema/settings.js";
export type { AIProvider, NewAIProvider, VyraSettings, NewVyraSettings, AIProviderModel };
export interface ISettingsRepository {
  listProviders(): Promise<AIProvider[]>;
  getProviderById(id: string): Promise<AIProvider | null>;
  upsertProvider(provider: NewAIProvider): Promise<AIProvider>;
  updateProvider(id: string, updates: Partial<AIProvider>): Promise<AIProvider | null>;
  /** Settings belong to exactly one workspace; another workspace's row is never returned. */
  getVyraSettings(workspaceId: string): Promise<VyraSettings | null>;
  listAllVyraSettings(): Promise<VyraSettings[]>;
  upsertVyraSettings(settings: Partial<NewVyraSettings> & { workspaceId: string }): Promise<VyraSettings>;
  updateVyraSettingsById(id: string, updates: Partial<NewVyraSettings>): Promise<VyraSettings | null>;
}
