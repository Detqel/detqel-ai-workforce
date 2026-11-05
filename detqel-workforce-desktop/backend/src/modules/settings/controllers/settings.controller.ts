import type { FastifyReply, FastifyRequest } from "fastify";
import type { SettingsService } from "../services/settings.service.js";
import {
  providerIdParamsSchema,
  providerModelsBodySchema,
  providerModelsQuerySchema,
  testConnectionSchema,
  testPromptSchema,
  updateProviderSchema,
  updateVyraSettingsSchema,
  workspaceScopeQuerySchema,
} from "../validation/settings.schemas.js";

export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  async listProviders(_req: FastifyRequest, reply: FastifyReply) {
    const providers = await this.service.listProviders();
    return reply.send({
      providers,
      message: providers.length === 0 ? "No providers configured" : undefined,
    });
  }

  async updateProvider(req: FastifyRequest, reply: FastifyReply) {
    const { id } = providerIdParamsSchema.parse(req.params);
    const updated = await this.service.updateProvider(id, updateProviderSchema.parse(req.body));
    if (!updated) {
      return reply.status(404).send({ error: "Provider not found" });
    }
    return reply.send({ provider: updated });
  }

  /** Lists models with the key saved on the server. A key is never accepted in the URL. */
  async getProviderModels(req: FastifyRequest, reply: FastifyReply) {
    const { id } = providerIdParamsSchema.partial().parse(req.params);
    const query = providerModelsQuerySchema.parse(req.query);
    const targetProviderId = id || query.provider;
    if (!targetProviderId) {
      return reply.status(400).send({ error: "providerId is required" });
    }
    const models = await this.service.getProviderModels(targetProviderId, { workspaceId: query.workspaceId });
    return reply.send({ providerId: targetProviderId, models });
  }

  /** Lists models with a key typed by the user, sent in the request body so it never appears in a URL. */
  async lookupProviderModels(req: FastifyRequest, reply: FastifyReply) {
    const { id } = providerIdParamsSchema.parse(req.params);
    const body = providerModelsBodySchema.parse(req.body ?? {});
    const models = await this.service.getProviderModels(id, body);
    return reply.send({ providerId: id, models });
  }

  async testConnection(req: FastifyRequest, reply: FastifyReply) {
    const { providerId, apiKey, modelId, workspaceId } = testConnectionSchema.parse(req.body);
    return reply.send(await this.service.testConnection(providerId, apiKey, modelId, workspaceId));
  }

  async getVyraSettings(req: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = workspaceScopeQuerySchema.parse(req.query);
    return reply.send({ settings: await this.service.getVyraSettings(workspaceId) });
  }

  async updateVyraSettings(req: FastifyRequest, reply: FastifyReply) {
    const { workspaceId } = workspaceScopeQuerySchema.parse(req.query);
    const updated = await this.service.updateVyraSettings(workspaceId, updateVyraSettingsSchema.parse(req.body));
    return reply.send({ settings: updated });
  }

  async testPrompt(req: FastifyRequest, reply: FastifyReply) {
    return reply.send(await this.service.testPrompt(testPromptSchema.parse(req.body)));
  }
}
