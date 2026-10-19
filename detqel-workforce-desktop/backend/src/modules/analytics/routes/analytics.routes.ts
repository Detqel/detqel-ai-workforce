import type { FastifyPluginAsync } from "fastify";
import { AnalyticsController } from "../controllers/analytics.controller.js";
export const analyticsRoutes: FastifyPluginAsync = async (app) => {
    const controller = new AnalyticsController(app.services.analytics);
    app.get("/analytics/predictions", {
        schema: { tags: ["Analytics & Intelligence"], summary: "List business predictions" },
    }, controller.listPredictions.bind(controller));
    app.post("/analytics/predictions", {
        schema: { tags: ["Analytics & Intelligence"], summary: "Record forecasting prediction model output" },
    }, controller.createPrediction.bind(controller));
    app.get("/analytics/simulations", {
        schema: { tags: ["Analytics & Intelligence"], summary: "List scenario simulations" },
    }, controller.listSimulations.bind(controller));
    app.post("/analytics/simulations", {
        schema: { tags: ["Analytics & Intelligence"], summary: "Create scenario simulation" },
    }, controller.createSimulation.bind(controller));
    app.get("/analytics/activity-heatmap", {
        schema: {
            tags: ["Analytics & Intelligence"],
            summary: "Get aggregated 4-week activity heatmap directly from database",
        },
    }, controller.getHeatmap.bind(controller));
    app.get("/analytics/activities", {
        schema: {
            tags: ["Analytics & Intelligence"],
            summary: "List user activities in workspace",
        },
    }, controller.listActivities.bind(controller));
    app.post("/analytics/activities", {
        schema: {
            tags: ["Analytics & Intelligence"],
            summary: "Record user or agent activity in workspace",
        },
    }, controller.recordActivity.bind(controller));
};
