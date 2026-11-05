import { z } from "zod";
import { SETTINGS_FIELD_LIMITS } from "../../../constants/settingsConstants.js";

// An undefined apiKey keeps the stored key, a non-empty value replaces it, and an empty string removes it.
const apiKey = z.string().max(SETTINGS_FIELD_LIMITS.apiKey);
const workspaceId = z.string().uuid();
const previewMode = z.enum(["chat", "structured"]);

export const providerIdParamsSchema = z.object({ id: z.string().trim().min(1).max(SETTINGS_FIELD_LIMITS.providerId) });
export const workspaceScopeQuerySchema = z.object({ workspaceId });
export const optionalWorkspaceScopeSchema = z.object({ workspaceId: workspaceId.optional() });

export const providerModelSchema = z.object({
  id: z.string().min(1).max(SETTINGS_FIELD_LIMITS.modelId),
  name: z.string().max(SETTINGS_FIELD_LIMITS.modelName),
  description: z.string().max(SETTINGS_FIELD_LIMITS.modelDescription).default(""),
  isDefault: z.boolean().optional(),
});

export const updateProviderSchema = z.object({
  apiKey: apiKey.optional(),
  models: z.array(providerModelSchema).max(SETTINGS_FIELD_LIMITS.models).optional(),
  status: z.string().max(SETTINGS_FIELD_LIMITS.status).optional(),
  isConnected: z.boolean().optional(),
}).strict();

export const providerModelsQuerySchema = z.object({
  provider: z.string().trim().min(1).max(SETTINGS_FIELD_LIMITS.providerId).optional(),
  workspaceId: workspaceId.optional(),
}).strict();

export const providerModelsBodySchema = z.object({ apiKey: apiKey.optional(), workspaceId: workspaceId.optional() }).strict();

export const testConnectionSchema = z.object({
  providerId: z.string().trim().min(1).max(SETTINGS_FIELD_LIMITS.providerId),
  apiKey: apiKey.optional(),
  modelId: z.string().max(SETTINGS_FIELD_LIMITS.modelId).optional(),
  workspaceId: workspaceId.optional(),
});

export const testPromptSchema = z.object({
  prompt: z.string().trim().min(1).max(SETTINGS_FIELD_LIMITS.prompt),
  providerId: z.string().trim().max(SETTINGS_FIELD_LIMITS.providerId).optional(),
  modelId: z.string().max(SETTINGS_FIELD_LIMITS.modelId).optional(),
  apiKey: apiKey.optional(),
  mode: previewMode.optional(),
  systemPrompt: z.string().max(SETTINGS_FIELD_LIMITS.prompt).optional(),
  workspaceId: workspaceId.optional(),
});

const instructionText = z.string().max(SETTINGS_FIELD_LIMITS.instruction);
const instructions = z.object({
  core: instructionText, behaviour: instructionText, knowledge: instructionText, boundaries: instructionText, responseStyle: instructionText,
});

export const updateVyraSettingsSchema = z.object({
  agentName: z.string().max(SETTINGS_FIELD_LIMITS.agentName).optional(),
  slogan: z.string().max(SETTINGS_FIELD_LIMITS.slogan).optional(),
  quote: z.string().max(SETTINGS_FIELD_LIMITS.instruction).optional(),
  selectedProviderId: z.string().max(SETTINGS_FIELD_LIMITS.providerId).optional(),
  selectedModelId: z.string().max(SETTINGS_FIELD_LIMITS.modelId).optional(),
  apiKey: apiKey.optional(),
  keyStatus: z.string().max(SETTINGS_FIELD_LIMITS.keyStatus).optional(),
  isValidKey: z.boolean().optional(),
  instructions: instructions.optional(),
  templates: z.array(z.object({
    id: z.string(), name: z.string(), description: z.string().optional(), instructions,
  })).max(SETTINGS_FIELD_LIMITS.collection).optional(),
  samplePrompts: z.array(z.object({ id: z.string(), title: z.string(), prompt: z.string() })).max(SETTINGS_FIELD_LIMITS.collection).optional(),
  traits: z.array(z.object({ title: z.string(), description: z.string(), icon: z.string() })).max(SETTINGS_FIELD_LIMITS.collection).optional(),
  previewMode: previewMode.optional(),
}).strip();

export type UpdateProviderInput = z.infer<typeof updateProviderSchema>;
export type UpdateVyraSettingsInput = z.infer<typeof updateVyraSettingsSchema>;
export type TestPromptInput = z.infer<typeof testPromptSchema>;
