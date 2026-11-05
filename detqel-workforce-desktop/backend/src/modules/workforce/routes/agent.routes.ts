import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../../../shared/errors/app-error.js";
import { requireUserId } from "../../../shared/security/request-context.js";
import { createRouteGuards, idParam, workspaceFromBody, workspaceFromQuery } from "../../../shared/security/workspace-guard.js";
import type { WorkspaceAccess } from "../../workspaces/services/workspace-access.service.js";
import { WorkforceController } from "../controllers/agent.controller.js";
export const agentRoutes: FastifyPluginAsync = async (app) => {
    const controller = new WorkforceController(app.services.workforce);
    const guards = createRouteGuards(app);
    const readFromQuery = guards.workspace("read", workspaceFromQuery());
    const writeFromQuery = guards.workspace("write", workspaceFromQuery());
    const writeFromBody = guards.workspace("write", workspaceFromBody());
    // Teams addressed by their own id (member changes) resolve their workspace first.
    const writeTeam = guards.workspace("write", request => app.services.workforce.requireTeamWorkspaceId(idParam(request)));
    // Platform agents are shared by every workspace: anyone signed in may read them, nobody may change them here.
    const agentAccess = (access: WorkspaceAccess) => async (request: FastifyRequest) => {
        const scope = await app.services.workforce.getAgentScope(idParam(request));
        if (scope.workspaceId === null || scope.isPlatform) {
            if (access !== "read") throw new AppError(403, "Platform agents cannot be changed");
            return;
        }
        await app.services.workspaceAccess.authorize(requireUserId(request), scope.workspaceId, access);
    };
    // Marketplace routes (registered before /agents/:id to avoid parameter collisions)
    // The marketplace catalog is shared reference data: any signed-in user may browse it.
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
        preHandler: writeFromBody,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Recruit an agent from template into workspace" },
    }, controller.recruitTemplate.bind(controller));
    app.post("/agents/custom", {
        preHandler: writeFromBody,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Create a custom agent for the team" },
    }, controller.createCustomAgent.bind(controller));
    app.get("/agents/recruited", {
        preHandler: readFromQuery,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List recruited organization agents for workspace" },
    }, controller.listRecruited.bind(controller));
    // Team routes
    app.get("/teams", {
        preHandler: readFromQuery,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List AI agent teams for workspace" },
    }, controller.listTeams.bind(controller));
    app.post("/teams", {
        preHandler: writeFromBody,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Create an AI agent team" },
    }, controller.createTeam.bind(controller));
    app.get("/teams/:id", {
        preHandler: readFromQuery,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get team by ID with members" },
    }, controller.getTeam.bind(controller));
    app.patch("/teams/:id", {
        preHandler: writeFromQuery,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Update team details" },
    }, controller.updateTeam.bind(controller));
    app.delete("/teams/:id", {
        preHandler: writeFromQuery,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Delete an AI agent team" },
    }, controller.deleteTeam.bind(controller));
    app.post("/teams/:id/members", {
        preHandler: writeTeam,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Add an agent to a team" },
    }, controller.addTeamMember.bind(controller));
    app.delete("/teams/:id/members/:agentId", {
        preHandler: writeTeam,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Remove an agent from a team" },
    }, controller.removeTeamMember.bind(controller));
    // Standard workforce routes
    app.get("/agents", {
        preHandler: readFromQuery,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "List agents available to a workspace" },
    }, controller.list.bind(controller));
    app.post("/agents", {
        preHandler: writeFromBody,
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Create an AI agent" },
    }, controller.create.bind(controller));
    app.get("/agents/:id", {
        preHandler: agentAccess("read"),
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get agent details with connections and memory" },
    }, controller.getById.bind(controller));
    app.post("/agents/:id/connections", {
        preHandler: agentAccess("write"),
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Attach external connection to agent" },
    }, controller.attachConnection.bind(controller));
    app.get("/agents/:id/memory", {
        preHandler: agentAccess("read"),
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Get memory logs for specific agent" },
    }, controller.listMemories.bind(controller));
    app.post("/agents/:id/memory", {
        preHandler: agentAccess("write"),
        schema: { tags: [API_TAG_NAMES.workforce], summary: "Add memory record to agent" },
    }, controller.addMemory.bind(controller));
};
