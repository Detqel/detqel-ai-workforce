import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { AnalyticsController } from "../controllers/analytics.controller.js";
export const analyticsRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AnalyticsController(app.services.analytics);
    app.get("/analytics/predictions", {
        schema: { tags: [API_TAG_NAMES.analytics], summary: "List business predictions" },
    }, controller.listPredictions.bind(controller));
    app.post("/analytics/predictions", {
        schema: { tags: [API_TAG_NAMES.analytics], summary: "Record forecasting prediction model output" },
    }, controller.createPrediction.bind(controller));
    app.get("/analytics/simulations", {
        schema: { tags: [API_TAG_NAMES.analytics], summary: "List scenario simulations" },
    }, controller.listSimulations.bind(controller));
    app.post("/analytics/simulations", {
        schema: { tags: [API_TAG_NAMES.analytics], summary: "Create scenario simulation" },
    }, controller.createSimulation.bind(controller));
    app.get("/analytics/activity-heatmap", {
        schema: {
            tags: [API_TAG_NAMES.analytics],
            summary: "Get aggregated 4-week activity heatmap directly from database",
        },
    }, controller.getHeatmap.bind(controller));
    app.get("/analytics/activities", {
        schema: {
            tags: [API_TAG_NAMES.analytics],
            summary: "List user activities in workspace",
        },
    }, controller.listActivities.bind(controller));
    app.post("/analytics/activities", {
        schema: {
            tags: [API_TAG_NAMES.analytics],
            summary: "Record user or agent activity in workspace",
        },
    }, controller.recordActivity.bind(controller));
};
