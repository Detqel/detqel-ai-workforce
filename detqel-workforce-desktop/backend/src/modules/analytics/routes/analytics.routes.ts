import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { createRouteGuards, workspaceFromBody, workspaceFromQuery } from "../../../shared/security/workspace-guard.js";
import { AnalyticsController } from "../controllers/analytics.controller.js";
export const analyticsRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AnalyticsController(app.services.analytics);
    const guards = createRouteGuards(app);
    const readFromQuery = guards.workspace("read", workspaceFromQuery());
    const writeFromBody = guards.workspace("write", workspaceFromBody());
    app.get("/analytics/predictions", {
        preHandler: readFromQuery,
        schema: { tags: [API_TAG_NAMES.analytics], summary: "List business predictions" },
    }, controller.listPredictions.bind(controller));
    app.post("/analytics/predictions", {
        preHandler: writeFromBody,
        schema: { tags: [API_TAG_NAMES.analytics], summary: "Record forecasting prediction model output" },
    }, controller.createPrediction.bind(controller));
    app.get("/analytics/simulations", {
        preHandler: readFromQuery,
        schema: { tags: [API_TAG_NAMES.analytics], summary: "List scenario simulations" },
    }, controller.listSimulations.bind(controller));
    app.post("/analytics/simulations", {
        preHandler: writeFromBody,
        schema: { tags: [API_TAG_NAMES.analytics], summary: "Create scenario simulation" },
    }, controller.createSimulation.bind(controller));
    app.get("/analytics/activity-heatmap", {
        preHandler: readFromQuery,
        schema: {
            tags: [API_TAG_NAMES.analytics],
            summary: "Get aggregated 4-week activity heatmap directly from database",
        },
    }, controller.getHeatmap.bind(controller));
    app.get("/analytics/activities", {
        preHandler: readFromQuery,
        schema: {
            tags: [API_TAG_NAMES.analytics],
            summary: "List user activities in workspace",
        },
    }, controller.listActivities.bind(controller));
    app.post("/analytics/activities", {
        // Any member may record their own activity, so this only needs read access. The user is always the caller.
        preHandler: guards.workspace("read", workspaceFromBody()),
        schema: {
            tags: [API_TAG_NAMES.analytics],
            summary: "Record the signed-in user's activity in a workspace",
        },
    }, controller.recordActivity.bind(controller));
};
