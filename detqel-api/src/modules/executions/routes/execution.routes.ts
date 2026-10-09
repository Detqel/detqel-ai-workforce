import type { FastifyPluginAsync } from "fastify";
import { ExecutionController } from "../controllers/execution.controller.js";
export const executionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ExecutionController(app.services.executions);
    app.post("/executions", {
        schema: { tags: ["Executions"], summary: "Enqueue agent execution action" },
    }, controller.create.bind(controller));
    app.patch("/executions/:id", {
        schema: { tags: ["Executions"], summary: "Update execution result or status" },
    }, controller.updateStatus.bind(controller));
};
