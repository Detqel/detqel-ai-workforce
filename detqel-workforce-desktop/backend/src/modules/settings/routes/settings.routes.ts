import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { SettingsController } from "../controllers/settings.controller.js";
import { createRouteGuards, optionalWorkspaceFromBody, optionalWorkspaceFromQuery, workspaceFromQuery } from "../../../shared/security/workspace-guard.js";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  const controller = new SettingsController(app.services.settings);
  const guards = createRouteGuards(app);
  // Provider credentials are shared by the installation: listing is open to any signed-in user (secrets are never
  // returned), but changing or using them requires administrator access.
  const administrator = guards.administrator();
  const usesCredentialsFromQuery = guards.credentialUse(optionalWorkspaceFromQuery());
  const usesCredentialsFromBody = guards.credentialUse(optionalWorkspaceFromBody());

  app.get("/settings/providers", {
    schema: { tags: [API_TAG_NAMES.settings], summary: "List AI providers with available models. Saved API keys are never returned" },
  }, controller.listProviders.bind(controller));

  app.put("/settings/providers/:id", {
    preHandler: administrator,
    schema: { tags: [API_TAG_NAMES.settings], summary: "Update AI provider configuration and credentials" },
  }, controller.updateProvider.bind(controller));

  app.get("/settings/providers/:id/models", {
    preHandler: usesCredentialsFromQuery,
    schema: { tags: [API_TAG_NAMES.settings], summary: "Fetch models for an AI provider using the saved key" },
  }, controller.getProviderModels.bind(controller));

  app.post("/settings/providers/:id/models", {
    preHandler: usesCredentialsFromBody,
    schema: { tags: [API_TAG_NAMES.settings], summary: "Fetch models for an AI provider using a key supplied in the request body" },
  }, controller.lookupProviderModels.bind(controller));

  app.get("/v1/models", {
    preHandler: usesCredentialsFromQuery,
    schema: { tags: [API_TAG_NAMES.settings], summary: "Fetch models endpoint compatible with /api/v1/models" },
  }, controller.getProviderModels.bind(controller));

  app.post("/settings/test-connection", {
    preHandler: usesCredentialsFromBody,
    schema: { tags: [API_TAG_NAMES.settings], summary: "Test connection to AI model provider" },
  }, controller.testConnection.bind(controller));

  app.get("/settings/vyra", {
    preHandler: guards.workspace("read", workspaceFromQuery()),
    schema: { tags: [API_TAG_NAMES.settings], summary: "Get VYRA agent personality, model, instructions, and templates for a workspace" },
  }, controller.getVyraSettings.bind(controller));

  app.put("/settings/vyra", {
    preHandler: guards.workspace("manage", workspaceFromQuery()),
    schema: { tags: [API_TAG_NAMES.settings], summary: "Update VYRA agent personality, model, instructions, and configuration" },
  }, controller.updateVyraSettings.bind(controller));

  app.post("/settings/vyra/test-prompt", {
    preHandler: usesCredentialsFromBody,
    schema: { tags: [API_TAG_NAMES.settings], summary: "Execute a test sample prompt through VYRA" },
  }, controller.testPrompt.bind(controller));
};
