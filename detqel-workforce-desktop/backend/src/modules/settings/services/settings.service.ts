import { AUTHORIZATION_HEADER, BEARER_AUTHORIZATION_PREFIX } from "../../../constants/authConstants.js";
import { AI_PROVIDER_IDS, ANTHROPIC_API_VERSION, ANTHROPIC_HEADERS, ANTHROPIC_MAX_OUTPUT_TOKENS, LOCAL_OLLAMA_CHAT_URL, MODEL_DISCOVERY_TIMEOUT_MS, PROMPT_EXECUTION_TIMEOUT_MS, PROVIDER_ERROR_PREVIEW_LENGTH } from "../../../constants/settingsConstants.js";
import type {
  ISettingsRepository,
  AIProvider,
  AIProviderModel,
  VyraSettings,
} from "../repositories/settings.repository.js";
import { env } from "../../../config/env.js";
import { LEGACY_PLACEHOLDER_KEY_MARKER } from "../../../constants/settingsConstants.js";
import { SecretCipher, secretHint } from "../../../shared/security/secret-cipher.js";
import type { CredentialSummary, PublicAIProvider, PublicVyraSettings } from "./settings.types.js";
import type { TestPromptInput, UpdateProviderInput, UpdateVyraSettingsInput } from "../validation/settings.schemas.js";

const providerContext = (providerId: string) => `ai_providers:${providerId}`;
const vyraContext = (workspaceId: string | null) => `vyra_settings:${workspaceId ?? "global"}`;

export class SettingsService {
  constructor(private readonly repository: ISettingsRepository, private readonly cipher: SecretCipher) {}

  // ---- Credential protection -------------------------------------------------------------------------------

  /** Encrypts a key for storage. An empty key is stored as an empty value so "no key" stays distinguishable. */
  private protect(plaintext: string, context: string): string {
    return plaintext === "" ? "" : this.cipher.encrypt(plaintext, context);
  }

  /**
   * Reads a stored key. Values written before encryption existed are plain text and are returned as is until
   * {@link protectStoredCredentials} rewrites them. Returns null when nothing usable is stored.
   */
  private reveal(stored: string | null | undefined, context: string): string | null {
    if (!stored || stored.includes(LEGACY_PLACEHOLDER_KEY_MARKER)) return null;
    if (!SecretCipher.isEnvelope(stored)) return stored;
    try {
      return this.cipher.decrypt(stored, context);
    } catch {
      // The master key changed or the value was copied from another row. The user must enter the key again.
      return null;
    }
  }

  private summarize(stored: string | null | undefined, context: string): CredentialSummary {
    const key = this.reveal(stored, context);
    return { hasApiKey: key !== null, apiKeyHint: key === null ? null : secretHint(key) };
  }

  private publicProvider({ apiKey, ...provider }: AIProvider): PublicAIProvider {
    return { ...provider, ...this.summarize(apiKey, providerContext(provider.id)) };
  }

  private publicVyra({ apiKey, ...settings }: VyraSettings): PublicVyraSettings {
    return { ...settings, ...this.summarize(apiKey, vyraContext(settings.workspaceId)) };
  }

  /**
   * Picks the key to use for a provider: one the caller just typed, then the key saved in the workspace's VYRA
   * settings (when it targets this provider), then the key saved on the provider itself.
   */
  private async resolveApiKey(providerId: string, typed: string | undefined, workspaceId: string | undefined): Promise<string | null> {
    const supplied = typed?.trim();
    if (supplied) return supplied;
    if (workspaceId) {
      const settings = await this.repository.getVyraSettings(workspaceId);
      if (settings && settings.selectedProviderId === providerId) {
        const key = this.reveal(settings.apiKey, vyraContext(settings.workspaceId));
        if (key) return key;
      }
    }
    const provider = await this.repository.getProviderById(providerId);
    return provider ? this.reveal(provider.apiKey, providerContext(provider.id)) : null;
  }

  /**
   * Encrypts credentials that were stored as plain text before encryption existed and removes the decorative
   * placeholder key. Safe to run on every start: rows that are already protected are left alone.
   */
  async protectStoredCredentials(): Promise<{ providers: number; vyraSettings: number }> {
    let providers = 0;
    let vyraSettings = 0;
    for (const provider of await this.repository.listProviders()) {
      if (!provider.apiKey || SecretCipher.isEnvelope(provider.apiKey)) continue;
      const context = providerContext(provider.id);
      await this.repository.updateProvider(provider.id, { apiKey: this.reveal(provider.apiKey, context) === null ? null : this.protect(provider.apiKey, context) });
      providers++;
    }
    for (const settings of await this.repository.listAllVyraSettings()) {
      if (!settings.apiKey || SecretCipher.isEnvelope(settings.apiKey)) continue;
      const context = vyraContext(settings.workspaceId);
      const isPlaceholder = this.reveal(settings.apiKey, context) === null;
      await this.repository.updateVyraSettingsById(settings.id, isPlaceholder
        ? { apiKey: "", keyStatus: "", isValidKey: false }
        : { apiKey: this.protect(settings.apiKey, context) });
      vyraSettings++;
    }
    return { providers, vyraSettings };
  }

  // ---- Providers -------------------------------------------------------------------------------------------

  async listProviders(): Promise<PublicAIProvider[]> {
    return (await this.repository.listProviders()).map(provider => this.publicProvider(provider));
  }

  async updateProvider(id: string, updates: UpdateProviderInput): Promise<PublicAIProvider | null> {
    const { apiKey, ...rest } = updates;
    const changes: Partial<AIProvider> = { ...rest };
    if (apiKey !== undefined) changes.apiKey = this.protect(apiKey.trim(), providerContext(id));
    const updated = await this.repository.updateProvider(id, changes);
    return updated ? this.publicProvider(updated) : null;
  }

  async getProviderModels(providerId: string, options: { apiKey?: string; workspaceId?: string } = {}): Promise<AIProviderModel[]> {
    const provider = await this.repository.getProviderById(providerId);
    const keyToUse = await this.resolveApiKey(providerId, options.apiKey, options.workspaceId);

    if (keyToUse) {
      const liveModels = await this.fetchLiveModelsFromProvider(providerId, keyToUse);
      if (liveModels && liveModels.length > 0) {
        if (provider) {
          await this.repository.updateProvider(providerId, { models: liveModels });
        }
        return liveModels;
      }
      return [];
    }

    if (provider?.models && provider.models.length > 0) {
      return provider.models;
    }

    return [];
  }

  private async fetchLiveModelsFromProvider(
    providerId: string,
    apiKey: string
  ): Promise<AIProviderModel[] | null> {
    const pId = providerId.toLowerCase().trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), MODEL_DISCOVERY_TIMEOUT_MS);

    try {
      if (pId === AI_PROVIDER_IDS.openai) {
        const res = await fetch(env.OPENAI_MODELS_URL, {
          headers: { [AUTHORIZATION_HEADER]: `${BEARER_AUTHORIZATION_PREFIX}${apiKey}` },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        return data.data
          .map((m) => ({
            id: m.id,
            name: m.id,
            description: "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      if (pId === AI_PROVIDER_IDS.groq) {
        const res = await fetch(env.GROQ_MODELS_URL, {
          headers: { [AUTHORIZATION_HEADER]: `${BEARER_AUTHORIZATION_PREFIX}${apiKey}` },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        return data.data
          .map((m) => ({
            id: m.id,
            name: m.id,
            description: "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      if (pId === AI_PROVIDER_IDS.deepseek) {
        const res = await fetch(env.DEEPSEEK_MODELS_URL, {
          headers: { [AUTHORIZATION_HEADER]: `${BEARER_AUTHORIZATION_PREFIX}${apiKey}` },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        return data.data
          .map((m) => ({
            id: m.id,
            name: m.id,
            description: "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      if (pId === AI_PROVIDER_IDS.anthropic) {
        const res = await fetch(env.ANTHROPIC_MODELS_URL, {
          headers: {
            [ANTHROPIC_HEADERS.apiKey]: apiKey,
            [ANTHROPIC_HEADERS.version]: ANTHROPIC_API_VERSION,
          },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        return data.data
          .map((m) => ({
            id: m.id,
            name: m.display_name && m.display_name.trim() !== "" ? m.display_name : m.id,
            description: "",
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      if (pId === AI_PROVIDER_IDS.google) {
        const googleUrl = env.GOOGLE_MODELS_URL.includes("?")
          ? `${env.GOOGLE_MODELS_URL}&key=${encodeURIComponent(apiKey)}`
          : `${env.GOOGLE_MODELS_URL}?key=${encodeURIComponent(apiKey)}`;
        const res = await fetch(googleUrl, { signal: controller.signal });
        if (!res.ok) return null;
        const data = (await res.json()) as {
          models?: Array<{ name: string; displayName?: string; description?: string }>;
        };
        if (!data.models || !Array.isArray(data.models)) return null;

        return data.models
          .map((m) => {
            const cleanId = m.name.replace(/^models\//, "");
            return {
              id: cleanId,
              name: m.displayName && m.displayName.trim() !== "" ? m.displayName : cleanId,
              description: m.description ? m.description : "",
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      const genericUrl = apiKey.startsWith("http")
        ? `${apiKey.replace(/\/$/, "")}/v1/models`
        : `https://api.${pId}.com/v1/models`;

      const genericRes = await fetch(genericUrl, {
        headers: { [AUTHORIZATION_HEADER]: `${BEARER_AUTHORIZATION_PREFIX}${apiKey}` },
        signal: controller.signal,
      }).catch(() => null);

      if (genericRes && genericRes.ok) {
        const genericData = (await genericRes.json()) as { data?: Array<{ id: string }> };
        if (genericData.data && Array.isArray(genericData.data)) {
          return genericData.data
            .map((m) => ({
              id: m.id,
              name: m.id,
              description: "",
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        }
      }

      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async testConnection(providerId: string, apiKey?: string, modelId?: string, workspaceId?: string): Promise<{
    success: boolean;
    status: string;
    message: string;
    latencyMs: number;
    providerId: string;
    modelId?: string;
  }> {
    const provider = await this.repository.getProviderById(providerId);
    const keyToTest = await this.resolveApiKey(providerId, apiKey, workspaceId);

    if (!keyToTest) {
      return {
        success: false,
        status: "error",
        message: "API key is required to test connection.",
        latencyMs: 0,
        providerId,
        modelId,
      };
    }

    const start = Date.now();
    const liveModels = await this.fetchLiveModelsFromProvider(providerId, keyToTest);
    const latencyMs = Date.now() - start;

    if (liveModels && liveModels.length > 0) {
      if (provider) {
        await this.repository.updateProvider(providerId, {
          status: "connected",
          isConnected: true,
          apiKey: this.protect(keyToTest, providerContext(providerId)),
          models: liveModels,
        });
      }
      return {
        success: true,
        status: "connected",
        message: "Valid key · Connected successfully",
        latencyMs,
        providerId,
        modelId: modelId ? modelId : liveModels[0]?.id,
      };
    }

    return {
      success: false,
      status: "error",
      message: "Authentication failed. Could not fetch models from provider.",
      latencyMs,
      providerId,
      modelId,
    };
  }

  async getVyraSettings(workspaceId: string): Promise<PublicVyraSettings> {
    let settings = await this.repository.getVyraSettings(workspaceId);
    if (!settings) {
      settings = await this.repository.upsertVyraSettings({
        workspaceId,
        agentName: "VYRA",
        slogan: "CONFIGURE • ALIGN • EMPOWER",
        quote: "Your intelligent AI agent for deeper insights, smarter decisions, and seamless execution.",
        selectedProviderId: "",
        selectedModelId: "",
        apiKey: "",
        keyStatus: "",
        isValidKey: false,
        instructions: {
          core: "",
          behaviour: "",
          knowledge: "",
          boundaries: "",
          responseStyle: "",
        },
        templates: [],
        samplePrompts: [],
        traits: [],
        previewMode: "chat",
      });
    }
    return this.publicVyra(settings);
  }

  async updateVyraSettings(workspaceId: string, updates: UpdateVyraSettingsInput): Promise<PublicVyraSettings> {
    const { apiKey, ...rest } = updates;
    const changes: Partial<VyraSettings> = { ...rest };
    if (apiKey !== undefined) {
      changes.apiKey = this.protect(apiKey.trim(), vyraContext(workspaceId));
      // Connection state describes the previous key, so a new or removed key cannot inherit it.
      changes.keyStatus ??= "";
      changes.isValidKey ??= false;
    }
    return this.publicVyra(await this.repository.upsertVyraSettings({ ...changes, workspaceId }));
  }

  async testPrompt(params: TestPromptInput): Promise<{
    success: boolean;
    output: string;
    structuredOutput?: Record<string, unknown>;
    tokensUsed: number;
    latencyMs: number;
    timestamp: string;
  }> {
    const prompt = params.prompt.trim();
    const mode = params.mode || "chat";
    const startTime = Date.now();

    // Resolve provider, API key, and model
    const provider = params.providerId
      ? await this.repository.getProviderById(params.providerId)
      : null;
    const keyToUse = params.providerId
      ? await this.resolveApiKey(params.providerId, params.apiKey, params.workspaceId)
      : params.apiKey?.trim();
    const modelToUse = params.modelId?.trim() || provider?.models?.[0]?.id;
    const pId = (params.providerId || provider?.id || "").toLowerCase().trim();

    if (!pId || !keyToUse || !modelToUse) {
      return {
        success: false,
        output: "Please select an AI provider, enter a valid API key, and choose a model to test real-time agent execution.",
        tokensUsed: 0,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PROMPT_EXECUTION_TIMEOUT_MS);

    try {
      let textOutput = "";
      let tokensUsed = 0;

      if (pId === AI_PROVIDER_IDS.openai || pId === AI_PROVIDER_IDS.groq || pId === AI_PROVIDER_IDS.deepseek || pId === AI_PROVIDER_IDS.custom) {
        const endpointUrl =
          pId === AI_PROVIDER_IDS.openai
            ? env.OPENAI_CHAT_URL
            : pId === AI_PROVIDER_IDS.groq
            ? env.GROQ_CHAT_URL
            : pId === AI_PROVIDER_IDS.deepseek
            ? env.DEEPSEEK_CHAT_URL
            : keyToUse.startsWith("http")
            ? `${keyToUse.replace(/\/$/, "")}/v1/chat/completions`
            : LOCAL_OLLAMA_CHAT_URL;

        const messages: Array<{ role: string; content: string }> = [];
        if (params.systemPrompt?.trim()) {
          messages.push({ role: "system", content: params.systemPrompt.trim() });
        }
        messages.push({
          role: "user",
          content:
            mode === "structured"
              ? `${prompt}\n\nPlease respond strictly with a valid JSON object.`
              : prompt,
        });

        const res = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [AUTHORIZATION_HEADER]: `${BEARER_AUTHORIZATION_PREFIX}${keyToUse}`,
          },
          body: JSON.stringify({
            model: modelToUse,
            messages,
            ...(mode === "structured" ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Provider returned HTTP ${res.status}: ${errText.slice(0, PROVIDER_ERROR_PREVIEW_LENGTH)}`);
        }

        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };

        textOutput = data.choices?.[0]?.message?.content || "";
        tokensUsed = data.usage?.total_tokens || 0;
      } else if (pId === AI_PROVIDER_IDS.anthropic) {
        const res = await fetch(env.ANTHROPIC_MESSAGES_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [ANTHROPIC_HEADERS.apiKey]: keyToUse,
            [ANTHROPIC_HEADERS.version]: ANTHROPIC_API_VERSION,
          },
          body: JSON.stringify({
            model: modelToUse,
            max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
            ...(params.systemPrompt?.trim() ? { system: params.systemPrompt.trim() } : {}),
            messages: [
              {
                role: "user",
                content:
                  mode === "structured"
                    ? `${prompt}\n\nPlease respond strictly with a valid JSON object.`
                    : prompt,
              },
            ],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Anthropic returned HTTP ${res.status}: ${errText.slice(0, PROVIDER_ERROR_PREVIEW_LENGTH)}`);
        }

        const data = (await res.json()) as {
          content?: Array<{ text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        textOutput = data.content?.[0]?.text || "";
        tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
      } else if (pId === AI_PROVIDER_IDS.google) {
        const googleUrl = `${env.GOOGLE_GENERATE_URL}/${encodeURIComponent(modelToUse)}:generateContent?key=${encodeURIComponent(keyToUse)}`;
        const res = await fetch(googleUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(params.systemPrompt?.trim()
              ? {
                  system_instruction: {
                    parts: [{ text: params.systemPrompt.trim() }],
                  },
                }
              : {}),
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text:
                      mode === "structured"
                        ? `${prompt}\n\nPlease respond strictly with a valid JSON object.`
                        : prompt,
                  },
                ],
              },
            ],
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          throw new Error(`Google returned HTTP ${res.status}: ${errText.slice(0, PROVIDER_ERROR_PREVIEW_LENGTH)}`);
        }

        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { totalTokenCount?: number };
        };

        textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        tokensUsed = data.usageMetadata?.totalTokenCount || 0;
      } else {
        throw new Error(`Provider "${pId}" is not currently supported for real-time inference.`);
      }

      let structuredOutput: Record<string, unknown> | undefined = undefined;
      if (mode === "structured" && textOutput) {
        try {
          const jsonMatch = textOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          const rawJson = jsonMatch ? jsonMatch[1] : textOutput;
          structuredOutput = JSON.parse(rawJson);
        } catch {
          structuredOutput = { raw: textOutput };
        }
      }

      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        output: textOutput,
        structuredOutput,
        tokensUsed,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        output: `Error executing prompt: ${error?.message || "Unknown error"}`,
        tokensUsed: 0,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
