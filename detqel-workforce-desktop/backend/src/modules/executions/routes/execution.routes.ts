import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { createRouteGuards, idParam } from "../../../shared/security/workspace-guard.js";
import { ExecutionController } from "../controllers/execution.controller.js";
export const executionRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ExecutionController(app.services.executions);
    const guards = createRouteGuards(app);
    app.post("/executions", {
        // An execution belongs to the workspace of the mission it runs against.
        preHandler: guards.workspace("write", request => app.services.executions.requireMissionWorkspaceId(z.object({ missionId: z.string().uuid() }).parse(request.body ?? {}).missionId)),
        schema: { tags: [API_TAG_NAMES.executions], summary: "Enqueue agent execution action" },
    }, controller.create.bind(controller));
    app.patch("/executions/:id", {
        preHandler: guards.workspace("write", request => app.services.executions.requireWorkspaceId(idParam(request))),
        schema: { tags: [API_TAG_NAMES.executions], summary: "Update execution result or status" },
    }, controller.updateStatus.bind(controller));
};
