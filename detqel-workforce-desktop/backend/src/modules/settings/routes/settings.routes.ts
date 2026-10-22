import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { SettingsController } from "../controllers/settings.controller.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const controller = new SettingsController(app.services.settings);

  app.get("/settings/providers", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "List all AI providers and available models from database table" },
  }, controller.listProviders.bind(controller));

  app.put("/settings/providers/:id", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Update AI provider configuration and credentials" },
  }, controller.updateProvider.bind(controller));

  app.get("/settings/providers/:id/models", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Fetch models for a specific AI provider from provider /v1/models route" },
  }, controller.getProviderModels.bind(controller));

  app.get("/v1/models", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Fetch models endpoint compatible with /api/v1/models" },
  }, controller.getProviderModels.bind(controller));

  app.post("/settings/test-connection", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Test connection to AI model provider" },
  }, controller.testConnection.bind(controller));

  app.get("/settings/vyra", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Get VYRA agent personality, model, instructions, and templates" },
  }, controller.getVyraSettings.bind(controller));

  app.put("/settings/vyra", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Update VYRA agent personality, model, instructions, and configuration" },
  }, controller.updateVyraSettings.bind(controller));

  app.post("/settings/vyra/test-prompt", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "Execute a test sample prompt through VYRA" },
  }, controller.testPrompt.bind(controller));
};
