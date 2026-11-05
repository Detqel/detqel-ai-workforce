import type { AIProvider, VyraSettings } from "../repositories/settings.repository.js";

/** What clients receive. Stored credentials never leave the server; only their presence and a short hint do. */
export interface CredentialSummary {
  hasApiKey: boolean;
  /** Last characters of the saved key, or null when the key is too short to reveal any part of it. */
  apiKeyHint: string | null;
}
export type PublicAIProvider = Omit<AIProvider, "apiKey"> & CredentialSummary;
export type PublicVyraSettings = Omit<VyraSettings, "apiKey"> & CredentialSummary;
