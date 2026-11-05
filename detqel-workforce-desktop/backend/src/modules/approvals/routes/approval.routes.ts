import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { createRouteGuards, idParam, workspaceFromBody, workspaceFromQuery } from "../../../shared/security/workspace-guard.js";
import { ApprovalController } from "../controllers/approval.controller.js";
export const approvalRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ApprovalController(app.services.approvals);
    const guards = createRouteGuards(app);
    app.get("/approvals", {
        preHandler: guards.workspace("read", workspaceFromQuery()),
        schema: { tags: [API_TAG_NAMES.approvals], summary: "List human-in-the-loop approvals" },
    }, controller.list.bind(controller));
    app.post("/approvals", {
        preHandler: guards.workspace("write", workspaceFromBody()),
        schema: { tags: [API_TAG_NAMES.approvals], summary: "Submit human approval request" },
    }, controller.create.bind(controller));
    app.post("/approvals/:id/review", {
        preHandler: guards.workspace("write", request => app.services.approvals.requireWorkspaceId(idParam(request))),
        schema: { tags: [API_TAG_NAMES.approvals], summary: "Review and resolve approval request" },
    }, controller.review.bind(controller));
};
