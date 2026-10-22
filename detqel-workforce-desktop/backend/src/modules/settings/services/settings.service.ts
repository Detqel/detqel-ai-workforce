import { AUTHORIZATION_HEADER, BEARER_AUTHORIZATION_PREFIX } from "../../../constants/authConstants.js";
import { AI_PROVIDER_IDS, ANTHROPIC_API_VERSION, ANTHROPIC_HEADERS, ANTHROPIC_MAX_OUTPUT_TOKENS, LOCAL_OLLAMA_CHAT_URL, MODEL_DISCOVERY_TIMEOUT_MS, PROMPT_EXECUTION_TIMEOUT_MS, PROVIDER_ERROR_PREVIEW_LENGTH } from "../../../constants/settingsConstants.js";
import type {
  ISettingsRepository,
  AIProvider,
  AIProviderModel,
  VyraSettings,
} from "../repositories/settings.repository.js";
import { env } from "../../../config/env.js";

export class SettingsService {
  constructor(private readonly repository: ISettingsRepository) {}

  async listProviders(): Promise<AIProvider[]> {
    return this.repository.listProviders();
  }

  async getProviderById(id: string): Promise<AIProvider | null> {
    return this.repository.getProviderById(id);
  }

  async updateProvider(id: string, updates: Partial<AIProvider>): Promise<AIProvider | null> {
    return this.repository.updateProvider(id, updates);
  }

  async getProviderModels(providerId: string, apiKey?: string): Promise<AIProviderModel[]> {
    const provider = await this.repository.getProviderById(providerId);
    const keyToUse = apiKey?.trim() ? apiKey.trim() : provider?.apiKey?.trim();

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

  async testConnection(providerId: string, apiKey?: string, modelId?: string): Promise<{
    success: boolean;
    status: string;
    message: string;
    latencyMs: number;
    providerId: string;
    modelId?: string;
  }> {
    const provider = await this.repository.getProviderById(providerId);
    const keyToTest = apiKey?.trim() ? apiKey.trim() : provider?.apiKey?.trim();

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
          apiKey: keyToTest,
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

  async getVyraSettings(workspaceId?: string): Promise<VyraSettings> {
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
    return settings;
  }

  async updateVyraSettings(workspaceId: string | undefined, updates: Partial<VyraSettings>): Promise<VyraSettings> {
    return this.repository.upsertVyraSettings({
      ...updates,
      workspaceId,
    });
  }

  async testPrompt(params: {
    prompt: string;
    providerId?: string;
    modelId?: string;
    apiKey?: string;
    mode?: "chat" | "structured";
    systemPrompt?: string;
  }): Promise<{
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
    const keyToUse = params.apiKey?.trim() || provider?.apiKey?.trim();
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
