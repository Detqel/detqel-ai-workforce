import type { FastifyPluginAsync } from "fastify";
import { BusinessController } from "../controllers/business.controller.js";
export const businessRoutes: FastifyPluginAsync = async (app) => {
    const controller = new BusinessController(app.services.business);
    app.get("/business/workspaces/:workspaceId/profile", {
        schema: { tags: ["Business Brain"], summary: "Get business profile" },
    }, controller.getProfile.bind(controller));
    app.put("/business/workspaces/:workspaceId/profile", {
        schema: { tags: ["Business Brain"], summary: "Upsert business profile" },
    }, controller.upsertProfile.bind(controller));
    app.get("/business/workspaces/:workspaceId/knowledge", {
        schema: { tags: ["Business Brain"], summary: "List business knowledge items" },
    }, controller.listKnowledge.bind(controller));
    app.post("/business/workspaces/:workspaceId/knowledge", {
        schema: { tags: ["Business Brain"], summary: "Add knowledge document or note" },
    }, controller.addKnowledge.bind(controller));
    app.delete("/business/knowledge/:id", {
        schema: { tags: ["Business Brain"], summary: "Delete knowledge item" },
    }, controller.deleteKnowledge.bind(controller));
    app.get("/business/workspaces/:workspaceId/goals", {
        schema: { tags: ["Business Brain"], summary: "List strategic business goals" },
    }, controller.listGoals.bind(controller));
    app.post("/business/workspaces/:workspaceId/goals", {
        schema: { tags: ["Business Brain"], summary: "Create strategic goal" },
    }, controller.createGoal.bind(controller));
    app.get("/business/workspaces/:workspaceId/rules", {
        schema: { tags: ["Business Brain"], summary: "List business policies and constraints" },
    }, controller.listRules.bind(controller));
    app.post("/business/workspaces/:workspaceId/rules", {
        schema: { tags: ["Business Brain"], summary: "Create business rule/policy" },
    }, controller.createRule.bind(controller));
    app.get("/business/workspaces/:workspaceId/state", {
        schema: { tags: ["Business Brain"], summary: "Get latest business state telemetry" },
    }, controller.getState.bind(controller));
    app.post("/business/workspaces/:workspaceId/state", {
        schema: { tags: ["Business Brain"], summary: "Record business state snapshot" },
    }, controller.recordState.bind(controller));
    app.get("/business/workspaces/:workspaceId/memory", {
        schema: { tags: ["Business Brain"], summary: "List historical business memories and findings" },
    }, controller.listMemories.bind(controller));
    app.post("/business/workspaces/:workspaceId/memory", {
        schema: { tags: ["Business Brain"], summary: "Add memory insight or decision log" },
    }, controller.addMemory.bind(controller));
};
