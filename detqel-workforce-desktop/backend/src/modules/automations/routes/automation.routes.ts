import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { createRouteGuards, idParam, workspaceFromBody, workspaceFromQuery } from "../../../shared/security/workspace-guard.js";
import { AutomationController } from "../controllers/automation.controller.js";
export const automationRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AutomationController(app.services.automations);
    const guards = createRouteGuards(app);
    // An automation is addressed by its own id, so its workspace is looked up before access is decided.
    const automationWorkspace = (request: Parameters<typeof idParam>[0]) => app.services.automations.requireWorkspaceId(idParam(request));
    app.get("/automations", {
        preHandler: guards.workspace("read", workspaceFromQuery()),
        schema: { tags: [API_TAG_NAMES.automations], summary: "List autonomous workflows" },
    }, controller.list.bind(controller));
    app.post("/automations", {
        preHandler: guards.workspace("write", workspaceFromBody()),
        schema: { tags: [API_TAG_NAMES.automations], summary: "Create automation recipe" },
    }, controller.create.bind(controller));
    app.post("/automations/:id/trigger", {
        preHandler: guards.workspace("write", automationWorkspace),
        schema: { tags: [API_TAG_NAMES.automations], summary: "Trigger automation execution run" },
    }, controller.trigger.bind(controller));
    app.get("/automations/:id/runs", {
        preHandler: guards.workspace("read", automationWorkspace),
        schema: { tags: [API_TAG_NAMES.automations], summary: "List run history for automation" },
    }, controller.listRuns.bind(controller));
    app.get("/scheduled-tasks", {
        preHandler: guards.workspace("read", workspaceFromQuery()),
        schema: { tags: [API_TAG_NAMES.automations], summary: "List recurring scheduled tasks" },
    }, controller.listTasks.bind(controller));
    app.post("/scheduled-tasks", {
        preHandler: guards.workspace("write", workspaceFromBody()),
        schema: { tags: [API_TAG_NAMES.automations], summary: "Schedule new background task or cron trigger" },
    }, controller.createTask.bind(controller));
};
