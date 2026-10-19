import type { FastifyReply, FastifyRequest } from "fastify";
import type { SettingsService } from "../services/settings.service.js";

export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  async listProviders(_req: FastifyRequest, reply: FastifyReply) {
    const providers = await this.service.listProviders();
    return reply.send({
      providers,
      message: providers.length === 0 ? "No providers configured" : undefined,
    });
  }

  async updateProvider(
    req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
    reply: FastifyReply
  ) {
    const { id } = req.params;
    const updated = await this.service.updateProvider(id, req.body);
    if (!updated) {
      return reply.status(404).send({ error: "Provider not found" });
    }
    return reply.send({ provider: updated });
  }

  async getProviderModels(
    req: FastifyRequest<{
      Params: { id?: string };
      Querystring: { apiKey?: string; provider?: string };
    }>,
    reply: FastifyReply
  ) {
    const targetProviderId = req.params.id || req.query.provider;
    if (!targetProviderId) {
      return reply.status(400).send({ error: "providerId is required" });
    }
    const models = await this.service.getProviderModels(targetProviderId, req.query.apiKey);
    return reply.send({ providerId: targetProviderId, models });
  }

  async testConnection(
    req: FastifyRequest<{ Body: { providerId: string; apiKey?: string; modelId?: string } }>,
    reply: FastifyReply
  ) {
    const { providerId, apiKey, modelId } = req.body;
    if (!providerId) {
      return reply.status(400).send({ error: "providerId is required" });
    }
    const result = await this.service.testConnection(providerId, apiKey, modelId);
    return reply.send(result);
  }

  async getVyraSettings(
    req: FastifyRequest<{ Querystring: { workspaceId?: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.query;
    const settings = await this.service.getVyraSettings(workspaceId);
    return reply.send({ settings });
  }

  async updateVyraSettings(
    req: FastifyRequest<{ Body: Record<string, unknown>; Querystring: { workspaceId?: string } }>,
    reply: FastifyReply
  ) {
    const { workspaceId } = req.query;
    const updated = await this.service.updateVyraSettings(workspaceId, req.body);
    return reply.send({ settings: updated });
  }

  async testPrompt(
    req: FastifyRequest<{
      Body: {
        prompt: string;
        providerId?: string;
        modelId?: string;
        apiKey?: string;
        mode?: "chat" | "structured";
        systemPrompt?: string;
      };
    }>,
    reply: FastifyReply
  ) {
    const { prompt, providerId, modelId, apiKey, mode, systemPrompt } = req.body;
    if (!prompt) {
      return reply.status(400).send({ error: "prompt is required" });
    }
    const result = await this.service.testPrompt({
      prompt,
      providerId,
      modelId,
      apiKey,
      mode,
      systemPrompt,
    });
    return reply.send(result);
  }
}
