import type { FastifyPluginAsync } from "fastify";
import { AutomationController } from "../controllers/automation.controller.js";
export const automationRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AutomationController(app.services.automations);
    app.get("/automations", {
        schema: { tags: ["Automations"], summary: "List autonomous workflows" },
    }, controller.list.bind(controller));
    app.post("/automations", {
        schema: { tags: ["Automations"], summary: "Create automation recipe" },
    }, controller.create.bind(controller));
    app.post("/automations/:id/trigger", {
        schema: { tags: ["Automations"], summary: "Trigger automation execution run" },
    }, controller.trigger.bind(controller));
    app.get("/automations/:id/runs", {
        schema: { tags: ["Automations"], summary: "List run history for automation" },
    }, controller.listRuns.bind(controller));
    app.get("/scheduled-tasks", {
        schema: { tags: ["Automations"], summary: "List recurring scheduled tasks" },
    }, controller.listTasks.bind(controller));
    app.post("/scheduled-tasks", {
        schema: { tags: ["Automations"], summary: "Schedule new background task or cron trigger" },
    }, controller.createTask.bind(controller));
};
