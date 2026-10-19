import type { FastifyPluginAsync } from "fastify";
import { ApprovalController } from "../controllers/approval.controller.js";
export const approvalRoutes: FastifyPluginAsync = async (app) => {
    const controller = new ApprovalController(app.services.approvals);
    app.get("/approvals", {
        schema: { tags: ["Approvals"], summary: "List human-in-the-loop approvals" },
    }, controller.list.bind(controller));
    app.post("/approvals", {
        schema: { tags: ["Approvals"], summary: "Submit human approval request" },
    }, controller.create.bind(controller));
    app.post("/approvals/:id/review", {
        schema: { tags: ["Approvals"], summary: "Review and resolve approval request" },
    }, controller.review.bind(controller));
};
