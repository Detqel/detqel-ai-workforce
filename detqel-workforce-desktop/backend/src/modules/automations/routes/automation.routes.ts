import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { AutomationController } from "../controllers/automation.controller.js";
export const automationRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AutomationController(app.services.automations);
    app.get("/automations", {
        schema: { tags: [API_TAG_NAMES.automations], summary: "List autonomous workflows" },
    }, controller.list.bind(controller));
    app.post("/automations", {
        schema: { tags: [API_TAG_NAMES.automations], summary: "Create automation recipe" },
    }, controller.create.bind(controller));
    app.post("/automations/:id/trigger", {
        schema: { tags: [API_TAG_NAMES.automations], summary: "Trigger automation execution run" },
    }, controller.trigger.bind(controller));
    app.get("/automations/:id/runs", {
        schema: { tags: [API_TAG_NAMES.automations], summary: "List run history for automation" },
    }, controller.listRuns.bind(controller));
    app.get("/scheduled-tasks", {
        schema: { tags: [API_TAG_NAMES.automations], summary: "List recurring scheduled tasks" },
    }, controller.listTasks.bind(controller));
    app.post("/scheduled-tasks", {
        schema: { tags: [API_TAG_NAMES.automations], summary: "Schedule new background task or cron trigger" },
    }, controller.createTask.bind(controller));
};
