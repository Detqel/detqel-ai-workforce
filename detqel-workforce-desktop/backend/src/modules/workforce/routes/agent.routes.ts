import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { WorkforceController } from "../controllers/agent.controller.js";

export const agentRoutes: FastifyPluginAsync = async (app) => {
    const controller = new WorkforceController(app.services.workforce);

    // Marketplace routes (registered before /agents/:id to avoid parameter collisions)
    app.get("/agents/sections", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List marketplace sections with counts" },
    }, controller.listSections.bind(controller));

    app.get("/agents/templates", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List agent marketplace templates" },
    }, controller.listTemplates.bind(controller));

    app.get("/agents/templates/:id", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get agent template by ID or slug" },
    }, controller.getTemplate.bind(controller));

    app.post("/agents/recruit", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Recruit an agent from template into workspace" },
    }, controller.recruitTemplate.bind(controller));

    app.post("/agents/custom", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Create a custom agent for the team" },
    }, controller.createCustomAgent.bind(controller));

    app.get("/agents/recruited", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List recruited organization agents for workspace" },
    }, controller.listRecruited.bind(controller));

    // Team routes
    app.get("/teams", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List AI agent teams for workspace" },
    }, controller.listTeams.bind(controller));

    app.post("/teams", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Create an AI agent team" },
    }, controller.createTeam.bind(controller));

    app.get("/teams/:id", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get team by ID with members" },
    }, controller.getTeam.bind(controller));

    app.patch("/teams/:id", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Update team details" },
    }, controller.updateTeam.bind(controller));

    app.delete("/teams/:id", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Delete an AI agent team" },
    }, controller.deleteTeam.bind(controller));

    app.post("/teams/:id/members", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Add an agent to a team" },
    }, controller.addTeamMember.bind(controller));

    app.delete("/teams/:id/members/:agentId", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Remove an agent from a team" },
    }, controller.removeTeamMember.bind(controller));

    // Standard workforce routes
    app.get("/agents", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List agents" },
    }, controller.list.bind(controller));

    app.post("/agents", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Create an AI agent" },
    }, controller.create.bind(controller));

    app.get("/agents/:id", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get agent details with connections and memory" },
    }, controller.getById.bind(controller));

    app.post("/agents/:id/connections", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Attach external connection to agent" },
    }, controller.attachConnection.bind(controller));

    app.get("/agents/:id/memory", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get memory logs for specific agent" },
    }, controller.listMemories.bind(controller));

    app.post("/agents/:id/memory", {
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Add memory record to agent" },
    }, controller.addMemory.bind(controller));
};
