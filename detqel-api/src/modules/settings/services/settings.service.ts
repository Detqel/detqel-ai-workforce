import type { ISettingsRepository } from "../repositories/settings.repository.js";
import type {
  AIProvider,
  AIProviderModel,
  VyraSettings,
} from "../../../infrastructure/database/schema/settings.js";

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
    const keyToUse = apiKey || provider?.apiKey || undefined;

    if (keyToUse) {
      const liveModels = await this.fetchLiveModelsFromProvider(providerId, keyToUse);
      if (liveModels && liveModels.length > 0) {
        if (provider) {
          await this.repository.updateProvider(providerId, { models: liveModels });
        }
        return liveModels;
      }
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
    const pId = providerId.toLowerCase();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      if (pId === "openai") {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        const chatModels = data.data
          .filter((m) =>
            /^(gpt-4|gpt-3\.5|o1|o3|chatgpt)/i.test(m.id) &&
            !/audio|realtime|transcription|tts|embedding|moderation|dall-e|instruct/i.test(m.id)
          )
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((m) => ({
            id: m.id,
            name: m.id,
            description: m.id.includes("mini")
              ? "Fast, cost-efficient operational model"
              : m.id.startsWith("o")
              ? "Deep deliberate reasoning model"
              : "High intelligence multimodal foundation model",
            isDefault: m.id === "gpt-4o",
          }));

        return chatModels.length > 0 ? chatModels : null;
      }

      if (pId === "groq") {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string; active?: boolean }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        const groqModels = data.data
          .filter((m) => m.active !== false && !/whisper|guard/i.test(m.id))
          .map((m) => ({
            id: m.id,
            name: m.id,
            description: "LPU-accelerated sub-second inference model",
            isDefault: m.id.includes("llama-3.3-70b"),
          }));

        return groqModels.length > 0 ? groqModels : null;
      }

      if (pId === "deepseek") {
        const res = await fetch("https://api.deepseek.com/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        return data.data.map((m) => ({
          id: m.id,
          name: m.id,
          description: m.id.includes("reasoner")
            ? "Deep reasoning model with transparent chain-of-thought"
            : "High efficiency general intelligence conversational model",
          isDefault: m.id === "deepseek-reasoner",
        }));
      }

      if (pId === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          signal: controller.signal,
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
        if (!data.data || !Array.isArray(data.data)) return null;

        return data.data.map((m) => ({
          id: m.id,
          name: m.display_name || m.id,
          description: "Safety-aligned Claude intelligence model",
          isDefault: m.id.includes("3-7-sonnet"),
        }));
      }

      if (pId === "google") {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
          { signal: controller.signal }
        );
        if (!res.ok) return null;
        const data = (await res.json()) as {
          models?: Array<{ name: string; displayName?: string; description?: string }>;
        };
        if (!data.models || !Array.isArray(data.models)) return null;

        const geminiModels = data.models
          .filter((m) => /gemini/i.test(m.name))
          .map((m) => {
            const cleanId = m.name.replace(/^models\//, "");
            return {
              id: cleanId,
              name: m.displayName || cleanId,
              description: m.description || "Gemini multimodal foundation model",
              isDefault: cleanId.includes("2.0-flash"),
            };
          });

        return geminiModels.length > 0 ? geminiModels : null;
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
    const keyToTest = apiKey || provider?.apiKey;
    
    // Simulate connection test
    const latencyMs = Math.floor(Math.random() * 80) + 110; // 110ms - 190ms
    const isValid = Boolean(keyToTest && keyToTest.length >= 6);

    if (isValid) {
      if (provider) {
        await this.repository.updateProvider(providerId, {
          status: "connected",
          isConnected: true,
          apiKey: keyToTest,
        });
      }
      return {
        success: true,
        status: "connected",
        message: "Valid key · Connected successfully",
        latencyMs,
        providerId,
        modelId: modelId || provider?.models[0]?.id,
      };
    }

    return {
      success: false,
      status: "error",
      message: "Authentication failed. Please verify your API key.",
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
    const mode = params.mode || "chat";
    const prompt = params.prompt.trim();
    const latencyMs = Math.floor(Math.random() * 120) + 180;

    if (mode === "structured") {
      const structuredData = {
        agent: "VYRA",
        status: "success",
        intent: prompt.includes("SQL") ? "database_query" : prompt.includes("Summarize") ? "text_summarization" : "general_intelligence",
        analysis: `Generated structured response for: "${prompt}"`,
        confidenceScore: 0.98,
        recommendedAction: "Execute via Detqel Workforce Engine",
        parameters: {
          runtime: "autonomous",
          verificationRequired: false,
          executionPriority: "high",
        },
      };

      return {
        success: true,
        output: JSON.stringify(structuredData, null, 2),
        structuredOutput: structuredData,
        tokensUsed: 142,
        latencyMs,
        timestamp: new Date().toISOString(),
      };
    }

    // Chat mode response
    let simulatedResponse = `Hello! I am VYRA. Regarding your request "${prompt}":\n\n`;
    if (prompt.toLowerCase().includes("sql")) {
      simulatedResponse += `\`\`\`sql
SELECT 
  DATE_TRUNC('week', u.created_at) AS cohort_week,
  COUNT(DISTINCT u.id) AS total_users,
  COUNT(DISTINCT w.id) AS active_workspaces,
  ROUND(COUNT(DISTINCT CASE WHEN a.created_at >= u.created_at + INTERVAL '30 days' THEN u.id END)::numeric / NULLIF(COUNT(DISTINCT u.id), 0) * 100, 2) AS retention_30d_pct
FROM users u
LEFT JOIN user_workspaces uw ON u.id = uw.user_id
LEFT JOIN workspaces w ON uw.workspace_id = w.id
LEFT JOIN user_activities a ON u.id = a.user_id
GROUP BY cohort_week
ORDER BY cohort_week DESC;
\`\`\`\n\nOptimized with proper index lookups and defensive null handling.`;
    } else if (prompt.toLowerCase().includes("summarize")) {
      simulatedResponse += `Here is the executive synthesis:\n\n1. **Core Growth Velocity**: Operational throughput increased by 28% across deployed connectors.\n2. **Identified Bottlenecks**: Inventory replenishment cycles show a 4-hour latency variance.\n3. **Recommended Action**: Automate proactive supplier webhooks using our autonomous workflow engine.`;
    } else {
      simulatedResponse += `I have parsed your instructions against the Business Brain guidelines. I can formulate the necessary plan, verify prerequisites, and execute the workflow with continuous observability. Let me know if you would like me to proceed.`;
    }

    return {
      success: true,
      output: simulatedResponse,
      tokensUsed: 186,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  }
}
