import type { FastifyPluginAsync } from "fastify";
import { WorkforceController } from "../controllers/agent.controller.js";
export const agentRoutes: FastifyPluginAsync = async (app) => {
    const controller = new WorkforceController(app.services.workforce);
    app.get("/agents", {
        schema: { tags: ["AI Workforce"], summary: "List agents" },
    }, controller.list.bind(controller));
    app.post("/agents", {
        schema: { tags: ["AI Workforce"], summary: "Create an AI agent" },
    }, controller.create.bind(controller));
    app.get("/agents/:id", {
        schema: { tags: ["AI Workforce"], summary: "Get agent details with connections and memory" },
    }, controller.getById.bind(controller));
    app.post("/agents/:id/connections", {
        schema: { tags: ["AI Workforce"], summary: "Attach external connection to agent" },
    }, controller.attachConnection.bind(controller));
    app.get("/agents/:id/memory", {
        schema: { tags: ["AI Workforce"], summary: "Get memory logs for specific agent" },
    }, controller.listMemories.bind(controller));
    app.post("/agents/:id/memory", {
        schema: { tags: ["AI Workforce"], summary: "Add memory record to agent" },
    }, controller.addMemory.bind(controller));
};
