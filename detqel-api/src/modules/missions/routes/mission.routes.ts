import type { FastifyPluginAsync } from "fastify";
import { MissionController } from "../controllers/mission.controller.js";
export const missionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new MissionController(app.services.missions);
    app.get("/missions", {
        schema: { tags: ["Missions & Command Center"], summary: "List missions" },
    }, controller.list.bind(controller));
    app.post("/missions", {
        schema: { tags: ["Missions & Command Center"], summary: "Launch new workforce mission" },
    }, controller.create.bind(controller));
    app.get("/missions/:id", {
        schema: { tags: ["Missions & Command Center"], summary: "Get mission details and event timeline" },
    }, controller.getById.bind(controller));
    app.patch("/missions/:id/status", {
        schema: { tags: ["Missions & Command Center"], summary: "Transition mission lifecycle status" },
    }, controller.updateStatus.bind(controller));
    app.post("/missions/:id/events", {
        schema: { tags: ["Missions & Command Center"], summary: "Append mission event stream item" },
    }, controller.logEvent.bind(controller));
    app.post("/missions/:id/sources", {
        schema: { tags: ["Missions & Command Center"], summary: "Attach data source or citation to mission" },
    }, controller.addSource.bind(controller));
};
