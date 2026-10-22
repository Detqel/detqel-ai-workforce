import { API_TAG_NAMES } from "../../../constants/apiConstants.js";
import type { FastifyPluginAsync } from "fastify";
import { LookupController } from "../controllers/lookup.controller.js";
import { workspaceQuerySchema } from "../../../shared/validation/http.schemas.js";

export const lookupRoutes: FastifyPluginAsync = async (app) => {
    app.addHook("preHandler", async request => {
        app.services.sessions.verify(request.headers.authorization);
        if (request.method !== "GET") {
            const { workspaceId } = workspaceQuerySchema.parse(request.query);
            await app.services.connectionAccess.authorize(request.headers.authorization, workspaceId, true);
        }
    });
    const controller = new LookupController(app.services.lookups);
    app.get("/lookups/:resource", { schema: { tags: [API_TAG_NAMES.lookups], summary: "List lookup values" } }, controller.list.bind(controller));
    app.get("/lookups/:resource/:id", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Get lookup value" } }, controller.getById.bind(controller));
    app.post("/lookups/:resource", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Create lookup value" } }, controller.create.bind(controller));
    app.patch("/lookups/:resource/:id", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Update lookup value" } }, controller.update.bind(controller));
    app.delete("/lookups/:resource/:id", { schema: { tags: [API_TAG_NAMES.lookups], summary: "Delete lookup value" } }, controller.delete.bind(controller));
};
