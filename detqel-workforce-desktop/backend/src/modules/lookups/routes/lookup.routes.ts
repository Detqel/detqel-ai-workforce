import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { LookupController } from "../controllers/lookup.controller.js";
import { workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";
import { requireUserId } from "../../../shared/security/request-context.js";

export const lookupRoutes: FastifyPluginAsync = async (app) => {
    // Reading shared reference data needs only a session (checked for every API route). Changing it needs workspace admin access.
    app.addHook("preHandler", async request => {
        if (request.method !== "GET") {
            const { workspaceId } = workspaceQuerySchema.parse(request.query);
            await app.services.workspaceAccess.authorize(requireUserId(request), workspaceId, "manage");
        }
    });
    const controller = new LookupController(app.services.lookups);
    app.get("/lookups/:resource", { schema: { tags: [API_TAG_NAMES.lookups], summary: "List lookup values" } }, controller.list.bind(controller));
    app.get("/lookups/:resource/:id", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Get lookup value" } }, controller.getById.bind(controller));
    app.post("/lookups/:resource", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Create lookup value" } }, controller.create.bind(controller));
    app.patch("/lookups/:resource/:id", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Update lookup value" } }, controller.update.bind(controller));
    app.delete("/lookups/:resource/:id", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Delete lookup value" } }, controller.delete.bind(controller));
};
