import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { WorkforceController } from "../controllers/agent.controller.js";
export const agentRoutes: FastifyPluginAsync = async (app) => {
    const controller = new WorkforceController(app.services.workforce);
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
