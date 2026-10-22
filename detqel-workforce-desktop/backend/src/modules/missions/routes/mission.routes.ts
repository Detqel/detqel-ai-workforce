import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { MissionController } from "../controllers/mission.controller.js";
export const missionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new MissionController(app.services.missions);
    app.get("/missions", {
        schema: { tags: [API_TAG_NAMES.missions], summary: "List missions" },
    }, controller.list.bind(controller));
    app.post("/missions", {
        schema: { tags: [API_TAG_NAMES.missions], summary: "Launch new workforce mission" },
    }, controller.create.bind(controller));
    app.get("/missions/:id", {
        schema: { tags: [API_TAG_NAMES.missions], summary: "Get mission details and event timeline" },
    }, controller.getById.bind(controller));
    app.patch("/missions/:id/status", {
        schema: { tags: [API_TAG_NAMES.missions], summary: "Transition mission lifecycle status" },
    }, controller.updateStatus.bind(controller));
    app.post("/missions/:id/events", {
        schema: { tags: [API_TAG_NAMES.missions], summary: "Append mission event stream item" },
    }, controller.logEvent.bind(controller));
    app.post("/missions/:id/sources", {
        schema: { tags: [API_TAG_NAMES.missions], summary: "Attach data source or citation to mission" },
    }, controller.addSource.bind(controller));
};
