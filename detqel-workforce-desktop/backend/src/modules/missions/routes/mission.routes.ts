import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { createRouteGuards, idParam, workspaceFromBody, workspaceFromQuery } from "../../../shared/security/workspace-guard.js";
import { MissionController } from "../controllers/mission.controller.js";
export const missionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new MissionController(app.services.missions);
    const guards = createRouteGuards(app);
    // A mission is addressed by its own id, so its workspace is looked up before access is decided.
    const missionWorkspace = (request: Parameters<typeof idParam>[0]) => app.services.missions.requireWorkspaceId(idParam(request));
    app.get("/missions", {
        preHandler: guards.workspace("read", workspaceFromQuery()),
        schema: { tags: [API_TAG_NAMES.missions], summary: "List missions" },
    }, controller.list.bind(controller));
    app.post("/missions", {
        preHandler: guards.workspace("write", workspaceFromBody()),
        schema: { tags: [API_TAG_NAMES.missions], summary: "Launch new workforce mission" },
    }, controller.create.bind(controller));
    app.get("/missions/:id", {
        preHandler: guards.workspace("read", missionWorkspace),
        schema: { tags: [API_TAG_NAMES.missions], summary: "Get mission details and event timeline" },
    }, controller.getById.bind(controller));
    app.patch("/missions/:id/status", {
        preHandler: guards.workspace("write", missionWorkspace),
        schema: { tags: [API_TAG_NAMES.missions], summary: "Transition mission lifecycle status" },
    }, controller.updateStatus.bind(controller));
    app.post("/missions/:id/events", {
        preHandler: guards.workspace("write", missionWorkspace),
        schema: { tags: [API_TAG_NAMES.missions], summary: "Append mission event stream item" },
    }, controller.logEvent.bind(controller));
    app.post("/missions/:id/sources", {
        preHandler: guards.workspace("write", missionWorkspace),
        schema: { tags: [API_TAG_NAMES.missions], summary: "Attach data source or citation to mission" },
    }, controller.addSource.bind(controller));
};
